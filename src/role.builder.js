'use strict';

/**
 * Builder: builds construction sites in priority order (spawn > extension >
 * tower > container > storage > ...), finishing one before starting the next.
 * With nothing to build it repairs, and with nothing to repair it upgrades.
 */

const config = require('./core.config');
const cache = require('./core.cache');
const body = require('./core.body');
const energy = require('./core.energy');
const {travelTo} = require('./core.move');

const SITE_PRIORITY = {
  [STRUCTURE_SPAWN]: 0,
  [STRUCTURE_EXTENSION]: 1,
  [STRUCTURE_TOWER]: 2,
  [STRUCTURE_CONTAINER]: 3,
  [STRUCTURE_STORAGE]: 4,
  [STRUCTURE_LINK]: 5,
  [STRUCTURE_TERMINAL]: 6,
  [STRUCTURE_EXTRACTOR]: 7,
  [STRUCTURE_ROAD]: 8,
  [STRUCTURE_RAMPART]: 9,
  [STRUCTURE_WALL]: 10,
};

function repairTargets(room) {
  return cache.tick('rep:' + room.name, () => room.find(FIND_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) &&
      s.hits < s.hitsMax * config.tower.repairBelow,
  }));
}

function want(colony) {
  const sites = colony.room.find(FIND_MY_CONSTRUCTION_SITES);
  let wanted = 0;
  if (sites.length) {
    let remaining = 0;
    for (const s of sites) remaining += s.progressTotal - s.progress;
    wanted = remaining > 20000 ? 3 : remaining > 4000 ? 2 : 1;
    if (colony.storage && colony.storedEnergy < 5000) wanted = 1;
  } else if (!colony.structures(STRUCTURE_TOWER).length && repairTargets(colony.room).length) {
    wanted = 1;
  }
  const have = colony.count('builder');
  if (have >= wanted) return [];
  const spawnSite = sites.some((s) => s.structureType === STRUCTURE_SPAWN);
  const maxRepeat = colony.level >= 5 ? 8 : 4;
  return [{
    role: 'builder',
    priority: have === 0 ? (spawnSite ? 1.9 : 2.2) : 3.5,
    body: (e) => body.build([WORK, CARRY, MOVE], e, {maxRepeat}),
  }];
}

function pickSite(creep, room) {
  let best;
  let bestScore = Infinity;
  for (const s of room.find(FIND_MY_CONSTRUCTION_SITES)) {
    const prio = SITE_PRIORITY[s.structureType] === undefined ? 6 : SITE_PRIORITY[s.structureType];
    const score = prio * 100 + creep.pos.getRangeTo(s);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Build -> repair -> upgrade. Shared with role.worker. Returns true if busy. */
function doWork(creep, colony) {
  const room = colony.room;
  let site = Game.getObjectById(creep.memory.bt);
  if (!site) {
    site = pickSite(creep, room);
    creep.memory.bt = site ? site.id : undefined;
  }
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) travelTo(creep, site, {range: 3});
    return true;
  }

  let target = Game.getObjectById(creep.memory.rt);
  if (!target || target.hits === target.hitsMax) {
    target = creep.pos.findClosestByRange(repairTargets(room));
    creep.memory.rt = target ? target.id : undefined;
  }
  if (target) {
    if (creep.repair(target) === ERR_NOT_IN_RANGE) travelTo(creep, target, {range: 3});
    return true;
  }

  if (room.controller && room.controller.my) {
    if (creep.upgradeController(room.controller) === ERR_NOT_IN_RANGE) {
      travelTo(creep, room.controller, {range: 3});
    }
    return true;
  }
  return false;
}

function run(creep, colony) {
  if (creep.room.name !== colony.name) {
    travelTo(creep, colony.controller, {range: 3});
    return;
  }
  if (creep.memory.w && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) creep.memory.w = false;
  if (!creep.memory.w && creep.store.getFreeCapacity() === 0) creep.memory.w = true;

  if (!creep.memory.w) {
    const busy = energy.getEnergy(creep, colony, {harvest: colony.count('miner') === 0, spawnSurplus: true});
    if (!busy && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      creep.memory.w = true;
    } else {
      return;
    }
  }
  doWork(creep, colony);
}

module.exports = {want, run, doWork};
