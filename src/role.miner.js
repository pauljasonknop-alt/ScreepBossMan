'use strict';

/**
 * Miner: parks on its source's container (or next to the source) and harvests
 * forever. 5 WORK parts fully drain a 3000-energy source per regen cycle.
 *
 *  - No container yet: energy drops on the ground, haulers pick it up.
 *  - Container: harvested energy lands in the container automatically.
 *  - Link (RCL 5+): miner gets one CARRY part and pushes energy into the link.
 */

const body = require('./core.body');
const {travelTo} = require('./core.move');

const MAX_WORK = 5;

function minerBody(energy, withCarry) {
  for (let work = MAX_WORK; work >= 1; work--) {
    const parts = new Array(work).fill(WORK).concat(new Array(Math.ceil(work / 2)).fill(MOVE));
    if (withCarry) parts.push(CARRY);
    if (body.cost(parts) <= energy) {
      return body.sort(parts);
    }
  }
  return null;
}

function want(colony) {
  const requests = [];
  const noMiners = colony.count('miner') === 0;
  colony.sources.forEach((source, i) => {
    const mine = (c) => c.memory.src === source.id;
    const alive = colony.count('miner', mine);
    // WORK on creeps that will outlive their replacement's spawn+travel.
    let work = 0;
    for (const c of colony.byRole.miner || []) {
      if (mine(c) && (c.spawning || c.ticksToLive > c.body.length * CREEP_SPAWN_TIME + (c.memory.travel || 0) + 30)) {
        work += c.getActiveBodyparts(WORK);
      }
    }
    if (work >= MAX_WORK || alive >= colony.sourceSpots(source)) {
      return;
    }
    const withCarry = !!colony.sourceLink(source.id);
    requests.push({
      role: 'miner',
      priority: alive === 0 ? 1 + i * 0.1 : 3,
      body: (energy) => minerBody(energy, withCarry),
      memory: {src: source.id},
      emergency: noMiners,
    });
  });
  return requests;
}

function run(creep, colony) {
  if (!creep.memory.src) {
    const s = colony.leastAssignedSource('miner');
    if (!s) return;
    creep.memory.src = s.id;
  }
  const source = Game.getObjectById(creep.memory.src);
  if (!source) {
    travelTo(creep, new RoomPosition(25, 25, creep.memory.home), {range: 20});
    return;
  }

  // Preferred spot: the container tile, if no other miner is standing on it.
  // (Harvesting and moving can happen in the same tick.)
  const spot = colony.sourceContainerPos(source.id);
  let spotFree = false;
  if (spot && !creep.pos.isEqualTo(spot) && spot.roomName === creep.pos.roomName) {
    const blocker = spot.lookFor(LOOK_CREEPS)[0];
    spotFree = !blocker || !blocker.my || blocker.memory.role !== 'miner';
  }
  if (spotFree) {
    travelTo(creep, spot, {range: 0});
  } else if (!creep.pos.isNearTo(source)) {
    travelTo(creep, source);
  }
  if (!creep.pos.isNearTo(source)) {
    return;
  }
  if (creep.memory.travel === undefined) {
    creep.memory.travel = CREEP_LIFE_TIME - creep.ticksToLive;
  }

  if (source.energy > 0) {
    creep.harvest(source);
  }

  if (creep.store.getCapacity() > 0) {
    const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const link = colony.sourceLink(source.id);
    const container = colony.sourceContainer(source.id);
    if (container && container.hits < container.hitsMax * 0.5 && used > 0) {
      creep.repair(container);
    } else if (link && used >= creep.store.getCapacity() - creep.getActiveBodyparts(WORK) * HARVEST_POWER) {
      if (creep.pos.isNearTo(link)) {
        creep.transfer(link, RESOURCE_ENERGY);
      }
    }
  }
}

module.exports = {want, run, minerBody};
