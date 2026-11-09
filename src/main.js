'use strict';

/**
 * Entry point. Each tick:
 *   1. memory hygiene, colony refresh, creep -> colony assignment
 *   2. defense / towers / links        (always)
 *   3. planner / construction          (CPU permitting)
 *   4. expansion + spawn requests      (incl. delegation for spawnless rooms)
 *   5. creeps, in role priority order  (low-priority roles yield under CPU pressure)
 *   6. HUD / console report
 * Every step is isolated: one failing room or creep never stops the others.
 */

const config = require('./core.config');
const log = require('./core.log');
const move = require('./core.move');
const Colony = require('./colony');
const roles = require('./roles');
const spawner = require('./mgr.spawn');
const planner = require('./mgr.planner');
const towers = require('./mgr.tower');
const links = require('./mgr.link');
const defense = require('./mgr.defense');
const expansion = require('./mgr.expansion');
const hud = require('./mgr.hud');

const ROLE_ORDER = Object.keys(roles);
const YIELD_ROLES = {upgrader: true, builder: true};
const DELEGATED_ROLES = {worker: true, defender: true};

const colonies = {}; // heap; rebuilt after a global reset

log.info('main', `global reset (cpu ${Game.cpu.getUsed().toFixed(1)}, bucket ${Game.cpu.bucket})`);

function cleanMemory() {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
      move.forget(name);
    }
  }
}

function syncColonies() {
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) {
      if (!colonies[name]) {
        colonies[name] = new Colony(name);
      } else {
        colonies[name].refresh(room);
      }
      if (!Memory.username) {
        Memory.username = room.controller.owner.username;
      }
    }
  }
  for (const name of Object.keys(colonies)) {
    const room = Game.rooms[name];
    if (!room || !room.controller || !room.controller.my) {
      delete colonies[name];
    }
  }
  return Object.values(colonies);
}

/** Give creeps from older code (or with broken memory) a role we know. */
function adopt(creep) {
  const fallbackHome = colonies[creep.room.name] ? creep.room.name : Object.keys(colonies)[0];
  if (!fallbackHome) return;
  const parts = (t) => creep.getActiveBodyparts(t);
  let role;
  if (parts(CLAIM)) role = 'claimer';
  else if (parts(ATTACK) || parts(RANGED_ATTACK)) role = 'defender';
  else if (parts(WORK) && !parts(CARRY)) role = 'miner';
  else if (!parts(WORK) && parts(CARRY)) role = 'hauler';
  else role = 'worker';
  if (role === 'claimer') {
    creep.suicide(); // claimers without a target are useless
    return;
  }
  creep.memory = {role, home: fallbackHome, v: 2};
  log.info('adopt', `${creep.name} -> ${role} @${fallbackHome}`);
}

function assignCreeps() {
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.v !== 2 || !roles[creep.memory.role]) {
      adopt(creep);
    }
    const colony = colonies[creep.memory.home];
    if (colony) {
      colony.addCreep(creep);
    }
  }
}

function updateIntel() {
  if (Game.time % 20 !== 0) return;
  if (!Memory.intel) Memory.intel = {};
  for (const name in Game.rooms) {
    const c = Game.rooms[name].controller;
    if (c && c.owner && !c.my) {
      Memory.intel[name] = {owner: c.owner.username, level: c.level, t: Game.time};
    } else if (Memory.intel[name]) {
      delete Memory.intel[name];
    }
  }
}

function delegateSpawnless(list) {
  for (const colony of list) {
    if (colony.spawns.length) continue;
    const helper = expansion.findHelper(colony.name, list, 0);
    if (!helper) continue;
    for (const req of spawner.requests(colony)) {
      if (DELEGATED_ROLES[req.role]) {
        helper.spawnRequests.push(Object.assign({}, req, {home: colony.name}));
      }
    }
  }
}

function runCreeps() {
  const byRole = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.spawning) continue;
    (byRole[creep.memory.role] || (byRole[creep.memory.role] = [])).push(creep);
  }
  const overBudget = () => Game.cpu.bucket < config.cpu.lowBucket && Game.cpu.getUsed() > Game.cpu.limit;
  for (const role of ROLE_ORDER) {
    const list = byRole[role];
    if (!list) continue;
    if (YIELD_ROLES[role] && overBudget()) continue;
    for (const creep of list) {
      const colony = colonies[creep.memory.home];
      if (!colony && role !== 'claimer') {
        // Home lost: try to make it useful wherever it is.
        creep.memory.v = 0;
        continue;
      }
      log.safe(`${role} ${creep.name}`, () => roles[role].run(creep, colony));
    }
  }
}

module.exports.loop = function() {
  if (!Memory.rooms) Memory.rooms = {};
  cleanMemory();
  const list = syncColonies();
  assignCreeps();
  updateIntel();

  for (const colony of list) {
    log.safe(`defense ${colony.name}`, () => defense.run(colony));
    log.safe(`towers ${colony.name}`, () => towers.run(colony));
    log.safe(`links ${colony.name}`, () => links.run(colony));
  }
  for (const colony of list) {
    log.safe(`planner ${colony.name}`, () => planner.run(colony));
  }

  log.safe('expansion', () => expansion.run(list));
  log.safe('delegate', () => delegateSpawnless(list));
  for (const colony of list) {
    log.safe(`spawn ${colony.name}`, () => spawner.run(colony));
  }

  runCreeps();

  log.safe('hud', () => hud.run(list, Game.cpu.getUsed()));
};
