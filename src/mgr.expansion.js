'use strict';

/**
 * Expansion.
 *
 * Automatic (config.expansion.auto):
 *   Fills the grid of rooms around the empire centre (radius
 *   config.expansion.gridRadius; 1 = the 3x3 around your first room).
 *   Whenever GCL allows another room and no expansion is in progress:
 *     1. evaluate every grid room from scout intel
 *     2. keep only claimable ones (has a controller, unowned, not reserved by
 *        someone else, no keepers / invader core / towers, reachable by exits)
 *     3. prefer rooms that share an exit with a room we own (fewest room
 *        hops), then the highest score (sources, mineral, open terrain)
 *     4. send a claimer, then pioneers build the spawn (see main.js)
 *     5. when the new spawn stands, the next room is chosen
 *   Diagonal grid rooms become "adjacent" once a side room is ours, so the
 *   grid fills edge-first.
 *
 * Manual: a flag whose name starts with "claim" still works as an override.
 *
 * Console: expansionReport() prints the current evaluation.
 */

const config = require('./core.config');
const log = require('./core.log');
const rooms = require('./core.rooms');
const intel = require('./mgr.intel');
const {isHostileRoom} = require('./core.move');

const MINERAL_VALUE = {X: 15, H: 10, O: 10, U: 8, K: 8, L: 8, Z: 8};

function findHelper(roomName, colonies, minEnergy) {
  let best;
  let bestDistance = Infinity;
  for (const colony of colonies) {
    if (colony.name === roomName || !colony.spawns.length) continue;
    if (colony.level < config.expansion.minSupportRcl) continue;
    if (colony.room.energyCapacityAvailable < (minEnergy || 0)) continue;
    if (colony.threats.length) continue;
    const d = Game.map.getRoomLinearDistance(colony.name, roomName);
    if (d <= config.expansion.maxDistance && d < bestDistance) {
      bestDistance = d;
      best = colony;
    }
  }
  return best;
}

function findClaimer(roomName) {
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (c.memory.role === 'claimer' && c.memory.target === roomName) return name;
  }
  return undefined;
}

function hasClaimer(roomName) {
  return findClaimer(roomName) !== undefined;
}

const CLAIMER_COST = 650; // CLAIM + MOVE

function requestClaimer(roomName, colonies) {
  const helper = findHelper(roomName, colonies, CLAIMER_COST);
  if (!helper) return false;
  helper.spawnRequests.push({
    role: 'claimer',
    priority: 6,
    body: (e) => (e >= CLAIMER_COST ? [CLAIM, MOVE] : null),
    memory: {target: roomName},
  });
  return true;
}

// ------------------------------------------------------------- evaluation

function routeLength(from, to) {
  if (from === to) return 0;
  const route = Game.map.findRoute(from, to, {
    routeCallback: (name) => (name !== to && isHostileRoom(name) ? Infinity : 1),
  });
  return route === ERR_NO_PATH ? Infinity : route.length;
}

/** Why a room can't be claimed right now, or null if it can. */
function blocker(info) {
  const me = Memory.username;
  const retry = (tick, wait) => tick && Game.time - tick < wait;
  if (!info || !info.t) return 'unscouted';
  if (retry(info.unreachable, config.expansion.unreachableRetry)) return 'unreachable';
  if (retry(info.failed, config.expansion.failedRetry)) return 'claim failed recently';
  if (info.ctrl === undefined) return 'no controller';
  if (info.owner && info.owner !== me) return `owned by ${info.owner}`;
  if (info.reserver && info.reserver !== me) return `reserved by ${info.reserver}`;
  if (info.sk) return 'source keepers';
  if (info.core) return 'invader core';
  if (info.towers) return 'hostile towers';
  return null;
}

function ownedMinerals(colonies) {
  const set = {};
  for (const c of colonies) {
    const m = c.mineral;
    if (m) set[m.mineralType] = true;
  }
  return set;
}

function evaluate(colonies) {
  const center = Memory.empire && Memory.empire.center;
  if (!center) return [];
  const minerals = ownedMinerals(colonies);
  const out = [];
  for (const name of rooms.grid(center, config.expansion.gridRadius)) {
    if (colonies.some((c) => c.name === name)) continue;
    if (rooms.isHighway(name)) continue;
    if (rooms.status(name) === 'closed') continue;
    const info = intel.get(name);
    let tier = Infinity;
    for (const c of colonies) {
      tier = Math.min(tier, routeLength(c.name, name));
    }
    let reason = tier === Infinity ? 'no route' : blocker(info);
    if (!reason && rooms.isKeeperRoom(name)) reason = 'source keepers';
    let score = 0;
    if (info && info.t) {
      score = (info.src || 0) * 50 + (MINERAL_VALUE[info.min] || 5) +
        (info.min && !minerals[info.min] ? 10 : 0) +
        Math.round((info.open || 0) * 20) - Math.round((info.swamp || 0) * 20);
    }
    out.push({name, tier, score, reason});
  }
  return out.sort((a, b) => a.tier - b.tier || b.score - a.score);
}

function report(colonies) {
  const s = Memory.empire || {};
  console.log(`Expansion: centre ${s.center}, target ${s.target || '-'}, ` +
    `rooms ${colonies.length}/${Game.gcl.level} (GCL)`);
  for (const c of evaluate(colonies)) {
    console.log(`  ${c.name.padEnd(8)} hops ${c.tier === Infinity ? '-' : c.tier}  score ${String(c.score).padStart(3)}  ` +
      (c.reason ? `skip: ${c.reason}` : 'CLAIMABLE'));
  }
}

// ------------------------------------------------------------ automation

function updateCenter(colonies) {
  if (!Memory.empire) Memory.empire = {};
  const state = Memory.empire;
  if (!state.center || !colonies.some((c) => c.name === state.center)) {
    const withSpawn = colonies.filter((c) => c.spawns.length).sort((a, b) => b.level - a.level);
    if (withSpawn.length) {
      state.center = withSpawn[0].name;
      delete state.target;
      log.info('expansion', `empire centre set to ${state.center}`);
    }
  }
  return state;
}

function progressTarget(state, colonies) {
  const target = state.target;
  const room = Game.rooms[target];
  if (room && room.controller && room.controller.my) {
    if (room.find(FIND_MY_SPAWNS).length) {
      log.info('expansion', `${target} is up and running (spawn built)`);
      delete state.target;
      delete state.since;
      delete state.claimers;
    }
    return; // pioneers are delegated by main.js until the spawn stands
  }
  const reason = blocker(intel.get(target));
  if (reason && reason !== 'unscouted') {
    log.warn('expansion', `abandoning ${target}: ${reason}`);
    delete state.target;
    return;
  }
  const claimer = findClaimer(target);
  if (claimer) {
    state.claimers = state.claimers || [];
    if (state.claimers.indexOf(claimer) === -1) state.claimers.push(claimer);
  }
  const tooManyTries = !claimer && (state.claimers || []).length >= config.expansion.maxClaimers;
  if (tooManyTries || Game.time - state.since > config.expansion.claimTimeout) {
    log.warn('expansion', `claiming ${target} failed (${tooManyTries ? 'claimers did not succeed' : 'timed out'}), will retry later`);
    intel.mark(target, 'failed');
    delete state.target;
    delete state.claimers;
    return;
  }
  if (colonies.length >= Game.gcl.level) return; // wait for GCL (e.g. lost a level race)
  if (!claimer) requestClaimer(target, colonies);
}

function autoExpand(colonies) {
  const state = updateCenter(colonies);
  if (!config.expansion.auto || !state.center) return;
  if (state.target) {
    progressTarget(state, colonies);
    return;
  }
  if (colonies.length >= Game.gcl.level) return;
  if (colonies.some((c) => !c.spawns.length)) return; // another expansion is still building
  if (Game.time % 25 !== 0) return;
  const canSupport = colonies.some((c) => c.spawns.length && !c.threats.length &&
    c.level >= config.expansion.minSupportRcl && c.room.energyCapacityAvailable >= CLAIMER_COST);
  if (!canSupport) return;

  const list = evaluate(colonies);
  const best = list.find((c) => !c.reason);
  if (!best) return;
  // Don't commit while a room at the same or closer distance is still unscouted.
  if (list.some((c) => c.reason === 'unscouted' && c.tier <= best.tier)) return;
  state.target = best.name;
  state.since = Game.time;
  log.info('expansion', `next room: ${best.name} (hops ${best.tier}, score ${best.score})`);
  Game.notify(`Expanding to ${best.name}`, 60);
}

function manualFlags(colonies) {
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
    if (Memory.empire && Memory.empire.target === roomName) continue; // auto handles it
    if (colonies.length >= Game.gcl.level) {
      if (Game.time % 500 === 0) log.warn(roomName, `claim flag waiting: GCL ${Game.gcl.level} allows ${Game.gcl.level} rooms`);
      continue;
    }
    if (hasClaimer(roomName)) continue;
    if (!requestClaimer(roomName, colonies) && Game.time % 500 === 0) {
      log.warn(roomName, 'claim flag: no colony in range can support it');
    }
  }
}

function run(colonies) {
  manualFlags(colonies);
  autoExpand(colonies);
}

module.exports = {run, findHelper, evaluate, report};
