'use strict';

/**
 * Hauler: assigned to one source. Collects from that source's container /
 * dropped energy and delivers it.
 *
 * Delivery priority:
 *   no filler yet -> spawns/extensions -> towers
 *   controller container (when there is no controller link)
 *   storage
 *   otherwise: drop at the planned controller-container spot so upgraders
 *   can use it before the container exists.
 *
 * Carry capacity is sized from source income and path distance, so we spawn
 * exactly enough haulers instead of a fixed count.
 */

const body = require('./core.body');
const energy = require('./core.energy');
const {travelTo} = require('./core.move');

function pattern(colony) {
  // 2:1 CARRY:MOVE is full speed on roads; before roads use 1:1.
  return colony.level >= 4 ? [CARRY, CARRY, MOVE] : [CARRY, MOVE];
}

function want(colony) {
  const requests = [];
  const noCarriers = colony.count('hauler') === 0 && colony.count('filler') === 0;
  const pat = pattern(colony);
  const carryPerRepeat = pat.filter((p) => p === CARRY).length;

  colony.sources.forEach((source, i) => {
    const work = colony.parts('miner', WORK, (c) => c.memory.src === source.id);
    if (!work) return;
    let rate = Math.min(source.energyCapacity / ENERGY_REGEN_TIME, work * HARVEST_POWER);

    // With a working source link only overflow is left for haulers.
    if (colony.sourceLink(source.id) && colony.storageLink) {
      const container = colony.sourceContainer(source.id);
      if (!container || container.store.getUsedCapacity(RESOURCE_ENERGY) < 1000) return;
      rate = 2;
    }

    const distance = colony.sourceDistance(source);
    const carryNeeded = Math.ceil(rate * distance * 2 * 1.2 / CARRY_CAPACITY) + 1;
    const maxRepeat = Math.ceil(carryNeeded / carryPerRepeat);
    const sample = body.build(pat, colony.room.energyCapacityAvailable, {maxRepeat});
    if (!sample) return;
    const perCreep = body.count(sample, CARRY);
    const wanted = Math.min(4, Math.ceil(carryNeeded / perCreep));
    const have = colony.count('hauler', (c) => c.memory.src === source.id);
    if (have >= wanted) return;

    requests.push({
      role: 'hauler',
      priority: have === 0 ? 1.05 + i * 0.1 : 2.5,
      body: (e) => body.build(pat, e, {maxRepeat}),
      memory: {src: source.id},
      emergency: noCarriers,
    });
  });
  return requests;
}

function deliveryTarget(creep, colony) {
  const hasFiller = colony.storage && colony.count('filler') > 0;
  if (!hasFiller) {
    const fill = energy.findFillTarget(creep, colony, {towers: true});
    if (fill) return fill;
  }
  const ctrl = colony.controllerContainer;
  if (ctrl && !colony.controllerLink && ctrl.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
    return ctrl;
  }
  if (colony.storage && colony.storage.store.getFreeCapacity() > 0) {
    return colony.storage;
  }
  if (ctrl && ctrl.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    return ctrl;
  }
  return undefined;
}

function collect(creep, colony, source) {
  let best;
  let bestAmount = 0;
  const consider = (t, amount) => {
    if (amount > bestAmount) {
      bestAmount = amount;
      best = t;
    }
  };
  const container = colony.sourceContainer(source.id);
  if (container) consider(container, container.store.getUsedCapacity(RESOURCE_ENERGY));
  for (const r of source.pos.findInRange(FIND_DROPPED_RESOURCES, 2)) {
    if (r.resourceType === RESOURCE_ENERGY) consider(r, r.amount);
  }
  for (const t of source.pos.findInRange(FIND_TOMBSTONES, 2)) {
    consider(t, t.store.getUsedCapacity(RESOURCE_ENERGY));
  }

  if (best && bestAmount >= Math.min(50, creep.store.getFreeCapacity())) {
    if (creep.pos.isNearTo(best)) {
      if (best.amount !== undefined) creep.pickup(best);
      else creep.withdraw(best, RESOURCE_ENERGY);
    } else {
      travelTo(creep, best);
    }
    return;
  }
  // Nothing ready: deliver what we have if it's worth it, else wait.
  if (creep.store.getUsedCapacity() >= creep.store.getCapacity() * 0.5) {
    creep.memory.w = true;
    return;
  }
  travelTo(creep, source, {range: 2});
}

function run(creep, colony) {
  if (!creep.memory.src) {
    const s = colony.leastAssignedSource('hauler');
    if (!s) return;
    creep.memory.src = s.id;
  }
  if (creep.memory.w && creep.store.getUsedCapacity() === 0) creep.memory.w = false;
  if (!creep.memory.w && creep.store.getFreeCapacity() === 0) creep.memory.w = true;

  if (!creep.memory.w) {
    const source = Game.getObjectById(creep.memory.src);
    if (!source) {
      travelTo(creep, new RoomPosition(25, 25, creep.memory.home), {range: 20});
      return;
    }
    collect(creep, colony, source);
    return;
  }

  // Deliver non-energy resources (from tombstones) straight to storage.
  if (creep.store.getUsedCapacity() > creep.store.getUsedCapacity(RESOURCE_ENERGY) && colony.storage) {
    if (!creep.pos.isNearTo(colony.storage)) {
      travelTo(creep, colony.storage);
      return;
    }
    for (const res of Object.keys(creep.store)) {
      if (res !== RESOURCE_ENERGY) {
        creep.transfer(colony.storage, res);
        return;
      }
    }
  }

  if (energy.deliver(creep, colony, deliveryTarget)) {
    return;
  }

  // Nowhere to put it: before the controller container exists, drop the
  // energy at its planned spot so upgraders can pick it up.
  const spot = colony.controllerContainerPos;
  if (spot && !colony.controllerContainer) {
    if (creep.pos.isEqualTo(spot)) {
      creep.drop(RESOURCE_ENERGY);
    } else {
      travelTo(creep, spot, {range: 0});
    }
    return;
  }
  travelTo(creep, colony.dropPos, {range: 3});
}

module.exports = {want, run};
