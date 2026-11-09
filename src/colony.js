'use strict';

const config = require('./core.config');
const cache = require('./core.cache');
const {distance} = require('./core.move');

// Extra ticks to start a replacement early (covers waiting for energy).
const PRESPAWN_MARGIN = 30;

/**
 * A Colony wraps one owned room. Instances live on the heap and are refreshed
 * every tick with the current Room object and the creeps whose memory.home
 * points here.
 *
 * Plan positions are stored packed as `y * 50 + x` (see mgr.planner).
 */
class Colony {
  constructor(name) {
    this.name = name;
    this.refresh(Game.rooms[name]);
  }

  refresh(room) {
    this.room = room;
    this.creeps = [];
    this.byRole = {};
    this.fillClaims = {}; // structureId -> energy already on its way there
    this.pickupClaims = {}; // objectId -> energy amount already claimed
    this.spawnRequests = []; // extra requests delegated from other colonies
  }

  addCreep(creep) {
    this.creeps.push(creep);
    (this.byRole[creep.memory.role] || (this.byRole[creep.memory.role] = [])).push(creep);
    if (creep.memory.ft) {
      this.fillClaims[creep.memory.ft] = (this.fillClaims[creep.memory.ft] || 0) +
        creep.store.getUsedCapacity(RESOURCE_ENERGY);
    }
    if (creep.memory.et) {
      this.pickupClaims[creep.memory.et] = (this.pickupClaims[creep.memory.et] || 0) +
        creep.store.getFreeCapacity(RESOURCE_ENERGY);
    }
  }

  // ---------------------------------------------------------------- basics

  get memory() {
    if (!Memory.rooms[this.name]) {
      Memory.rooms[this.name] = {};
    }
    return Memory.rooms[this.name];
  }

  get controller() {
    return this.room.controller;
  }

  get level() {
    return this.room.controller.level;
  }

  get plan() {
    return this.memory.plan;
  }

  pos(packed) {
    return new RoomPosition(packed % 50, Math.floor(packed / 50), this.name);
  }

  structures(type) {
    return cache.structuresByType(this.room)[type] || [];
  }

  /** The structure of `type` at a packed plan position, if built. */
  structureAt(packed, type) {
    if (packed === undefined || packed === null) {
      return undefined;
    }
    const list = cache.structuresByPos(this.room)[packed];
    return list ? list.find((s) => s.structureType === type) : undefined;
  }

  get spawns() {
    return this.structures(STRUCTURE_SPAWN);
  }

  /**
   * Spawns + usable extensions. isActive() is only checked when the room has
   * more extensions than its RCL allows (i.e. after a downgrade).
   */
  get fillables() {
    return cache.tick('fill:' + this.name, () => {
      let ext = this.structures(STRUCTURE_EXTENSION);
      if (ext.length > CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][this.level]) {
        ext = ext.filter((e) => e.isActive());
      }
      return this.spawns.concat(ext);
    });
  }

  get storage() {
    const s = this.room.storage;
    return s && s.my ? s : undefined;
  }

  get terminal() {
    const t = this.room.terminal;
    return t && t.my ? t : undefined;
  }

  get storedEnergy() {
    return this.storage ? this.storage.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
  }

  get sources() {
    const ids = cache.heap('src:' + this.name, Infinity,
      () => this.room.find(FIND_SOURCES).map((s) => s.id));
    return ids.map((id) => Game.getObjectById(id)).filter(Boolean);
  }

  get mineral() {
    return this.room.find(FIND_MINERALS)[0];
  }

  // ------------------------------------------------------- planned things

  sourceContainer(sourceId) {
    const p = this.plan && this.plan.src[sourceId];
    return p ? this.structureAt(p.c, STRUCTURE_CONTAINER) : undefined;
  }

  sourceContainerPos(sourceId) {
    const p = this.plan && this.plan.src[sourceId];
    return p ? this.pos(p.c) : undefined;
  }

  sourceLink(sourceId) {
    const p = this.plan && this.plan.src[sourceId];
    return p ? this.structureAt(p.l, STRUCTURE_LINK) : undefined;
  }

  get controllerContainer() {
    return this.plan ? this.structureAt(this.plan.ctrl.c, STRUCTURE_CONTAINER) : undefined;
  }

  get controllerContainerPos() {
    return this.plan ? this.pos(this.plan.ctrl.c) : undefined;
  }

  get controllerLink() {
    return this.plan ? this.structureAt(this.plan.ctrl.l, STRUCTURE_LINK) : undefined;
  }

  get storageLink() {
    return this.plan && this.plan.link ? this.structureAt(this.plan.link[0], STRUCTURE_LINK) : undefined;
  }

  /** Where haulers bring energy: storage, else planned storage spot, else spawn. */
  get dropPos() {
    if (this.storage) {
      return this.storage.pos;
    }
    if (this.plan && this.plan.storage) {
      return this.pos(this.plan.storage[0]);
    }
    const spawn = this.spawns[0];
    return spawn ? spawn.pos : this.controller.pos;
  }

  /**
   * Hauling distance for a source. Before storage most energy goes to the
   * controller container, so the longer of the two trips is used.
   */
  sourceDistance(source) {
    const toDrop = distance(this.dropPos, source.pos);
    if (this.storage || !this.controllerContainer) {
      return toDrop;
    }
    return Math.max(toDrop, distance(this.controllerContainer.pos, source.pos));
  }

  // --------------------------------------------------------------- creeps

  /**
   * Number of creeps of `role` that will still be alive once a replacement
   * could arrive. Creeps about to die are not counted, which makes the spawn
   * manager pre-spawn their replacements.
   */
  count(role, filter) {
    const list = this.byRole[role];
    if (!list) {
      return 0;
    }
    let n = 0;
    for (const c of list) {
      if (filter && !filter(c)) {
        continue;
      }
      if (c.spawning || c.ticksToLive > c.body.length * CREEP_SPAWN_TIME + (c.memory.travel || 0) + PRESPAWN_MARGIN) {
        n++;
      }
    }
    return n;
  }

  /** Source with the fewest creeps of `role` assigned (memory.src). */
  leastAssignedSource(role) {
    let best;
    let bestCount = Infinity;
    for (const source of this.sources) {
      const n = (this.byRole[role] || []).filter((c) => c.memory.src === source.id).length;
      if (n < bestCount) {
        bestCount = n;
        best = source;
      }
    }
    return best;
  }

  /** Walkable tiles around a source (how many miners fit). */
  sourceSpots(source) {
    return cache.heap('spots:' + source.id, Infinity, () => {
      const terrain = Game.map.getRoomTerrain(this.name);
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if ((dx || dy) && terrain.get(source.pos.x + dx, source.pos.y + dy) !== TERRAIN_MASK_WALL) n++;
        }
      }
      return n;
    });
  }

  /** Total of `part` across living creeps of `role` (optionally filtered). */
  parts(role, part, filter) {
    let n = 0;
    for (const c of this.byRole[role] || []) {
      if (!filter || filter(c)) {
        n += c.getActiveBodyparts(part);
      }
    }
    return n;
  }

  /** Energy/tick the miners currently harvest (max 10 per source). */
  get income() {
    let total = 0;
    for (const source of this.sources) {
      const work = this.parts('miner', WORK, (c) => c.memory.src === source.id);
      total += Math.min(source.energyCapacity / ENERGY_REGEN_TIME, work * HARVEST_POWER);
    }
    return total;
  }

  // -------------------------------------------------------------- threats

  get hostiles() {
    return cache.tick('hos:' + this.name, () => this.room.find(FIND_HOSTILE_CREEPS, {
      filter: (c) => config.allies.indexOf(c.owner.username) === -1,
    }));
  }

  /** Hostiles that can actually hurt us (ignores scouts/harmless creeps). */
  get threats() {
    return cache.tick('thr:' + this.name, () => this.hostiles.filter((c) =>
      c.body.some((p) => p.type === ATTACK || p.type === RANGED_ATTACK ||
        p.type === WORK || p.type === HEAL || p.type === CLAIM)));
  }
}

module.exports = Colony;
