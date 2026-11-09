'use strict';

/**
 * travelTo — a cheaper, smarter replacement for creep.moveTo.
 *
 *  - Paths are computed with PathFinder and cached on the heap per creep, so
 *    nothing path-related is serialized into Memory.
 *  - Cost matrices (roads, structures, construction sites) are cached per room.
 *  - If a creep makes no progress for `stuckRepath` ticks it repaths treating
 *    creeps as obstacles.
 *  - Rooms owned by other players (from Memory.intel) are avoided.
 */

const config = require('./core.config');
const cache = require('./core.cache');

const state = {}; // creepName -> {dest, path, lastX, lastY, lastRoom, stuck}

function obstacle(structureType) {
  return OBSTACLE_OBJECT_TYPES.indexOf(structureType) !== -1;
}

function buildMatrix(room) {
  const matrix = new PathFinder.CostMatrix();
  for (const s of room.find(FIND_STRUCTURES)) {
    if (s.structureType === STRUCTURE_ROAD) {
      if (matrix.get(s.pos.x, s.pos.y) === 0) {
        matrix.set(s.pos.x, s.pos.y, config.movement.roadCost);
      }
    } else if (s.structureType === STRUCTURE_RAMPART) {
      if (!s.my && !s.isPublic) {
        matrix.set(s.pos.x, s.pos.y, 0xff);
      }
    } else if (obstacle(s.structureType)) {
      matrix.set(s.pos.x, s.pos.y, 0xff);
    }
  }
  for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
    if (obstacle(site.structureType)) {
      matrix.set(site.pos.x, site.pos.y, 0xff);
    }
  }
  return matrix;
}

/** Cached structure matrix for a room (empty matrix if never seen). */
function getMatrix(roomName) {
  const room = Game.rooms[roomName];
  if (!room) {
    return cache.heap('cm:' + roomName, Infinity, () => new PathFinder.CostMatrix());
  }
  return cache.heap('cm:' + roomName, config.movement.matrixTtl, () => buildMatrix(room));
}

/** Call after placing/finishing structures so paths update immediately. */
function invalidateMatrix(roomName) {
  cache.invalidate('cm:' + roomName);
}

function withCreeps(room) {
  return cache.tick('cmc:' + room.name, () => {
    const matrix = getMatrix(room.name).clone();
    for (const c of room.find(FIND_CREEPS)) {
      matrix.set(c.pos.x, c.pos.y, 0xff);
    }
    for (const c of room.find(FIND_POWER_CREEPS)) {
      matrix.set(c.pos.x, c.pos.y, 0xff);
    }
    return matrix;
  });
}

function isHostileRoom(roomName) {
  const intel = Memory.intel && Memory.intel[roomName];
  return !!(intel && intel.owner && intel.owner !== Memory.username &&
    config.allies.indexOf(intel.owner) === -1);
}

/** Limits long-distance searches to the rooms on a findRoute result. */
function routeRooms(from, to) {
  if (from === to || Game.map.getRoomLinearDistance(from, to) <= 1) {
    return null;
  }
  const route = Game.map.findRoute(from, to, {
    routeCallback(roomName) {
      if (roomName !== to && isHostileRoom(roomName)) {
        return Infinity;
      }
      return 1;
    },
  });
  if (route === ERR_NO_PATH) {
    return null;
  }
  const allowed = {[from]: true};
  for (const step of route) {
    allowed[step.room] = true;
  }
  return allowed;
}

function search(creep, goal, range, avoidCreeps) {
  const allowed = routeRooms(creep.pos.roomName, goal.roomName);
  const multiRoom = creep.pos.roomName !== goal.roomName;
  const result = PathFinder.search(creep.pos, {pos: goal, range}, {
    plainCost: config.movement.plainCost,
    swampCost: config.movement.swampCost,
    maxOps: multiRoom ? 8000 : 2000,
    maxRooms: multiRoom ? 16 : 1,
    roomCallback(roomName) {
      if (allowed && !allowed[roomName]) {
        return false;
      }
      if (roomName !== goal.roomName && roomName !== creep.pos.roomName && isHostileRoom(roomName)) {
        return false;
      }
      if (avoidCreeps && roomName === creep.pos.roomName) {
        return withCreeps(creep.room);
      }
      return getMatrix(roomName);
    },
  });
  return result.path;
}

function isBorder(pos) {
  return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
}

/**
 * Moves `creep` until it is within `range` of `target`.
 *
 * @param {Creep} creep
 * @param {RoomPosition|{pos: RoomPosition}} target
 * @param {object} [opts]
 * @param {number} [opts.range=1]
 * @return {number} OK when moving or arrived, ERR_NO_PATH otherwise
 */
function travelTo(creep, target, opts = {}) {
  const goal = target.pos || target;
  const range = opts.range === undefined ? 1 : opts.range;

  if (creep.pos.roomName === goal.roomName && creep.pos.getRangeTo(goal) <= range) {
    delete state[creep.name];
    return OK;
  }
  if (creep.fatigue > 0 || creep.spawning) {
    return OK;
  }

  const destKey = `${goal.x},${goal.y},${goal.roomName},${range}`;
  let s = state[creep.name];
  if (!s || s.dest !== destKey) {
    s = state[creep.name] = {dest: destKey, path: null, stuck: 0};
  }

  // Progress check: same tile as last tick despite having moved => stuck.
  if (s.lastTick === Game.time - 1 && s.lastRoom === creep.pos.roomName &&
    s.lastX === creep.pos.x && s.lastY === creep.pos.y) {
    s.stuck++;
  } else {
    s.stuck = 0;
  }

  // Drop path steps we have already walked (allow up to 2 steps of skew,
  // e.g. after an automatic room transition).
  if (s.path) {
    for (let i = 0; i < Math.min(3, s.path.length); i++) {
      if (s.path[i].isEqualTo(creep.pos)) {
        s.path.splice(0, i + 1);
        break;
      }
    }
  }

  let repath = !s.path || s.path.length === 0 || s.stuck >= config.movement.stuckRepath;
  if (!repath) {
    const next = s.path[0];
    if (next.roomName === creep.pos.roomName) {
      repath = !creep.pos.isNearTo(next);
    } else if (!isBorder(creep.pos)) {
      repath = true;
    }
  }

  if (repath) {
    const avoidCreeps = s.stuck >= config.movement.stuckRepath;
    s.path = search(creep, goal, range, avoidCreeps);
    s.stuck = 0;
    if (!s.path.length) {
      s.lastRoom = undefined;
      return ERR_NO_PATH;
    }
  }

  const next = s.path[0];
  if (next.roomName !== creep.pos.roomName && isBorder(creep.pos)) {
    // The game moves us across the border by itself this tick.
    s.lastRoom = undefined;
    return OK;
  }

  if (config.visuals.paths) {
    creep.room.visual.poly(s.path.filter((p) => p.roomName === creep.pos.roomName),
      {stroke: '#fff', opacity: 0.25, lineStyle: 'dashed'});
  }

  s.lastX = creep.pos.x;
  s.lastY = creep.pos.y;
  s.lastRoom = creep.pos.roomName;
  s.lastTick = Game.time;
  return creep.move(creep.pos.getDirectionTo(next));
}

/** Path length between two positions (heap-cached, for planning maths). */
function distance(from, to) {
  const key = `d:${from.roomName}${from.x},${from.y}>${to.roomName}${to.x},${to.y}`;
  return cache.heap(key, 5000, () => {
    const result = PathFinder.search(from, {pos: to, range: 1}, {
      plainCost: 2,
      swampCost: 10,
      maxOps: 4000,
      roomCallback: (roomName) => getMatrix(roomName),
    });
    return result.incomplete ? 50 : result.path.length;
  });
}

/** Forget per-creep path state (call when a creep dies). */
function forget(name) {
  delete state[name];
}

module.exports = {travelTo, distance, getMatrix, invalidateMatrix, forget, isHostileRoom};
