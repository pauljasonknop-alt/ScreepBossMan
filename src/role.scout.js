'use strict';

/**
 * Scout: a single MOVE part that tours the expansion grid around the empire
 * centre, refreshing Memory.intel. Rooms it cannot reach (no exit path,
 * blocked by walls, or not reached in time) are marked `unreachable`.
 */

const config = require('./core.config');
const rooms = require('./core.rooms');
const intel = require('./mgr.intel');
const {travelTo} = require('./core.move');

const REACH_TIMEOUT = 400; // ticks allowed to reach one room

/** Grid rooms whose intel is missing or stale (and not known unreachable). */
function roomsToScout() {
  const center = Memory.empire && Memory.empire.center;
  if (!center) return [];
  const out = [];
  for (const name of rooms.grid(center, config.expansion.gridRadius)) {
    if (rooms.status(name) === 'closed') continue;
    const info = intel.get(name);
    if (info && info.unreachable && Game.time - info.unreachable < config.expansion.unreachableRetry) continue;
    if (Game.rooms[name]) continue; // already visible
    if (!info || !info.t || Game.time - info.t > config.expansion.scoutInterval) out.push(name);
  }
  return out;
}

function want(colony) {
  if (!Memory.empire || colony.name !== Memory.empire.center || colony.level < 2) return [];
  if (colony.count('scout') > 0 || !roomsToScout().length) return [];
  return [{role: 'scout', priority: 5, body: (e) => (e >= 50 ? [MOVE] : null)}];
}

function nextTarget(creep) {
  const todo = roomsToScout();
  if (!todo.length) return undefined;
  todo.sort((a, b) => Game.map.getRoomLinearDistance(creep.room.name, a) -
    Game.map.getRoomLinearDistance(creep.room.name, b));
  return todo[0];
}

function run(creep) {
  let target = creep.memory.target;
  if (target && creep.room.name === target) {
    intel.record(creep.room);
    target = undefined;
  }
  if (target && Game.time - (creep.memory.since || Game.time) > REACH_TIMEOUT) {
    intel.mark(target, 'unreachable');
    target = undefined;
  }
  if (!target) {
    target = nextTarget(creep);
    creep.memory.target = target;
    creep.memory.since = Game.time;
    if (!target) {
      creep.suicide(); // nothing left to look at; a fresh one spawns when needed
      return;
    }
  }
  if (!creep.memory.nw) {
    creep.notifyWhenAttacked(false);
    creep.memory.nw = 1;
  }
  if (travelTo(creep, new RoomPosition(25, 25, target), {range: 23}) === ERR_NO_PATH) {
    intel.mark(target, 'unreachable');
    delete creep.memory.target;
  }
}

module.exports = {want, run, roomsToScout};
