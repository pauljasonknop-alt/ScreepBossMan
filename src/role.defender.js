'use strict';

/**
 * Defender: melee creep spawned when towers alone can't handle a threat
 * (no towers yet, or hostile healing outpaces tower damage). Recycles itself
 * once the room is clear to refund energy.
 */

const body = require('./core.body');
const {travelTo} = require('./core.move');

function towerDamage(colony) {
  let n = 0;
  for (const t of colony.structures(STRUCTURE_TOWER)) {
    if (t.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST) n++;
  }
  return n * TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF); // worst-case range
}

function want(colony) {
  const threats = colony.threats;
  if (!threats.length) return [];
  let heal = 0;
  for (const c of threats) heal += c.getActiveBodyparts(HEAL) * HEAL_POWER;
  const dmg = towerDamage(colony);
  if (dmg > 0 && heal < dmg * 0.8) return []; // towers win this fight
  const wanted = Math.min(3, threats.length);
  const have = colony.count('defender');
  if (have >= wanted) return [];
  return [{
    role: 'defender',
    priority: 0.5,
    body: (e) => body.build([ATTACK, MOVE], e, {maxRepeat: 16}),
    emergency: have === 0,
  }];
}

function run(creep, colony) {
  const room = Game.rooms[colony.name];
  const threats = room ? colony.threats : [];
  if (creep.room.name !== colony.name) {
    travelTo(creep, new RoomPosition(25, 25, colony.name), {range: 20});
    return;
  }
  if (!threats.length) {
    const spawn = colony.spawns[0];
    if (!spawn) return;
    if (creep.pos.isNearTo(spawn)) spawn.recycleCreep(creep);
    else travelTo(creep, spawn);
    return;
  }
  // Healers first, then closest.
  let target = creep.pos.findClosestByRange(threats.filter((c) => c.getActiveBodyparts(HEAL) > 0));
  if (!target) target = creep.pos.findClosestByRange(threats);
  if (creep.attack(target) === ERR_NOT_IN_RANGE) {
    travelTo(creep, target);
  }
}

module.exports = {want, run};
