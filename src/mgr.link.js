'use strict';

/**
 * Links: source links push to the controller link when it runs low,
 * otherwise to the storage link. The storage link tops up the controller
 * link (the filler keeps the storage link stocked/emptied).
 */

const SEND_AT = 400;
const CONTROLLER_LOW = 400;

function freeOf(link, incoming) {
  return link.store.getFreeCapacity(RESOURCE_ENERGY) - (incoming[link.id] || 0);
}

function send(from, to, incoming) {
  const amount = Math.min(from.store.getUsedCapacity(RESOURCE_ENERGY), freeOf(to, incoming));
  if (amount <= 0) return false;
  if (from.transferEnergy(to, amount) === OK) {
    incoming[to.id] = (incoming[to.id] || 0) + amount;
    return true;
  }
  return false;
}

function run(colony) {
  if (colony.level < 5) return;
  const storageLink = colony.storageLink;
  const ctrlLink = colony.controllerLink;
  if (!storageLink && !ctrlLink) return;
  const incoming = {};

  for (const source of colony.sources) {
    const link = colony.sourceLink(source.id);
    if (!link || link.cooldown || link.store.getUsedCapacity(RESOURCE_ENERGY) < SEND_AT) continue;
    if (ctrlLink && ctrlLink.store.getUsedCapacity(RESOURCE_ENERGY) + (incoming[ctrlLink.id] || 0) < CONTROLLER_LOW &&
      send(link, ctrlLink, incoming)) {
      continue;
    }
    if (storageLink) send(link, storageLink, incoming);
  }

  if (storageLink && ctrlLink && !storageLink.cooldown &&
    storageLink.store.getUsedCapacity(RESOURCE_ENERGY) >= SEND_AT &&
    ctrlLink.store.getUsedCapacity(RESOURCE_ENERGY) + (incoming[ctrlLink.id] || 0) < CONTROLLER_LOW) {
    send(storageLink, ctrlLink, incoming);
  }
}

module.exports = {run};
