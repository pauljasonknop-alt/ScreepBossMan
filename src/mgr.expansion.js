'use strict';

/**
 * Expansion (flag driven for now):
 *   Place a flag whose name starts with "claim" in the room you want.
 *   The nearest suitable colony spawns a claimer. After the claim, the new
 *   room is a spawnless colony and main.js delegates its pioneer workers to
 *   that same helper. The flag is removed once the new spawn is built.
 *
 * Automatic room scoring/selection can be added here later.
 */

const config = require('./core.config');
const log = require('./core.log');

function findHelper(roomName, colonies, minEnergy) {
  let best;
  let bestDistance = Infinity;
  for (const colony of colonies) {
    if (colony.name === roomName || !colony.spawns.length) continue;
    if (colony.level < config.expansion.minSupportRcl) continue;
    if (colony.room.energyCapacityAvailable < (minEnergy || 0)) continue;
    const d = Game.map.getRoomLinearDistance(colony.name, roomName);
    if (d <= config.expansion.maxDistance && d < bestDistance) {
      bestDistance = d;
      best = colony;
    }
  }
  return best;
}

function run(colonies) {
  const owned = colonies.length;
  for (const name of Object.keys(Game.flags)) {
    if (!name.startsWith('claim')) continue;
    const flag = Game.flags[name];
    const roomName = flag.pos.roomName;
    const room = Game.rooms[roomName];

    if (room && room.controller && room.controller.my) {
      if (room.find(FIND_MY_SPAWNS).length) {
        log.info(roomName, 'expansion complete, removing flag');
        flag.remove();
      }
      continue;
    }
    if (owned >= Game.gcl.level) {
      if (Game.time % 500 === 0) log.warn(roomName, `claim flag waiting: GCL ${Game.gcl.level} allows ${Game.gcl.level} rooms`);
      continue;
    }
    let claimer = false;
    for (const c of Object.values(Game.creeps)) {
      if (c.memory.role === 'claimer' && c.memory.target === roomName) {
        claimer = true;
        break;
      }
    }
    if (claimer) continue;
    const helper = findHelper(roomName, colonies, BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]);
    if (!helper) {
      if (Game.time % 500 === 0) log.warn(roomName, 'claim flag: no colony in range can support it');
      continue;
    }
    helper.spawnRequests.push({
      role: 'claimer',
      priority: 6,
      body: (e) => e >= 650 ? [CLAIM, MOVE] : null,
      memory: {target: roomName},
    });
  }
}

module.exports = {run, findHelper};
