'use strict';

/**
 * Room intelligence. Every visible room is summarised into Memory.intel:
 *
 *   t         last tick seen
 *   owner     controller owner (also used by core.move to avoid hostile rooms)
 *   level     owner's RCL
 *   reserver  controller reservation owner
 *   ctrl      packed controller position (absent: no controller)
 *   src       number of sources
 *   min       mineral type
 *   sk        has source keeper lairs
 *   core      has an invader core
 *   towers    hostile towers
 *   open      share of walkable tiles (0..1)
 *   swamp     share of swamp tiles (0..1)
 *   unreachable  tick when a scout found no way in
 *   failed    tick when a claim attempt failed
 */

const config = require('./core.config');

function terrainStats(roomName) {
  const terrain = Game.map.getRoomTerrain(roomName);
  let walkable = 0;
  let swamp = 0;
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      const t = terrain.get(x, y);
      if (t !== TERRAIN_MASK_WALL) walkable++;
      if (t === TERRAIN_MASK_SWAMP) swamp++;
    }
  }
  return {open: +(walkable / 2304).toFixed(2), swamp: +(swamp / 2304).toFixed(2)};
}

function record(room) {
  if (!Memory.intel) Memory.intel = {};
  const intel = Memory.intel[room.name] || {};
  const c = room.controller;
  intel.t = Game.time;
  intel.owner = c && c.owner ? c.owner.username : undefined;
  intel.level = c && c.owner ? c.level : undefined;
  intel.reserver = c && c.reservation ? c.reservation.username : undefined;
  intel.ctrl = c ? c.pos.y * 50 + c.pos.x : undefined;

  if (intel.src === undefined) {
    intel.src = room.find(FIND_SOURCES).length;
    const mineral = room.find(FIND_MINERALS)[0];
    intel.min = mineral ? mineral.mineralType : undefined;
    const t = terrainStats(room.name);
    intel.open = t.open;
    intel.swamp = t.swamp;
  }

  let sk = false;
  let core = false;
  let towers = 0;
  for (const s of room.find(FIND_STRUCTURES)) {
    if (s.structureType === STRUCTURE_KEEPER_LAIR) sk = true;
    else if (s.structureType === STRUCTURE_INVADER_CORE) core = true;
    else if (s.structureType === STRUCTURE_TOWER && !s.my && s.owner &&
      config.allies.indexOf(s.owner.username) === -1) towers++;
  }
  intel.sk = sk || undefined;
  intel.core = core || undefined;
  intel.towers = towers || undefined;
  delete intel.unreachable; // we're looking at it, so it's reachable

  // Drop undefined keys to keep Memory small.
  for (const k of Object.keys(intel)) {
    if (intel[k] === undefined) delete intel[k];
  }
  Memory.intel[room.name] = intel;
}

function run() {
  if (Game.time % 10 !== 0) return;
  for (const name in Game.rooms) {
    record(Game.rooms[name]);
  }
}

function get(roomName) {
  return Memory.intel && Memory.intel[roomName];
}

function mark(roomName, key) {
  if (!Memory.intel) Memory.intel = {};
  if (!Memory.intel[roomName]) Memory.intel[roomName] = {};
  Memory.intel[roomName][key] = Game.time;
}

module.exports = {run, record, get, mark};
