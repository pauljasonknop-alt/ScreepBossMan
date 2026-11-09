'use strict';

/**
 * Towers: focus fire (healers first) -> heal own creeps -> repair.
 * Repairs only while above `config.tower.repairMinEnergy` so energy is always
 * kept for defense.
 */

const config = require('./core.config');
const cache = require('./core.cache');

function pickTarget(hostiles, anchor) {
  let best;
  let bestScore = -Infinity;
  for (const c of hostiles) {
    const score = c.getActiveBodyparts(HEAL) * 100 - anchor.getRangeTo(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function repairList(colony) {
  // Recomputed every 5 ticks; ids are stored on the heap.
  const ids = cache.heap('trep:' + colony.name, 5, () => {
    const wallTarget = config.tower.wallHitsPerRcl * colony.level;
    return colony.room.find(FIND_STRUCTURES, {
      filter: (s) => {
        if (s.structureType === STRUCTURE_RAMPART) return s.my && s.hits < wallTarget;
        if (s.structureType === STRUCTURE_WALL) return s.hits < wallTarget;
        return s.hits < s.hitsMax * config.tower.repairBelow;
      },
    }).sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax).map((s) => s.id);
  });
  return ids.map((id) => Game.getObjectById(id)).filter((s) => s && s.hits < s.hitsMax);
}

function run(colony) {
  const towers = colony.structures(STRUCTURE_TOWER).filter((t) =>
    t.my && t.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_ENERGY_COST);
  if (!towers.length) return;

  const hostiles = colony.hostiles;
  if (hostiles.length) {
    const target = pickTarget(hostiles, towers[0].pos);
    for (const t of towers) t.attack(target);
    return;
  }

  const hurt = colony.room.find(FIND_MY_CREEPS, {filter: (c) => c.hits < c.hitsMax});
  if (hurt.length) {
    towers.forEach((t, i) => t.heal(hurt[i % hurt.length]));
    return;
  }

  const repairs = repairList(colony);
  if (!repairs.length) return;
  let i = 0;
  for (const t of towers) {
    if (t.store.getUsedCapacity(RESOURCE_ENERGY) < t.store.getCapacity(RESOURCE_ENERGY) * config.tower.repairMinEnergy) {
      continue;
    }
    t.repair(repairs[i % repairs.length]);
    i++;
  }
}

module.exports = {run};
