'use strict';

/**
 * Upgrader: stands next to the controller link/container and upgrades.
 * Withdrawing and upgrading happen in the same tick, so a fed upgrader never
 * walks anywhere after arriving.
 *
 * How many WORK parts we field:
 *  - with storage: scales with stored energy above a reserve
 *  - without storage: a share of source income (less while building)
 *  - RCL 8: capped at 15 energy/tick by the game
 */

const config = require('./core.config');
const body = require('./core.body');
const energy = require('./core.energy');
const {travelTo} = require('./core.move');

function targetWork(colony) {
  const rcl = colony.level;
  let work;
  const eco = config.economy;
  const building = colony.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;
  let share = building && rcl >= 2 ? eco.upgradeShare / 2 : eco.upgradeShare;
  if (colony.storage) {
    // Income share (halved while below the reserve) plus a bonus for any
    // surplus already banked in storage.
    const surplus = colony.storedEnergy - eco.storageReserve;
    if (surplus < 0) share /= 2;
    work = Math.floor(colony.income * share) + Math.max(0, Math.floor(surplus / eco.storagePerUpgradeWork));
  } else {
    work = Math.floor(colony.income * share);
    const cc = colony.controllerContainer;
    if (cc && cc.store.getUsedCapacity(RESOURCE_ENERGY) > 1500) {
      work += 4; // energy is piling up at the controller: use it
    }
  }
  work = Math.max(1, Math.min(work, eco.maxUpgradeWork));
  if (rcl === 8) {
    work = Math.min(work, CONTROLLER_MAX_UPGRADE_PER_TICK);
  }
  return work;
}

function upgraderBody(energyBudget, work) {
  return body.build([WORK, WORK, MOVE], energyBudget, {prefix: [CARRY], maxRepeat: Math.max(1, Math.ceil(work / 2))}) ||
    body.build([WORK, MOVE], energyBudget, {prefix: [CARRY], maxRepeat: 1});
}

function want(colony) {
  const controller = colony.controller;
  const work = targetWork(colony);
  const sample = upgraderBody(colony.room.energyCapacityAvailable, work);
  if (!sample) return [];
  const perCreep = body.count(sample, WORK);
  const maxCreeps = colony.level === 8 ? 1 : 6;
  const wanted = Math.min(maxCreeps, Math.ceil(work / perCreep));
  const have = colony.count('upgrader');
  if (have >= wanted) return [];
  const downgrading = controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[colony.level] * 0.3;
  return [{
    role: 'upgrader',
    priority: downgrading && have === 0 ? 1.5 : (have === 0 ? 2.0 : 4),
    body: (e) => upgraderBody(e, work),
    emergency: downgrading && have === 0,
  }];
}

function feedSource(colony) {
  const link = colony.controllerLink;
  if (link && link.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return link;
  const container = colony.controllerContainer;
  if (container && container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) return container;
  return link || container;
}

function run(creep, colony) {
  const controller = colony.controller;
  if (creep.room.name !== colony.name) {
    travelTo(creep, controller, {range: 3});
    return;
  }

  // One-time sign on the way in.
  if (config.signText && !creep.memory.signed &&
    (!controller.sign || controller.sign.text !== config.signText)) {
    if (creep.signController(controller, config.signText) === ERR_NOT_IN_RANGE) {
      travelTo(creep, controller);
      return;
    }
    creep.memory.signed = true;
  }

  const feed = feedSource(colony);
  const carrying = creep.store.getUsedCapacity(RESOURCE_ENERGY);

  if (feed) {
    if (!creep.pos.isNearTo(feed) || !creep.pos.inRangeTo(controller, 3)) {
      travelTo(creep, feed);
    }
    if (creep.pos.isNearTo(feed) && carrying <= creep.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER * 2) {
      creep.withdraw(feed, RESOURCE_ENERGY);
    }
    if (carrying > 0 && creep.pos.inRangeTo(controller, 3)) {
      creep.upgradeController(controller);
    }
    if (carrying > 0 || energy.energyIn(feed) > 0) {
      return;
    }
  }

  // No feed structure (or it's empty): classic gather -> upgrade loop.
  if (creep.memory.w && carrying === 0) creep.memory.w = false;
  if (!creep.memory.w && creep.store.getFreeCapacity() === 0) creep.memory.w = true;
  if (!creep.memory.w) {
    if (!energy.getEnergy(creep, colony, {harvest: colony.count('miner') === 0, spawnSurplus: true}) && carrying > 0) {
      creep.memory.w = true;
    }
    if (!creep.memory.w) return;
  }
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    travelTo(creep, controller, {range: 3});
  }
}

module.exports = {want, run};
