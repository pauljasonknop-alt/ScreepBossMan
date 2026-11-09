'use strict';

/**
 * Worker: a do-everything creep (harvest -> fill spawn -> build -> upgrade).
 *
 * Used for:
 *  - bootstrap/recovery when a colony has no miners or haulers and can't
 *    afford a miner
 *  - pioneers: a freshly claimed room without a spawn gets workers from a
 *    nearby colony; they build the spawn and upgrade
 *  - adopted creeps left over from older code
 */

const config = require('./core.config');
const body = require('./core.body');
const energy = require('./core.energy');
const {travelTo} = require('./core.move');
const {doWork} = require('./role.builder');

function want(colony) {
  const have = colony.count('worker');
  if (!colony.spawns.length) {
    // Pioneers; main.js delegates this to a nearby colony.
    if (have >= config.expansion.pioneers) return [];
    return [{
      role: 'worker',
      priority: 6,
      body: (e) => body.build([WORK, CARRY, MOVE, MOVE], e, {maxRepeat: 6}),
    }];
  }
  const collapsed = colony.count('miner') === 0 && colony.count('hauler') === 0 &&
    !(colony.count('filler') > 0 && colony.storedEnergy > 0);
  if (!collapsed || have >= 2 || colony.room.energyAvailable >= 250) return [];
  return [{
    role: 'worker',
    priority: 0,
    body: (e) => body.build([WORK, CARRY, MOVE], e, {maxRepeat: 4}),
    emergency: true,
  }];
}

function run(creep, colony) {
  if (creep.room.name !== colony.name) {
    travelTo(creep, colony.controller || new RoomPosition(25, 25, colony.name), {range: 3});
    return;
  }
  if (creep.memory.w && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) creep.memory.w = false;
  if (!creep.memory.w && creep.store.getFreeCapacity() === 0) creep.memory.w = true;

  if (!creep.memory.w) {
    const busy = energy.getEnergy(creep, colony, {harvest: true, spawnSurplus: true});
    if (!busy && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.w = true;
    else return;
  }

  // Keep the spawn running if nobody else does.
  if (colony.count('hauler') === 0 && colony.count('filler') === 0 &&
    energy.deliver(creep, colony, (c, col) => energy.findFillTarget(c, col, {towers: true}))) {
    return;
  }
  doWork(creep, colony);
}

module.exports = {want, run};
