'use strict';

/**
 * Minimal Screeps engine mock for smoke-testing the bot offline.
 *
 * NOT a faithful engine: no fatigue, single room, simplified collisions.
 * It exists to catch runtime errors, Memory serialization problems and
 * obvious economic stalls before deploying.
 *
 * Usage: node test/sim.js [ticks] [--reset-every N] [--invader-at T] [--legacy]
 */

const path = require('path');

const args = process.argv.slice(2);
const TICKS = parseInt(args[0], 10) || 5000;
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : (args[i + 1] === undefined ? true : parseInt(args[i + 1], 10));
};
const RESET_EVERY = opt('--reset-every', 0);
const INVADER_AT = opt('--invader-at', 0);
const LEGACY = args.includes('--legacy');
const FAST = opt('--fast', 1);
const NEIGHBORS = args.includes('--neighbors');
const GCL = opt('--gcl', 1);

// ------------------------------------------------------------------ constants
const C = {
  OK: 0, ERR_NOT_OWNER: -1, ERR_NO_PATH: -2, ERR_NAME_EXISTS: -3, ERR_BUSY: -4, ERR_NOT_FOUND: -5,
  ERR_NOT_ENOUGH_ENERGY: -6, ERR_NOT_ENOUGH_RESOURCES: -6, ERR_INVALID_TARGET: -7, ERR_FULL: -8,
  ERR_NOT_IN_RANGE: -9, ERR_INVALID_ARGS: -10, ERR_TIRED: -11, ERR_NO_BODYPART: -12,
  ERR_RCL_NOT_ENOUGH: -14, ERR_GCL_NOT_ENOUGH: -15,
  FIND_EXIT_TOP: 1, FIND_EXIT_RIGHT: 3, FIND_EXIT_BOTTOM: 5, FIND_EXIT_LEFT: 7, FIND_EXIT: 10,
  FIND_CREEPS: 101, FIND_MY_CREEPS: 102, FIND_HOSTILE_CREEPS: 103, FIND_SOURCES_ACTIVE: 104,
  FIND_SOURCES: 105, FIND_DROPPED_RESOURCES: 106, FIND_STRUCTURES: 107, FIND_MY_STRUCTURES: 108,
  FIND_HOSTILE_STRUCTURES: 109, FIND_FLAGS: 110, FIND_CONSTRUCTION_SITES: 111, FIND_MY_SPAWNS: 112,
  FIND_HOSTILE_SPAWNS: 113, FIND_MY_CONSTRUCTION_SITES: 114, FIND_HOSTILE_CONSTRUCTION_SITES: 115,
  FIND_MINERALS: 116, FIND_NUKES: 117, FIND_TOMBSTONES: 118, FIND_POWER_CREEPS: 119,
  FIND_MY_POWER_CREEPS: 120, FIND_HOSTILE_POWER_CREEPS: 121, FIND_DEPOSITS: 122, FIND_RUINS: 123,
  TOP: 1, TOP_RIGHT: 2, RIGHT: 3, BOTTOM_RIGHT: 4, BOTTOM: 5, BOTTOM_LEFT: 6, LEFT: 7, TOP_LEFT: 8,
  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack',
  TOUGH: 'tough', HEAL: 'heal', CLAIM: 'claim',
  BODYPART_COST: {move: 50, work: 100, attack: 80, carry: 50, heal: 250, ranged_attack: 150, tough: 10, claim: 600},
  MAX_CREEP_SIZE: 50, CREEP_LIFE_TIME: 1500, CREEP_CLAIM_LIFE_TIME: 600, CREEP_SPAWN_TIME: 3,
  CARRY_CAPACITY: 50, HARVEST_POWER: 2, ENERGY_REGEN_TIME: 300, SOURCE_ENERGY_CAPACITY: 3000,
  UPGRADE_CONTROLLER_POWER: 1, BUILD_POWER: 5, REPAIR_POWER: 100, ATTACK_POWER: 30, HEAL_POWER: 12,
  CONTROLLER_MAX_UPGRADE_PER_TICK: 15, MAX_CONSTRUCTION_SITES: 100,
  TOWER_ENERGY_COST: 10, TOWER_POWER_ATTACK: 600, TOWER_POWER_HEAL: 400, TOWER_POWER_REPAIR: 800,
  TOWER_OPTIMAL_RANGE: 5, TOWER_FALLOFF_RANGE: 20, TOWER_FALLOFF: 0.75, TOWER_CAPACITY: 1000,
  TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,
  RESOURCE_ENERGY: 'energy', LOOK_CREEPS: 'creep', LOOK_STRUCTURES: 'structure', LOOK_TERRAIN: 'terrain',
  STRUCTURE_SPAWN: 'spawn', STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road',
  STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart', STRUCTURE_KEEPER_LAIR: 'keeperLair',
  STRUCTURE_PORTAL: 'portal', STRUCTURE_CONTROLLER: 'controller', STRUCTURE_LINK: 'link',
  STRUCTURE_STORAGE: 'storage', STRUCTURE_TOWER: 'tower', STRUCTURE_OBSERVER: 'observer',
  STRUCTURE_POWER_BANK: 'powerBank', STRUCTURE_POWER_SPAWN: 'powerSpawn', STRUCTURE_EXTRACTOR: 'extractor',
  STRUCTURE_LAB: 'lab', STRUCTURE_TERMINAL: 'terminal', STRUCTURE_CONTAINER: 'container',
  STRUCTURE_NUKER: 'nuker', STRUCTURE_FACTORY: 'factory', STRUCTURE_INVADER_CORE: 'invaderCore',
  CONTROLLER_LEVELS: {1: 200, 2: 45000, 3: 135000, 4: 405000, 5: 1215000, 6: 3645000, 7: 10935000},
  CONTROLLER_DOWNGRADE: {1: 20000, 2: 10000, 3: 20000, 4: 40000, 5: 80000, 6: 120000, 7: 150000, 8: 200000},
  EXTENSION_ENERGY_CAPACITY: {0: 50, 1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 100, 8: 200},
  CONTROLLER_STRUCTURES: {
    spawn: {0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3},
    extension: {0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60},
    link: {1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6},
    road: {0: 2500, 1: 2500, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500},
    constructedWall: {1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500},
    rampart: {1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500},
    storage: {1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1},
    tower: {1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6},
    observer: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1},
    powerSpawn: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1},
    extractor: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1},
    terminal: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1},
    lab: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10},
    container: {0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5},
    nuker: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1},
    factory: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1},
  },
  CONSTRUCTION_COST: {
    spawn: 15000, extension: 3000, road: 300, constructedWall: 1, rampart: 1, link: 5000, storage: 30000,
    tower: 5000, observer: 8000, powerSpawn: 100000, extractor: 5000, lab: 50000, terminal: 100000,
    container: 5000, nuker: 100000, factory: 100000,
  },
};
C.OBSTACLE_OBJECT_TYPES = ['spawn', 'creep', 'powerCreep', 'source', 'mineral', 'deposit', 'controller',
  'constructedWall', 'extension', 'link', 'storage', 'tower', 'observer', 'powerSpawn', 'powerBank', 'lab',
  'terminal', 'nuker', 'factory', 'invaderCore'];
Object.assign(global, C);

const HITS = {spawn: 5000, extension: 1000, road: 5000, container: 250000, storage: 10000, tower: 3000,
  link: 1000, terminal: 3000, extractor: 500, rampart: 300000, constructedWall: 300000000};
const CAPACITY = {spawn: 300, storage: 1000000, tower: 1000, link: 800, container: 2000, terminal: 300000};

// ------------------------------------------------------------------ world
const ROOM = 'W2N2'; // no highways / keeper rooms in its 3x3
let idSeq = 1;
const objects = new Map();
const nextId = () => (idSeq++).toString(16).padStart(8, '0');
let cpuStart = 0;

// Deterministic PRNG
let seed = 1337;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const terrainData = new Uint8Array(2500);
for (let y = 0; y < 50; y++) {
  for (let x = 0; x < 50; x++) {
    if (x === 0 || y === 0 || x === 49 || y === 49) terrainData[y * 50 + x] = (x > 20 && x < 28) || (y > 20 && y < 28) ? 0 : 1;
  }
}
// a few wall blobs and swamp patches
for (let i = 0; i < 12; i++) {
  const cx = 3 + Math.floor(rand() * 44);
  const cy = 3 + Math.floor(rand() * 44);
  const r = 1 + Math.floor(rand() * 3);
  const mask = i % 3 === 0 ? 2 : 1;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x > 0 && y > 0 && x < 49 && y < 49 && Math.abs(x - 25) + Math.abs(y - 25) > 6) terrainData[y * 50 + x] = mask;
    }
  }
}
const terrain = {get: (x, y) => terrainData[y * 50 + x]};
const clearTile = (x, y) => terrainData[y * 50 + x] = 0;

function makeStore(caps) {
  // caps: number (any resource) or {resource: cap}
  const s = {};
  Object.defineProperties(s, {
    getCapacity: {value(r) {
      if (typeof caps === 'number') return caps;
      return caps[r || RESOURCE_ENERGY] || null;
    }},
    getUsedCapacity: {value(r) {
      if (r) return s[r] || 0;
      let t = 0;
      for (const k of Object.keys(s)) t += s[k];
      return t;
    }},
    getFreeCapacity: {value(r) {
      const cap = s.getCapacity(r);
      if (cap === null) return 0;
      return cap - (typeof caps === 'number' ? s.getUsedCapacity() : s.getUsedCapacity(r));
    }},
  });
  return s;
}
function addRes(store, r, amount) {
  store[r] = (store[r] || 0) + amount;
  if (store[r] <= 0) delete store[r];
}

class RoomPosition {
  constructor(x, y, roomName) {
    this.x = x;
    this.y = y;
    this.roomName = roomName;
  }
  static of(t) {
    return t.pos || t;
  }
  getRangeTo(a, b) {
    const t = typeof a === 'number' ? {x: a, y: b} : RoomPosition.of(a);
    return Math.max(Math.abs(t.x - this.x), Math.abs(t.y - this.y));
  }
  inRangeTo(t, r) {
    return this.getRangeTo(t) <= r;
  }
  isNearTo(t) {
    return this.getRangeTo(t) <= 1;
  }
  isEqualTo(a, b) {
    const t = typeof a === 'number' ? {x: a, y: b, roomName: this.roomName} : RoomPosition.of(a);
    return t.x === this.x && t.y === this.y && (t.roomName || this.roomName) === this.roomName;
  }
  getDirectionTo(a) {
    const t = RoomPosition.of(a);
    const dx = Math.sign(t.x - this.x);
    const dy = Math.sign(t.y - this.y);
    return {'0,-1': 1, '1,-1': 2, '1,0': 3, '1,1': 4, '0,1': 5, '-1,1': 6, '-1,0': 7, '-1,-1': 8}[`${dx},${dy}`];
  }
  lookFor(type) {
    const all = [...objects.values()].filter((o) => o.pos && o.pos.x === this.x && o.pos.y === this.y);
    if (type === LOOK_CREEPS) return all.filter((o) => o instanceof Creep);
    if (type === LOOK_STRUCTURES) return all.filter((o) => o instanceof Structure);
    if (type === LOOK_TERRAIN) return [['plain', 'wall', 'swamp'][terrain.get(this.x, this.y)]];
    return [];
  }
  findInRange(type, range, opts) {
    const list = Array.isArray(type) ? type : room.find(type, opts);
    return list.filter((o) => this.getRangeTo(o) <= range);
  }
  findClosestByRange(type, opts) {
    const list = Array.isArray(type) ? type : room.find(type, opts);
    let best = null;
    let br = Infinity;
    for (const o of (opts && opts.filter && Array.isArray(type) ? list.filter(opts.filter) : list)) {
      const r = this.getRangeTo(o);
      if (r < br) {
        br = r;
        best = o;
      }
    }
    return best;
  }
  createConstructionSite(type) {
    return room.createConstructionSite(this.x, this.y, type);
  }
}
global.RoomPosition = RoomPosition;

class GameObject {
  constructor(x, y) {
    this.id = nextId();
    this.pos = new RoomPosition(x, y, ROOM);
    objects.set(this.id, this);
  }
  get room() {
    return room;
  }
}
class Source extends GameObject {
  constructor(x, y) {
    super(x, y);
    this.energy = 3000;
    this.energyCapacity = 3000;
    this.ticksToRegeneration = 300;
  }
}
class Mineral extends GameObject {
  constructor(x, y) {
    super(x, y);
    this.mineralType = 'H';
    this.mineralAmount = 70000;
  }
}
class Resource extends GameObject {
  constructor(x, y, amount) {
    super(x, y);
    this.resourceType = RESOURCE_ENERGY;
    this.amount = amount;
  }
}
class Tombstone extends GameObject {
  constructor(x, y, energy) {
    super(x, y);
    this.store = makeStore(100000);
    addRes(this.store, RESOURCE_ENERGY, energy);
    this.ticksToDecay = 100;
  }
}
class Structure extends GameObject {
  constructor(x, y, type) {
    super(x, y);
    this.structureType = type;
    this.hitsMax = HITS[type] || 1000;
    this.hits = this.hitsMax;
    this.my = type !== 'road' && type !== 'container' && type !== 'constructedWall';
    this.owner = this.my ? {username: 'me'} : undefined;
    if (type === 'extension') this.store = makeStore({energy: 50});
    else if (CAPACITY[type]) this.store = makeStore(type === 'storage' || type === 'container' || type === 'terminal' ? CAPACITY[type] : {energy: CAPACITY[type]});
    this.cooldown = 0;
  }
  isActive() {
    return true;
  }
  destroy() {
    objects.delete(this.id);
    return OK;
  }
  notifyWhenAttacked() {
    return OK;
  }
}
class StructureSpawn extends Structure {
  constructor(x, y, name) {
    super(x, y, 'spawn');
    this.name = name;
    this.spawning = null;
    addRes(this.store, RESOURCE_ENERGY, 300);
  }
  spawnCreep(body, name, opts = {}) {
    if (this.spawning) return ERR_BUSY;
    if (Game.creeps[name]) return ERR_NAME_EXISTS;
    if (!body.length || body.length > 50) return ERR_INVALID_ARGS;
    const cost = body.reduce((a, p) => a + BODYPART_COST[p], 0);
    if (cost > room.energyAvailable) return ERR_NOT_ENOUGH_ENERGY;
    let left = cost;
    for (const s of [...room.find(FIND_MY_SPAWNS), ...room.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === 'extension')]) {
      const take = Math.min(left, s.store.energy || 0);
      addRes(s.store, RESOURCE_ENERGY, -take);
      left -= take;
    }
    Memory.creeps[name] = opts.memory || {};
    const creep = new Creep(this.pos.x, this.pos.y, name, body, true);
    this.spawning = {name, remainingTime: body.length * CREEP_SPAWN_TIME, needTime: body.length * 3};
    stats.spawned[Memory.creeps[name].role] = (stats.spawned[Memory.creeps[name].role] || 0) + 1;
    stats.spawnEnergy += cost;
    void creep;
    return OK;
  }
  recycleCreep(creep) {
    if (!this.pos.isNearTo(creep)) return ERR_NOT_IN_RANGE;
    creep.die();
    return OK;
  }
}
class StructureTower extends Structure {
  intent(kind, target) {
    if ((this.store.energy || 0) < 10) return ERR_NOT_ENOUGH_ENERGY;
    addRes(this.store, RESOURCE_ENERGY, -10);
    const r = this.pos.getRangeTo(target);
    const f = r <= 5 ? 1 : r >= 20 ? 0.25 : 1 - 0.75 * (r - 5) / 15;
    if (kind === 'attack') target.hits -= Math.floor(600 * f);
    if (kind === 'heal') target.hits = Math.min(target.hitsMax, target.hits + Math.floor(400 * f));
    if (kind === 'repair') target.hits = Math.min(target.hitsMax, target.hits + Math.floor(800 * f));
    return OK;
  }
  attack(t) {
    return this.intent('attack', t);
  }
  heal(t) {
    return this.intent('heal', t);
  }
  repair(t) {
    return this.intent('repair', t);
  }
}
class StructureLink extends Structure {
  transferEnergy(target, amount) {
    if (this.cooldown) return ERR_TIRED;
    amount = amount || this.store.energy || 0;
    if (amount > (this.store.energy || 0)) return ERR_NOT_ENOUGH_RESOURCES;
    if (target.store.getFreeCapacity(RESOURCE_ENERGY) < amount) return ERR_FULL;
    addRes(this.store, RESOURCE_ENERGY, -amount);
    addRes(target.store, RESOURCE_ENERGY, Math.floor(amount * 0.97));
    this.cooldown = this.pos.getRangeTo(target);
    return OK;
  }
}
class StructureController extends GameObject {
  constructor(x, y) {
    super(x, y);
    this.structureType = 'controller';
    this.level = 1;
    this.progress = 0;
    this.my = true;
    this.owner = {username: 'me'};
    this.ticksToDowngrade = 20000;
    this.safeModeAvailable = 1;
    this.safeMode = undefined;
    this.safeModeCooldown = undefined;
  }
  get progressTotal() {
    return CONTROLLER_LEVELS[this.level];
  }
  activateSafeMode() {
    this.safeMode = 20000;
    this.safeModeAvailable--;
    stats.safeModes++;
    return OK;
  }
}
class ConstructionSite extends GameObject {
  constructor(x, y, type) {
    super(x, y);
    this.structureType = type;
    this.progress = 0;
    this.progressTotal = CONSTRUCTION_COST[type];
    this.my = true;
  }
}

const TYPES = {spawn: StructureSpawn, tower: StructureTower, link: StructureLink};
function makeStructure(x, y, type) {
  const K = TYPES[type] || Structure;
  const s = type === 'spawn' ? new K(x, y, 'Spawn' + idSeq) : new K(x, y, type);
  if (type === 'spawn') Game.spawns[s.name] = s;
  return s;
}

const DIRS = {1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1], 6: [-1, 1], 7: [-1, 0], 8: [-1, -1]};

class Creep extends GameObject {
  constructor(x, y, name, body, spawning, owner) {
    super(x, y);
    this.name = name;
    this.body = body.map((type) => ({type, hits: 100}));
    this.hitsMax = body.length * 100;
    this.hits = this.hitsMax;
    this.spawning = !!spawning;
    this.ticksToLive = undefined;
    this.fatigue = 0;
    this.my = !owner;
    this.owner = {username: owner || 'me'};
    this.store = makeStore(body.filter((p) => p === CARRY).length * 50);
    this.intents = {};
    if (this.my) Game.creeps[name] = this;
  }
  get memory() {
    return Memory.creeps[this.name] || (Memory.creeps[this.name] = {});
  }
  set memory(v) {
    Memory.creeps[this.name] = v;
  }
  get carryCapacity() {
    return this.store.getCapacity();
  }
  getActiveBodyparts(t) {
    return this.body.filter((p) => p.type === t && p.hits > 0).length;
  }
  die() {
    if (this.store.energy) new Tombstone(this.pos.x, this.pos.y, this.store.energy);
    objects.delete(this.id);
    delete Game.creeps[this.name];
  }
  suicide() {
    this.die();
    return OK;
  }
  say() {
    return OK;
  }
  notifyWhenAttacked() {
    return OK;
  }
  move(dir) {
    if (!DIRS[dir]) return ERR_INVALID_ARGS;
    if (!this.getActiveBodyparts(MOVE)) return ERR_NO_BODYPART;
    this.intents.move = dir;
    return OK;
  }
  moveTo(t) {
    return this.move(this.pos.getDirectionTo(t));
  }
  harvest(source) {
    if (!this.pos.isNearTo(source)) return ERR_NOT_IN_RANGE;
    if (!source.energy) return ERR_NOT_ENOUGH_RESOURCES;
    const amount = Math.min(source.energy, this.getActiveBodyparts(WORK) * 2);
    source.energy -= amount;
    const fit = Math.min(amount, this.store.getFreeCapacity());
    addRes(this.store, RESOURCE_ENERGY, fit);
    if (amount > fit) dropAt(this.pos, amount - fit);
    stats.harvested += amount;
    return OK;
  }
  transfer(t, r, amount) {
    if (!this.pos.isNearTo(t)) return ERR_NOT_IN_RANGE;
    const have = this.store[r] || 0;
    if (!have) return ERR_NOT_ENOUGH_RESOURCES;
    const free = t.store.getFreeCapacity(r);
    if (free <= 0) return ERR_FULL;
    const n = Math.min(have, free, amount || Infinity);
    addRes(this.store, r, -n);
    addRes(t.store, r, n);
    return OK;
  }
  withdraw(t, r, amount) {
    if (!t || !t.store) return ERR_INVALID_TARGET;
    if (!this.pos.isNearTo(t)) return ERR_NOT_IN_RANGE;
    const have = t.store[r] || 0;
    if (!have) return ERR_NOT_ENOUGH_RESOURCES;
    const free = this.store.getFreeCapacity();
    if (free <= 0) return ERR_FULL;
    const n = Math.min(have, free, amount || Infinity);
    addRes(this.store, r, n);
    addRes(t.store, r, -n);
    return OK;
  }
  pickup(res) {
    if (!this.pos.isNearTo(res)) return ERR_NOT_IN_RANGE;
    const n = Math.min(res.amount, this.store.getFreeCapacity());
    if (n <= 0) return ERR_FULL;
    res.amount -= n;
    addRes(this.store, RESOURCE_ENERGY, n);
    if (res.amount <= 0) objects.delete(res.id);
    return OK;
  }
  drop(r, amount) {
    const n = Math.min(this.store[r] || 0, amount || Infinity);
    addRes(this.store, r, -n);
    dropAt(this.pos, n);
    return OK;
  }
  build(site) {
    if (!site || !objects.has(site.id)) return ERR_INVALID_TARGET;
    if (!this.pos.inRangeTo(site, 3)) return ERR_NOT_IN_RANGE;
    const n = Math.min(this.getActiveBodyparts(WORK) * 5, this.store.energy || 0, site.progressTotal - site.progress);
    if (n <= 0) return ERR_NOT_ENOUGH_RESOURCES;
    addRes(this.store, RESOURCE_ENERGY, -n);
    site.progress += n;
    if (site.progress >= site.progressTotal) {
      objects.delete(site.id);
      makeStructure(site.pos.x, site.pos.y, site.structureType);
      stats.built[site.structureType] = (stats.built[site.structureType] || 0) + 1;
    }
    return OK;
  }
  repair(t) {
    if (!this.pos.inRangeTo(t, 3)) return ERR_NOT_IN_RANGE;
    const n = Math.min(this.getActiveBodyparts(WORK), this.store.energy || 0);
    if (n <= 0) return ERR_NOT_ENOUGH_RESOURCES;
    addRes(this.store, RESOURCE_ENERGY, -n);
    t.hits = Math.min(t.hitsMax, t.hits + n * 100);
    return OK;
  }
  upgradeController(c) {
    if (!this.pos.inRangeTo(c, 3)) return ERR_NOT_IN_RANGE;
    const n = Math.min(this.getActiveBodyparts(WORK), this.store.energy || 0);
    if (n <= 0) return ERR_NOT_ENOUGH_RESOURCES;
    addRes(this.store, RESOURCE_ENERGY, -n);
    c.progress += n * FAST;
    c.ticksToDowngrade = CONTROLLER_DOWNGRADE[c.level];
    stats.upgraded += n;
    if (c.level < 8 && c.progress >= c.progressTotal) {
      c.progress -= c.progressTotal;
      c.level++;
      stats.rclAt[c.level] = Game.time;
    }
    return OK;
  }
  signController(c, text) {
    if (!this.pos.isNearTo(c)) return ERR_NOT_IN_RANGE;
    c.sign = {text, username: 'me'};
    return OK;
  }
  claimController() {
    return ERR_INVALID_TARGET;
  }
  attackController() {
    return ERR_INVALID_TARGET;
  }
  attack(t) {
    if (!this.pos.isNearTo(t)) return ERR_NOT_IN_RANGE;
    t.hits -= this.getActiveBodyparts(ATTACK) * 30;
    return OK;
  }
}
global.Creep = Creep;

function dropAt(pos, amount) {
  if (amount <= 0) return;
  const container = pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === 'container');
  if (container) {
    const fit = Math.min(amount, container.store.getFreeCapacity());
    addRes(container.store, RESOURCE_ENERGY, fit);
    amount -= fit;
  }
  if (amount <= 0) return;
  const pile = [...objects.values()].find((o) => o instanceof Resource && o.pos.isEqualTo(pos));
  if (pile) pile.amount += amount;
  else new Resource(pos.x, pos.y, amount);
}

// ------------------------------------------------------------------ room
function matches(o, filter) {
  if (!filter) return true;
  if (typeof filter === 'function') return filter(o);
  return Object.keys(filter).every((k) => o[k] === filter[k]);
}
const all = () => [...objects.values()];
const room = {
  name: ROOM,
  memory: undefined,
  visual: {text() {}, circle() {}, poly() {}, line() {}, rect() {}},
  getTerrain: () => terrain,
  get energyAvailable() {
    return this.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === 'spawn' || s.structureType === 'extension')
      .reduce((a, s) => a + (s.store.energy || 0), 0);
  },
  get energyCapacityAvailable() {
    return this.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === 'spawn' || s.structureType === 'extension')
      .reduce((a, s) => a + s.store.getCapacity(RESOURCE_ENERGY), 0);
  },
  get storage() {
    return all().find((o) => o.structureType === 'storage' && o instanceof Structure);
  },
  get terminal() {
    return all().find((o) => o.structureType === 'terminal' && o instanceof Structure);
  },
  find(type, opts) {
    let list;
    switch (type) {
      case FIND_CREEPS: list = all().filter((o) => o instanceof Creep && !o.spawning); break;
      case FIND_MY_CREEPS: list = all().filter((o) => o instanceof Creep && o.my); break;
      case FIND_HOSTILE_CREEPS: list = all().filter((o) => o instanceof Creep && !o.my); break;
      case FIND_SOURCES: list = all().filter((o) => o instanceof Source); break;
      case FIND_SOURCES_ACTIVE: list = all().filter((o) => o instanceof Source && o.energy > 0); break;
      case FIND_MINERALS: list = all().filter((o) => o instanceof Mineral); break;
      case FIND_DROPPED_RESOURCES: list = all().filter((o) => o instanceof Resource); break;
      case FIND_TOMBSTONES: list = all().filter((o) => o instanceof Tombstone); break;
      case FIND_STRUCTURES: list = all().filter((o) => o instanceof Structure); break;
      case FIND_MY_STRUCTURES: list = all().filter((o) => o instanceof Structure && o.my); break;
      case FIND_MY_SPAWNS: list = all().filter((o) => o instanceof StructureSpawn); break;
      case FIND_CONSTRUCTION_SITES:
      case FIND_MY_CONSTRUCTION_SITES: list = all().filter((o) => o instanceof ConstructionSite); break;
      default: list = [];
    }
    return list.filter((o) => matches(o, opts && opts.filter));
  },
  createConstructionSite(x, y, type) {
    const pos = new RoomPosition(x, y, ROOM);
    if (terrain.get(x, y) === 1 && type !== 'road') return ERR_INVALID_TARGET;
    if (all().some((o) => o instanceof ConstructionSite && o.pos.isEqualTo(pos))) return ERR_INVALID_TARGET;
    if (pos.lookFor(LOOK_STRUCTURES).some((s) => s.structureType === type || (type !== 'road' && s.structureType !== 'road'))) return ERR_INVALID_TARGET;
    const have = all().filter((o) => (o instanceof Structure || o instanceof ConstructionSite) && o.structureType === type).length;
    if (have >= CONTROLLER_STRUCTURES[type][controller.level]) return ERR_RCL_NOT_ENOUGH;
    new ConstructionSite(x, y, type);
    return OK;
  },
  lookForAt(type, x, y) {
    return new RoomPosition(x, y, ROOM).lookFor(type);
  },
};
Object.defineProperty(room, 'controller', {get: () => controller});
Object.defineProperty(room, 'memory', {get: () => Memory.rooms[ROOM] || (Memory.rooms[ROOM] = {})});

// ------------------------------------------------------------------ PathFinder
class CostMatrix {
  constructor() {
    this._bits = new Uint8Array(2500);
  }
  get(x, y) {
    return this._bits[y * 50 + x];
  }
  set(x, y, v) {
    this._bits[y * 50 + x] = v;
  }
  clone() {
    const c = new CostMatrix();
    c._bits.set(this._bits);
    return c;
  }
  serialize() {
    return Array.from(this._bits);
  }
}
global.PathFinder = {
  CostMatrix,
  search(origin, goal, opts = {}) {
    const goals = Array.isArray(goal) ? goal : [goal];
    const g = goals[0];
    const gpos = g.pos || g;
    const range = g.range || 0;
    let matrix = opts.roomCallback ? opts.roomCallback(ROOM) : undefined;
    if (matrix === false) return {path: [], incomplete: true, ops: 0};
    const plain = opts.plainCost || 1;
    const swamp = opts.swampCost || 5;
    const cost = (x, y) => {
      if (x < 0 || y < 0 || x > 49 || y > 49) return 255;
      const m = matrix ? matrix.get(x, y) : 0;
      if (m) return m;
      const t = terrain.get(x, y);
      return t === 1 ? 255 : t === 2 ? swamp : plain;
    };
    const h = (x, y) => Math.max(0, Math.max(Math.abs(x - gpos.x), Math.abs(y - gpos.y)) - range);
    const start = origin.y * 50 + origin.x;
    const dist = new Float64Array(2500).fill(Infinity);
    const prev = new Int32Array(2500).fill(-1);
    dist[start] = 0;
    const open = [[h(origin.x, origin.y), start]];
    let found = -1;
    let ops = 0;
    while (open.length && ops < (opts.maxOps || 2000) * 4) {
      ops++;
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      const cx = cur % 50;
      const cy = Math.floor(cur / 50);
      if (h(cx, cy) === 0) {
        found = cur;
        break;
      }
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = cx + dx;
        const ny = cy + dy;
        const c = cost(nx, ny);
        if (c >= 255) continue;
        const n = ny * 50 + nx;
        const nd = dist[cur] + c;
        if (nd < dist[n]) {
          dist[n] = nd;
          prev[n] = cur;
          open.push([nd + h(nx, ny), n]);
        }
      }
    }
    if (found < 0) return {path: [], incomplete: true, ops};
    const pathOut = [];
    for (let p = found; p !== start; p = prev[p]) pathOut.unshift(new RoomPosition(p % 50, Math.floor(p / 50), ROOM));
    return {path: pathOut, incomplete: false, ops};
  },
};

// ------------------------------------------------------------------ Game
const stats = {spawned: {}, built: {}, harvested: 0, upgraded: 0, spawnEnergy: 0, rclAt: {}, errors: 0, safeModes: 0, cpu: []};
global.Memory = {creeps: {}, rooms: {}, flags: {}, spawns: {}};
global.Game = {
  time: 1,
  creeps: {},
  spawns: {},
  flags: {},
  rooms: {[ROOM]: room},
  constructionSites: {},
  gcl: {level: GCL, progress: 0, progressTotal: 1000000},
  cpu: {limit: 20, tickLimit: 500, bucket: 10000, getUsed: () => Number(process.hrtime.bigint() - BigInt(cpuStart)) / 1e6,
    getHeapStatistics: () => ({})},
  map: {
    getRoomTerrain: () => terrain,
    getRoomLinearDistance: (a, b) => {
      const p = parseRoom(a);
      const q = parseRoom(b);
      return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    },
    // Rooms connect orthogonally; WALLED rooms have no exits at all.
    findRoute: (a, b) => {
      if (WALLED.has(b) || WALLED.has(a)) return ERR_NO_PATH;
      const p = parseRoom(a);
      const q = parseRoom(b);
      const steps = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
      return new Array(steps).fill(0).map(() => ({exit: 1, room: b}));
    },
    describeExits: () => ({}),
    getRoomStatus: () => ({status: 'normal'}),
  },
  getObjectById: (id) => objects.get(id) || null,
  notify() {},
};
Object.defineProperty(Game, 'constructionSites', {get: () => {
  const o = {};
  for (const s of all()) if (s instanceof ConstructionSite) o[s.id] = s;
  return o;
}});

// layout
[[10, 10], [40, 35], [25, 8], [8, 40], [25, 25]].forEach(([x, y]) => {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) clearTile(x + dx, y + dy);
});
new Source(10, 10);
new Source(40, 35);
new Mineral(8, 40);
const controller = new StructureController(25, 8);
makeStructure(25, 25, 'spawn');

function parseRoom(name) {
  const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
  return {x: m[1] === 'W' ? -m[2] - 1 : +m[2], y: m[3] === 'N' ? -m[4] - 1 : +m[4]};
}
const WALLED = new Set(NEIGHBORS ? ['W3N3'] : []);

// --neighbors: visible fake rooms around ROOM with different traits.
function fakeRoom(name, spec) {
  const pos = (x, y) => new RoomPosition(x, y, name);
  const sources = new Array(spec.src || 0).fill(0).map((_, i) => ({id: 'src' + name + i, pos: pos(10 + i * 20, 10), energy: 3000}));
  Game.rooms[name] = {
    name, visual: room.visual, energyAvailable: 0, energyCapacityAvailable: 0,
    controller: spec.noCtrl ? undefined : {pos: pos(25, 25), my: false, level: spec.owner ? 4 : 0,
      owner: spec.owner ? {username: spec.owner} : undefined,
      reservation: spec.reserver ? {username: spec.reserver, ticksToEnd: 4000} : undefined},
    getTerrain: () => terrain,
    find(type) {
      if (type === FIND_SOURCES) return sources;
      if (type === FIND_MINERALS) return [{mineralType: spec.min || 'H', pos: pos(40, 40)}];
      if (type === FIND_STRUCTURES) return spec.sk ? [{structureType: 'keeperLair', pos: pos(5, 5)}] : [];
      return [];
    },
  };
}
if (NEIGHBORS) {
  fakeRoom('W1N2', {src: 2, min: 'X'}); // best: 2 sources + catalyst
  fakeRoom('W3N2', {src: 1, min: 'O'});
  fakeRoom('W2N1', {src: 2, min: 'H'}); // same mineral as home
  fakeRoom('W2N3', {src: 2, owner: 'enemy'}); // owned -> skip
  fakeRoom('W1N1', {src: 1, reserver: 'Invader'}); // reserved -> skip
  fakeRoom('W1N3', {src: 2, min: 'U'}); // diagonal (2 hops)
  fakeRoom('W3N1', {src: 1, sk: true}); // keepers -> skip
  // W3N3 is WALLED (no route) and never visible
}

if (LEGACY) {
  // creeps from "old code" with unknown roles
  Memory.creeps.oldHarvester = {role: 'harvester', sourceId: 'x'};
  const c = new Creep(24, 24, 'oldHarvester', [WORK, CARRY, MOVE]);
  c.ticksToLive = 800;
  Memory.creeps.oldMiner = {role: 'miner', sourceId: 'x'};
  const m = new Creep(26, 24, 'oldMiner', [WORK, WORK, MOVE]);
  m.ticksToLive = 900;
}

// ------------------------------------------------------------------ run
const SRC = path.join(__dirname, '..', 'src');
const realLog = console.log;
let printed = 0;
console.log = (...a) => {
  const line = a.join(' ');
  if (line.includes('ERROR')) stats.errors++;
  if (printed < 400) realLog(line.replace(/<[^>]+>/g, ''));
  printed++;
};

function loadBot() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC)) delete require.cache[k];
  return require(path.join(SRC, 'main.js'));
}
let bot = loadBot();

function endOfTick() {
  // movement
  const occupied = new Set(all().filter((o) => o instanceof Creep).map((c) => c.pos.y * 50 + c.pos.x));
  const blocking = new Set(all().filter((o) => o instanceof Structure && OBSTACLE_OBJECT_TYPES.includes(o.structureType)).map((s) => s.pos.y * 50 + s.pos.x));
  for (const s of all()) if (s instanceof Source || s instanceof Mineral) blocking.add(s.pos.y * 50 + s.pos.x);
  blocking.add(controller.pos.y * 50 + controller.pos.x);
  for (const c of all().filter((o) => o instanceof Creep)) {
    const dir = c.intents.move;
    c.intents = {};
    if (!dir || c.spawning) continue;
    const [dx, dy] = DIRS[dir];
    const nx = c.pos.x + dx;
    const ny = c.pos.y + dy;
    const key = ny * 50 + nx;
    if (nx < 0 || ny < 0 || nx > 49 || ny > 49 || terrain.get(nx, ny) === 1 || blocking.has(key) || occupied.has(key)) continue;
    occupied.delete(c.pos.y * 50 + c.pos.x);
    occupied.add(key);
    c.pos = new RoomPosition(nx, ny, ROOM);
  }
  // spawning / aging
  for (const s of room.find(FIND_MY_SPAWNS)) {
    if (s.spawning && --s.spawning.remainingTime <= 0) {
      const c = Game.creeps[s.spawning.name];
      if (c) {
        c.spawning = false;
        c.ticksToLive = CREEP_LIFE_TIME;
        // step off the spawn
        for (const [dx, dy] of Object.values(DIRS)) {
          const nx = s.pos.x + dx;
          const ny = s.pos.y + dy;
          if (terrain.get(nx, ny) !== 1 && !occupied.has(ny * 50 + nx) && !blocking.has(ny * 50 + nx)) {
            c.pos = new RoomPosition(nx, ny, ROOM);
            occupied.add(ny * 50 + nx);
            break;
          }
        }
      }
      s.spawning = null;
    }
    if ((s.store.energy || 0) < 300 && room.energyAvailable < 300) addRes(s.store, RESOURCE_ENERGY, 1);
  }
  for (const c of all().filter((o) => o instanceof Creep)) {
    if (c.hits <= 0) {
      c.die();
      if (!c.my) stats.killed = (stats.killed || 0) + 1;
      continue;
    }
    if (!c.spawning && c.ticksToLive !== undefined && --c.ticksToLive <= 0) c.die();
  }
  for (const s of all().filter((o) => o instanceof Source)) {
    if (--s.ticksToRegeneration <= 0) {
      s.energy = s.energyCapacity;
      s.ticksToRegeneration = 300;
    }
  }
  for (const o of all()) {
    if (o instanceof Resource) {
      o.amount -= Math.ceil(o.amount / 1000);
      if (o.amount <= 0) objects.delete(o.id);
    }
    if (o instanceof Tombstone && --o.ticksToDecay <= 0) objects.delete(o.id);
    if (o instanceof StructureLink && o.cooldown > 0) o.cooldown--;
  }
  controller.ticksToDowngrade--;
  if (controller.ticksToDowngrade <= 0) throw new Error('controller downgraded');
}

const t0 = Date.now();
for (let t = 1; t <= TICKS; t++) {
  Game.time = t;
  if (RESET_EVERY && t % RESET_EVERY === 0) bot = loadBot();
  if (INVADER_AT && t === INVADER_AT) {
    const inv = new Creep(30, 30, 'invader1', [TOUGH, ATTACK, ATTACK, MOVE, MOVE, HEAL], false, 'Invader');
    inv.ticksToLive = 1500;
  }
  cpuStart = process.hrtime.bigint();
  try {
    bot.loop();
  } catch (e) {
    stats.errors++;
    realLog(`[${t}] LOOP CRASH ${e.stack}`);
    if (stats.errors > 20) break;
  }
  stats.cpu.push(Game.cpu.getUsed());
  // Memory must survive serialization like the real game.
  global.Memory = JSON.parse(JSON.stringify(Memory));
  endOfTick();
  if (process.env.DUMP && t === +process.env.DUMP) { for (const c of Object.values(Game.creeps)) realLog(c.name, JSON.stringify(c.pos), JSON.stringify(c.store), JSON.stringify(c.memory)); for (const r of room.find(FIND_DROPPED_RESOURCES)) realLog("pile", JSON.stringify(r.pos), r.amount); realLog(JSON.stringify(Memory.rooms[ROOM].plan.src), JSON.stringify(Memory.rooms[ROOM].plan.ctrl)); }
  if (t % 1000 === 0) {
    const roles = {};
    for (const c of Object.values(Game.creeps)) roles[c.memory.role] = (roles[c.memory.role] || 0) + 1;
    const ext = room.find(FIND_STRUCTURES).filter((s) => s.structureType === 'extension').length;
    realLog(`t=${t} RCL ${controller.level} (${controller.progress}/${controller.progressTotal}) energy ${room.energyAvailable}/${room.energyCapacityAvailable} ext ${ext} storage ${room.storage ? room.storage.store.energy || 0 : '-'} sites ${room.find(FIND_CONSTRUCTION_SITES).length} creeps ${JSON.stringify(roles)}`);
  }
}

if (global.expansionReport) { console.log = realLog; global.expansionReport(); }
const sorted = stats.cpu.slice().sort((a, b) => a - b);
realLog('\n=== SIM SUMMARY ===');
realLog(`ticks ${Game.time}  wall ${(Date.now() - t0) / 1000}s  errors ${stats.errors}  safeModes ${stats.safeModes}  invadersKilled ${stats.killed || 0}`);
realLog(`RCL ${controller.level}  reached at ${JSON.stringify(stats.rclAt)}`);
realLog(`harvested ${stats.harvested}  upgraded ${stats.upgraded}  spawnEnergy ${stats.spawnEnergy}`);
realLog(`spawned ${JSON.stringify(stats.spawned)}`);
realLog(`built ${JSON.stringify(stats.built)}`);
realLog(`cpu(ms, node not screeps) median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)} p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)}`);
realLog(`Memory size ${JSON.stringify(Memory).length} bytes`);
process.exitCode = stats.errors ? 1 : 0;
