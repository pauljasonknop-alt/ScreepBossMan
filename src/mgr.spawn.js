'use strict';

/**
 * Spawn manager.
 *
 * Every role module may export `want(colony)` returning spawn requests:
 *   {
 *     role: 'miner',
 *     priority: 1,                 // lower spawns first
 *     body: (energy) => [...]|null // body for a given energy budget
 *     memory: {...},               // extra creep memory
 *     emergency: false,            // true: build from energyAvailable now
 *                                  //       instead of waiting for full capacity
 *     home: 'W1N1',                // optional, defaults to the spawning colony
 *   }
 *
 * The manager only computes requests while a spawn is idle, sorts them and
 * spawns the most important one. If it can't be afforded yet it waits (unless
 * it's an emergency), so cheap low-priority creeps never starve big ones.
 */

const roles = require('./roles');
const {cost} = require('./core.body');
const log = require('./core.log');

let counter = 0;

function requests(colony) {
  const list = [];
  for (const name of Object.keys(roles)) {
    const role = roles[name];
    if (!role.want) continue;
    const reqs = log.safe(`want:${name}:${colony.name}`, () => role.want(colony)) || [];
    for (const r of reqs) {
      list.push(r);
    }
  }
  return list;
}

function run(colony) {
  const idle = colony.spawns.filter((s) => !s.spawning);
  if (!idle.length) {
    return;
  }
  const queue = requests(colony).concat(colony.spawnRequests).sort((a, b) => a.priority - b.priority);
  colony.lastQueue = queue; // for the HUD
  let available = colony.room.energyAvailable;
  const capacity = colony.room.energyCapacityAvailable;

  for (const spawn of idle) {
    let req;
    let body;
    while (queue.length) {
      req = queue.shift();
      body = req.body(req.emergency ? Math.max(available, 0) : capacity);
      if (body && body.length) break;
      req = undefined;
    }
    if (!req) {
      return;
    }
    const price = cost(body);
    if (price > available) {
      return; // wait for energy; don't let lower priorities jump the queue
    }
    counter = (counter + 1) % 1000;
    const name = `${req.role}_${Game.time.toString(36)}${counter}`;
    const memory = Object.assign({role: req.role, home: req.home || colony.name, v: 2}, req.memory);
    const rc = spawn.spawnCreep(body, name, {memory});
    if (rc === OK) {
      available -= price;
    } else {
      log.warn(colony.name, `spawnCreep ${req.role} failed: ${rc}`);
      return;
    }
  }
}

module.exports = {run, requests};
