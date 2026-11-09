'use strict';

/** Room overlay + periodic console summary. */

const config = require('./core.config');

const SHORT = {
  miner: 'min', hauler: 'haul', filler: 'fill', upgrader: 'upg',
  builder: 'bld', worker: 'wrk', defender: 'def', claimer: 'clm',
};

function k(n) {
  return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n);
}

function roleSummary(colony) {
  return Object.keys(colony.byRole).sort()
    .map((r) => `${SHORT[r] || r}:${colony.byRole[r].length}`).join(' ');
}

function lines(colony) {
  const c = colony.controller;
  const progress = c.level < 8 ? ` ${(c.progress / c.progressTotal * 100).toFixed(1)}%` : '';
  const out = [
    `RCL ${c.level}${progress}   energy ${colony.room.energyAvailable}/${colony.room.energyCapacityAvailable}` +
      (colony.storage ? `   storage ${k(colony.storedEnergy)}` : ''),
    `income ${colony.income}/t   ${roleSummary(colony)}`,
  ];
  if (colony.lastQueue && colony.lastQueue.length) {
    out.push('next: ' + colony.lastQueue.slice(0, 3).map((r) => r.role).join(', '));
  }
  if (colony.threats.length) {
    out.push(`THREATS: ${colony.threats.length}`);
  }
  return out;
}

function run(colonies, cpuUsed) {
  if (config.visuals.hud) {
    for (const colony of colonies) {
      const v = colony.room.visual;
      const rows = lines(colony);
      rows.push(`cpu ${cpuUsed.toFixed(1)}/${Game.cpu.limit}   bucket ${Game.cpu.bucket}`);
      rows.forEach((text, i) => v.text(text, 1, 1.5 + i, {align: 'left', font: 0.6, opacity: 0.8}));
    }
  }
  const every = config.log.reportInterval;
  if (every && Game.time % every === 0) {
    for (const colony of colonies) {
      console.log(`[${Game.time}] ${colony.name} | ${lines(colony).join(' | ')}`);
    }
    console.log(`[${Game.time}] GCL ${Game.gcl.level} ${(Game.gcl.progress / Game.gcl.progressTotal * 100).toFixed(1)}%` +
      ` | cpu ${cpuUsed.toFixed(1)}/${Game.cpu.limit} bucket ${Game.cpu.bucket} | creeps ${Object.keys(Game.creeps).length}`);
  }
}

module.exports = {run};
