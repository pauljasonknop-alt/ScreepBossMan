'use strict';

/**
 * Shared energy logistics: where to get energy, where to put it.
 *
 * Creeps remember their pickup target in memory.et and their delivery target
 * in memory.ft. The colony turns those into claims at the start of each tick,
 * so two haulers never chase the same extension or the same small pile.
 */

const {travelTo} = require('./core.move');

function energyIn(target) {
  if (!target) {
    return 0;
  }
  if (target.amount !== undefined) {
    return target.resourceType === RESOURCE_ENERGY ? target.amount : 0;
  }
  return target.store ? target.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
}

function unclaimed(colony, target, creep) {
  const claimed = colony.pickupClaims[target.id] || 0;
  const mine = creep.memory.et === target.id ? creep.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
  return energyIn(target) - (claimed - mine);
}

/**
 * Candidate pickup targets in the creep's room.
 *
 * @param {Creep} creep
 * @param {Colony} colony
 * @param {object} opts
 * @param {boolean} [opts.storage=true]
 * @param {boolean} [opts.sourceContainers=true]
 * @param {boolean} [opts.controllerContainer=true]
 * @param {number} [opts.storageMin=0] - leave this much in storage
 * @return {Array}
 */
function candidates(creep, colony, opts) {
  const room = creep.room;
  const list = [];
  const inColony = colony && room.name === colony.name;

  if (opts.storage !== false && room.storage && room.storage.my &&
    energyIn(room.storage) > (opts.storageMin || 0)) {
    list.push(room.storage);
  }
  if (inColony && opts.storage !== false && room.terminal && room.terminal.my &&
    !room.storage && energyIn(room.terminal) > 0) {
    list.push(room.terminal);
  }

  // Before storage: spare spawn energy may be used when nothing is queued.
  if (opts.spawnSurplus && inColony && !colony.storage && colony.lastQueue && colony.lastQueue.length === 0 &&
    room.energyAvailable === room.energyCapacityAvailable) {
    for (const s of colony.fillables) {
      if (energyIn(s) >= 50) list.push(s);
    }
  }

  const ctrlContainer = inColony ? colony.controllerContainer : undefined;
  for (const c of room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_CONTAINER}})) {
    if (ctrlContainer && c.id === ctrlContainer.id) {
      if (opts.controllerContainer === false) {
        continue;
      }
    } else if (opts.sourceContainers === false) {
      continue;
    }
    list.push(c);
  }
  for (const r of room.find(FIND_DROPPED_RESOURCES)) {
    if (r.resourceType === RESOURCE_ENERGY && r.amount >= 50) {
      list.push(r);
    }
  }
  for (const t of room.find(FIND_TOMBSTONES)) {
    if (energyIn(t) >= 50) {
      list.push(t);
    }
  }
  for (const r of room.find(FIND_RUINS)) {
    if (energyIn(r) >= 50) {
      list.push(r);
    }
  }
  return list;
}

function findPickup(creep, colony, opts) {
  const need = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  const threshold = Math.min(need, opts.minAmount || 50);
  let best;
  let bestScore = -Infinity;
  for (const target of candidates(creep, colony, opts)) {
    const available = colony ? unclaimed(colony, target, creep) : energyIn(target);
    if (available < threshold) {
      continue;
    }
    // Prefer close and full: a full container 10 tiles away beats 50 energy next door.
    const score = Math.min(available, need) / need * 20 - creep.pos.getRangeTo(target);
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

function take(creep, target) {
  if (target.amount !== undefined) {
    return creep.pickup(target);
  }
  return creep.withdraw(target, RESOURCE_ENERGY);
}

function harvestFallback(creep) {
  if (!creep.getActiveBodyparts(WORK)) {
    return false;
  }
  let source = Game.getObjectById(creep.memory.hs);
  if (!source || source.energy === 0) {
    source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    creep.memory.hs = source ? source.id : undefined;
  }
  if (!source) {
    return false;
  }
  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    travelTo(creep, source);
  }
  return true;
}

/**
 * Fills the creep with energy from the best available place.
 *
 * @return {boolean} true if the creep is busy getting energy
 */
function getEnergy(creep, colony, opts = {}) {
  let target = Game.getObjectById(creep.memory.et);
  if (!target || energyIn(target) === 0) {
    target = findPickup(creep, colony, opts);
    creep.memory.et = target ? target.id : undefined;
  }
  if (target) {
    if (creep.pos.isNearTo(target)) {
      take(creep, target);
      delete creep.memory.et;
    } else {
      travelTo(creep, target);
    }
    return true;
  }
  delete creep.memory.et;
  if (opts.harvest) {
    return harvestFallback(creep);
  }
  return false;
}

// ---- delivery claims: colony.fillClaims[id] = energy already headed there

function carried(creep) {
  return creep.store.getUsedCapacity(RESOURCE_ENERGY);
}

function unclaim(creep, colony) {
  const id = creep.memory.ft;
  if (id) {
    colony.fillClaims[id] = (colony.fillClaims[id] || 0) - carried(creep);
    delete creep.memory.ft;
  }
}

function claim(creep, colony, id) {
  if (creep.memory.ft === id) return;
  unclaim(creep, colony);
  creep.memory.ft = id;
  colony.fillClaims[id] = (colony.fillClaims[id] || 0) + carried(creep);
}

/** Free capacity of `s` not already covered by other creeps' deliveries. */
function stillNeeds(creep, colony, s) {
  const mine = creep.memory.ft === s.id ? carried(creep) : 0;
  return s.store.getFreeCapacity(RESOURCE_ENERGY) - ((colony.fillClaims[s.id] || 0) - mine);
}

/** Spawns/extensions (and towers if `towers`) needing energy, closest first. */
function findFillTarget(creep, colony, opts = {}) {
  let best;
  let bestRange = Infinity;
  const consider = (s) => {
    if (stillNeeds(creep, colony, s) <= 0) return;
    const range = creep.pos.getRangeTo(s);
    if (range < bestRange) {
      bestRange = range;
      best = s;
    }
  };
  for (const s of colony.fillables) {
    consider(s);
  }
  if (!best && opts.towers) {
    for (const s of colony.structures(STRUCTURE_TOWER)) {
      if (s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getCapacity(RESOURCE_ENERGY) * 0.8) consider(s);
    }
  }
  return best;
}

/**
 * Transfers to memory.ft (or a new target from `pick`). After a successful
 * transfer the creep immediately heads for the next target in the same tick.
 *
 * @param {Creep} creep
 * @param {Colony} colony
 * @param {Function} pick - (creep, colony) => structure|undefined
 * @return {boolean} true if the creep had something to deliver to
 */
function deliver(creep, colony, pick) {
  let target = Game.getObjectById(creep.memory.ft);
  if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    unclaim(creep, colony);
    target = pick(creep, colony);
  }
  if (!target) {
    unclaim(creep, colony);
    return false;
  }
  claim(creep, colony, target.id);

  if (!creep.pos.isNearTo(target)) {
    travelTo(creep, target);
    return true;
  }
  const amount = Math.min(carried(creep), target.store.getFreeCapacity(RESOURCE_ENERGY));
  creep.transfer(target, RESOURCE_ENERGY);
  unclaim(creep, colony);

  // Look ahead: head for the next target this same tick (the one we just
  // filled is temporarily marked as fully claimed so it isn't picked again).
  if (carried(creep) - amount > 0) {
    const BIG = 1e9;
    colony.fillClaims[target.id] = (colony.fillClaims[target.id] || 0) + BIG;
    const next = pick(creep, colony);
    colony.fillClaims[target.id] -= BIG;
    if (next && next.id !== target.id) {
      claim(creep, colony, next.id);
      // our carried amount drops by `amount` after the transfer resolves
      colony.fillClaims[next.id] -= amount;
      travelTo(creep, next);
    }
  }
  return true;
}

module.exports = {energyIn, getEnergy, findPickup, findFillTarget, deliver};
