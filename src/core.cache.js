'use strict';

/**
 * Two cache layers:
 *  - tick(): values valid for the current tick only (safe for game objects)
 *  - heap(): plain data kept on the heap across ticks with a TTL
 *    (lost on global reset, so only store things that can be recomputed)
 */

let tickTime = -1;
let tickData = new Map();
const heapData = new Map();

function tick(key, fn) {
  if (tickTime !== Game.time) {
    tickTime = Game.time;
    tickData = new Map();
  }
  if (!tickData.has(key)) {
    tickData.set(key, fn());
  }
  return tickData.get(key);
}

function heap(key, ttl, fn) {
  const entry = heapData.get(key);
  if (entry && (ttl === Infinity || Game.time - entry.time < ttl)) {
    return entry.value;
  }
  const value = fn();
  heapData.set(key, {value, time: Game.time});
  return value;
}

function invalidate(prefix) {
  for (const key of heapData.keys()) {
    if (key.startsWith(prefix)) {
      heapData.delete(key);
    }
  }
}

/** Structures in a room grouped by type, built once per tick. */
function structuresByType(room) {
  return tick('sbt:' + room.name, () => {
    const byType = {};
    for (const s of room.find(FIND_STRUCTURES)) {
      (byType[s.structureType] || (byType[s.structureType] = [])).push(s);
    }
    return byType;
  });
}

/** Structures in a room keyed by packed position (y * 50 + x). */
function structuresByPos(room) {
  return tick('sbp:' + room.name, () => {
    const byPos = {};
    for (const s of room.find(FIND_STRUCTURES)) {
      const key = s.pos.y * 50 + s.pos.x;
      (byPos[key] || (byPos[key] = [])).push(s);
    }
    return byPos;
  });
}

function sitesByPos(room) {
  return tick('cbp:' + room.name, () => {
    const byPos = {};
    for (const s of room.find(FIND_MY_CONSTRUCTION_SITES)) {
      byPos[s.pos.y * 50 + s.pos.x] = s;
    }
    return byPos;
  });
}

module.exports = {tick, heap, invalidate, structuresByType, structuresByPos, sitesByPos};
