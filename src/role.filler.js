'use strict';

/**
 * Filler (storage-era): lives next to storage and keeps spawns, extensions
 * and towers full. Also runs the storage link:
 *  - empties it into storage (energy arriving from source links)
 *  - or tops it up from storage when the controller link is running dry.
 */

const body = require('./core.body');
const energy = require('./core.energy');
const {travelTo} = require('./core.move');

const LINK_LOW = 400;

function want(colony) {
  if (!colony.storage || (colony.storedEnergy === 0 && !colony.storageLink)) {
    return [];
  }
  const wanted = colony.level >= 7 ? 2 : 1;
  const have = colony.count('filler');
  if (have >= wanted) return [];
  const maxRepeat = colony.level >= 7 ? 10 : colony.level >= 6 ? 6 : 4;
  return [{
    role: 'filler',
    priority: have === 0 ? 1.02 : 3,
    body: (e) => body.build([CARRY, CARRY, MOVE], e, {maxRepeat}),
    emergency: have === 0,
  }];
}

function controllerLinkNeedsEnergy(colony) {
  const link = colony.controllerLink;
  return !!link && link.store.getUsedCapacity(RESOURCE_ENERGY) < LINK_LOW;
}

const fillPick = (creep, colony) => energy.findFillTarget(creep, colony, {towers: true});

function run(creep, colony) {
  const storage = colony.storage;
  if (!storage) {
    // Storage lost: behave like a hauler-lite by filling from anything.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      energy.getEnergy(creep, colony);
    } else {
      energy.deliver(creep, colony, fillPick);
    }
    return;
  }
  const sLink = colony.storageLink;

  if (creep.store.getUsedCapacity() === 0) {
    const fillNeeded = !!fillPick(creep, colony);
    if (sLink && !controllerLinkNeedsEnergy(colony) && sLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      creep.memory.fromLink = !fillNeeded;
      if (creep.pos.isNearTo(sLink)) creep.withdraw(sLink, RESOURCE_ENERGY);
      else travelTo(creep, sLink);
      return;
    }
    const linkWantsEnergy = sLink && controllerLinkNeedsEnergy(colony) &&
      sLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    if (!fillNeeded && !linkWantsEnergy) {
      travelTo(creep, storage, {range: 1}); // park
      return;
    }
    const src = storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 ? storage :
      (colony.terminal && colony.terminal.store.getUsedCapacity(RESOURCE_ENERGY) > 0 ? colony.terminal : null);
    if (!src) return;
    creep.memory.fromLink = false;
    if (creep.pos.isNearTo(src)) creep.withdraw(src, RESOURCE_ENERGY);
    else travelTo(creep, src);
    return;
  }

  // Carrying something.
  if (!creep.memory.fromLink && energy.deliver(creep, colony, fillPick)) {
    return;
  }
  if (sLink && controllerLinkNeedsEnergy(colony) && sLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.pos.isNearTo(sLink)) creep.transfer(sLink, RESOURCE_ENERGY);
    else travelTo(creep, sLink);
    return;
  }
  if (creep.pos.isNearTo(storage)) {
    for (const res of Object.keys(creep.store)) {
      creep.transfer(storage, res);
      break;
    }
    creep.memory.fromLink = false;
  } else {
    travelTo(creep, storage);
  }
}

module.exports = {want, run};
