'use strict';

/**
 * Defense: activates safe mode when the colony is about to lose something
 * important and nothing else can stop it. Towers and defenders handle the
 * normal fights (see mgr.tower and role.defender).
 */

const config = require('./core.config');
const log = require('./core.log');

function critical(colony) {
  const threats = colony.threats;
  for (const s of colony.spawns) {
    if (s.hits < s.hitsMax) return 'spawn damaged';
  }
  for (const t of colony.structures(STRUCTURE_TOWER)) {
    if (t.hits < t.hitsMax * 0.5) return 'tower damaged';
  }
  if (colony.storage && colony.storage.hits < colony.storage.hitsMax * 0.5) return 'storage damaged';
  const towersReady = colony.structures(STRUCTURE_TOWER).some((t) =>
    t.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST);
  if (!towersReady && colony.spawns.length) {
    const spawn = colony.spawns[0];
    const dangerous = threats.filter((c) => c.owner.username !== 'Invader' &&
      (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(WORK)));
    if (dangerous.some((c) => c.pos.getRangeTo(spawn) <= 6)) return 'hostiles at spawn without towers';
  }
  return null;
}

function run(colony) {
  colony.memory.threat = colony.threats.length ? Game.time : colony.memory.threat;
  if (!config.defense.safeMode || !colony.threats.length) return;
  const ctrl = colony.controller;
  if (ctrl.safeMode || ctrl.safeModeCooldown || !ctrl.safeModeAvailable || ctrl.upgradeBlocked) return;
  const reason = critical(colony);
  if (!reason) return;
  const rc = ctrl.activateSafeMode();
  log.warn(colony.name, `SAFE MODE (${reason}) -> ${rc}`);
  Game.notify(`${colony.name}: safe mode activated (${reason}) rc=${rc}`, 60);
}

module.exports = {run};
