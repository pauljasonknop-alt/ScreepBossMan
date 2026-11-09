'use strict';

/**
 * Base planner + construction manager.
 *
 * Layout: a checkerboard "lattice" around the anchor (first spawn). Structures
 * sit on tiles with the anchor's parity, roads on the other parity. Slots are
 * discovered by a BFS over road tiles starting next to the anchor, so every
 * planned structure is connected to the core by road and slots fill outward
 * by distance (closest slots get storage/link/towers first).
 *
 * Logistic roads are then pathed from the storage slot to every source,
 * the controller and the mineral; containers sit at the end of those roads
 * and links next to the containers.
 *
 * Plan is stored in Memory.rooms[name].plan with positions packed as y*50+x.
 * Delete that key (or bump PLAN_VERSION) to re-plan.
 */

const config = require('./core.config');
const cache = require('./core.cache');
const log = require('./core.log');
const {invalidateMatrix} = require('./core.move');

const PLAN_VERSION = 1;

const pack = (x, y) => y * 50 + x;
const unpackX = (p) => p % 50;
const unpackY = (p) => Math.floor(p / 50);

const ORTHO = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAG = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
const ALL = ORTHO.concat(DIAG);

// Slot assignment order (closest slots are assigned first).
const SLOT_ORDER = [].concat(
  ['storage', 'link', 'terminal', 'spawn', 'tower', 'tower', 'tower'],
  new Array(30).fill('extension'),
  ['spawn', 'tower', 'tower', 'tower'],
  new Array(30).fill('extension'),
  ['factory', 'powerSpawn', 'nuker', 'observer'],
);

// Structures that block a slot if they already exist there.
function isSolid(structureType) {
  return structureType !== STRUCTURE_ROAD && structureType !== STRUCTURE_CONTAINER &&
    structureType !== STRUCTURE_RAMPART;
}

// ------------------------------------------------------------ anchor choice

/** Chebyshev distance to the nearest wall/border for every tile. */
function distanceTransform(terrain) {
  const dt = new Uint8Array(2500);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const border = x === 0 || y === 0 || x === 49 || y === 49;
      dt[pack(x, y)] = border || terrain.get(x, y) === TERRAIN_MASK_WALL ? 0 : 255;
    }
  }
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      const p = pack(x, y);
      if (dt[p] === 0) continue;
      dt[p] = Math.min(dt[p], dt[pack(x - 1, y)] + 1, dt[pack(x, y - 1)] + 1,
        dt[pack(x - 1, y - 1)] + 1, dt[pack(x + 1, y - 1)] + 1);
    }
  }
  for (let y = 48; y > 0; y--) {
    for (let x = 48; x > 0; x--) {
      const p = pack(x, y);
      if (dt[p] === 0) continue;
      dt[p] = Math.min(dt[p], dt[pack(x + 1, y)] + 1, dt[pack(x, y + 1)] + 1,
        dt[pack(x + 1, y + 1)] + 1, dt[pack(x - 1, y + 1)] + 1);
    }
  }
  return dt;
}

function chooseAnchor(room, terrain) {
  const dt = distanceTransform(terrain);
  const targets = room.find(FIND_SOURCES).map((s) => s.pos).concat([room.controller.pos]);
  for (const minSpace of [4, 3, 2]) {
    let best;
    let bestScore = Infinity;
    for (let y = 6; y <= 43; y++) {
      for (let x = 6; x <= 43; x++) {
        if (dt[pack(x, y)] < minSpace) continue;
        let score = 0;
        for (const t of targets) {
          score += Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
        }
        if (score < bestScore) {
          bestScore = score;
          best = {x, y};
        }
      }
    }
    if (best) {
      return best;
    }
  }
  return undefined;
}

// --------------------------------------------------------------- planning

function makePlan(room) {
  const terrain = room.getTerrain();
  const isWall = (x, y) => terrain.get(x, y) === TERRAIN_MASK_WALL;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const anchor = spawn ? {x: spawn.pos.x, y: spawn.pos.y} : chooseAnchor(room, terrain);
  if (!anchor) {
    return null;
  }
  const anchorP = pack(anchor.x, anchor.y);
  const parity = (anchor.x + anchor.y) % 2;
  const sources = room.find(FIND_SOURCES);
  const mineral = room.find(FIND_MINERALS)[0];
  const controller = room.controller;

  // Tiles already occupied by solid structures (legacy buildings stay put).
  const solid = new Uint8Array(2500);
  for (const s of room.find(FIND_STRUCTURES)) {
    if (isSolid(s.structureType)) {
      solid[pack(s.pos.x, s.pos.y)] = 1;
    }
  }

  // Where structures may NOT be placed.
  const noSlot = new Uint8Array(2500);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (x < 3 || y < 3 || x > 46 || y > 46 || isWall(x, y)) {
        noSlot[pack(x, y)] = 1;
      }
    }
  }
  const keepClear = (pos, range) => {
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x >= 0 && y >= 0 && x < 50 && y < 50) noSlot[pack(x, y)] = 1;
      }
    }
  };
  sources.forEach((s) => keepClear(s.pos, 2));
  if (mineral) keepClear(mineral.pos, 1);
  keepClear(controller.pos, 3);

  const roadOk = (x, y) => x >= 1 && y >= 1 && x <= 48 && y <= 48 && !isWall(x, y) && !solid[pack(x, y)];

  // BFS over road tiles, collecting adjacent structure slots in order.
  const roadParent = new Int16Array(2500).fill(-2); // -2 unvisited, -1 root
  const slotRoad = {};
  const slots = [];
  const queue = [];
  // Seed with every road-parity tile within range 2 of the anchor (closest
  // first), so legacy buildings hugging the spawn can't box the BFS in.
  const seeds = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if ((x + y) % 2 !== parity && roadOk(x, y)) {
        seeds.push({p: pack(x, y), d: Math.abs(dx) + Math.abs(dy)});
      }
    }
  }
  seeds.sort((a, b) => a.d - b.d).forEach((s) => {
    roadParent[s.p] = -1;
    queue.push(s.p);
  });
  for (let head = 0; head < queue.length && slots.length < SLOT_ORDER.length; head++) {
    const r = queue[head];
    const rx = unpackX(r);
    const ry = unpackY(r);
    for (const [dx, dy] of ORTHO) {
      const x = rx + dx;
      const y = ry + dy;
      const p = pack(x, y);
      if ((x + y) % 2 === parity && p !== anchorP && !noSlot[p] && !solid[p] && slotRoad[p] === undefined) {
        slotRoad[p] = r;
        slots.push(p);
      }
    }
    for (const [dx, dy] of DIAG) {
      const x = rx + dx;
      const y = ry + dy;
      if (roadOk(x, y) && roadParent[pack(x, y)] === -2) {
        roadParent[pack(x, y)] = r;
        queue.push(pack(x, y));
      }
    }
  }

  const plan = {
    v: PLAN_VERSION, anchor: anchorP,
    spawn: [anchorP], extension: [], tower: [], storage: [], terminal: [], link: [],
    factory: [], powerSpawn: [], nuker: [], observer: [],
    road: [], lroad: [], src: {}, ctrl: {}, min: {},
  };
  const roadSet = {};
  const addCoreRoad = (r) => {
    while (r >= 0 && !roadSet[r]) {
      roadSet[r] = true;
      plan.road.push(r);
      r = roadParent[r];
    }
  };
  for (let i = 0; i < slots.length; i++) {
    plan[SLOT_ORDER[i]].push(slots[i]);
    addCoreRoad(slotRoad[slots[i]]);
  }

  // Logistic roads + containers + links.
  const taken = new Uint8Array(2500); // planned solid structures
  for (const key of Object.keys(plan)) {
    if (Array.isArray(plan[key]) && key !== 'road' && key !== 'lroad') {
      plan[key].forEach((p) => taken[p] = 1);
    }
  }
  const matrix = new PathFinder.CostMatrix();
  for (let p = 0; p < 2500; p++) {
    if (taken[p] || solid[p]) matrix.set(unpackX(p), unpackY(p), 0xff);
  }
  plan.road.forEach((p) => matrix.set(unpackX(p), unpackY(p), 1));
  sources.forEach((s) => matrix.set(s.pos.x, s.pos.y, 0xff));
  if (mineral) matrix.set(mineral.pos.x, mineral.pos.y, 0xff);
  matrix.set(controller.pos.x, controller.pos.y, 0xff);

  const origin = new RoomPosition(unpackX(plan.storage[0] || anchorP), unpackY(plan.storage[0] || anchorP), room.name);
  const pathTo = (pos, range) => {
    const res = PathFinder.search(origin, {pos, range}, {
      plainCost: 2, swampCost: 4, maxRooms: 1, maxOps: 10000,
      roomCallback: () => matrix,
    });
    if (res.incomplete || res.path.length === 0) {
      return null;
    }
    const container = res.path[res.path.length - 1];
    for (const step of res.path.slice(0, -1)) {
      const p = pack(step.x, step.y);
      if (!roadSet[p]) {
        roadSet[p] = true;
        plan.lroad.push(p);
        matrix.set(step.x, step.y, 1);
      }
    }
    const c = pack(container.x, container.y);
    matrix.set(container.x, container.y, 0xff);
    return c;
  };
  const linkNextTo = (c, near) => {
    const cx = unpackX(c);
    const cy = unpackY(c);
    let best;
    let bestRange = Infinity;
    for (const [dx, dy] of ALL) {
      const x = cx + dx;
      const y = cy + dy;
      const p = pack(x, y);
      if (x < 1 || y < 1 || x > 48 || y > 48 || isWall(x, y) || roadSet[p] || taken[p] || solid[p] ||
        matrix.get(x, y) === 0xff) continue;
      const range = near ? Math.max(Math.abs(near.x - x), Math.abs(near.y - y)) : 0;
      if (range < bestRange) {
        bestRange = range;
        best = p;
      }
    }
    if (best !== undefined) {
      taken[best] = 1;
      matrix.set(unpackX(best), unpackY(best), 0xff);
    }
    return best;
  };

  const sortedSources = sources.slice().sort((a, b) => origin.getRangeTo(a) - origin.getRangeTo(b));
  for (const s of sortedSources) {
    const c = pathTo(s.pos, 1);
    if (c !== null) {
      plan.src[s.id] = {c, l: linkNextTo(c, origin), d: origin.getRangeTo(s)};
    }
  }
  const cc = pathTo(controller.pos, 2);
  if (cc !== null) {
    plan.ctrl = {c: cc, l: linkNextTo(cc, controller.pos)};
  }
  if (mineral) {
    const mc = pathTo(mineral.pos, 1);
    if (mc !== null) {
      plan.min = {c: mc, e: pack(mineral.pos.x, mineral.pos.y)};
    }
  }
  return plan;
}

function ensurePlan(colony) {
  const plan = colony.memory.plan;
  // Stale plan (e.g. after a respawn): a spawn exists but not at the anchor.
  const spawns = colony.spawns;
  const stale = plan && spawns.length &&
    !spawns.some((s) => s.pos.y * 50 + s.pos.x === plan.anchor);
  if (plan && plan.v === PLAN_VERSION && !stale) {
    return plan;
  }
  const start = Game.cpu.getUsed();
  const fresh = makePlan(colony.room);
  if (fresh) {
    colony.memory.plan = fresh;
    log.info(colony.name, `base planned in ${(Game.cpu.getUsed() - start).toFixed(1)} CPU ` +
      `(${fresh.extension.length} extension slots, ${fresh.road.length + fresh.lroad.length} roads)`);
  }
  return fresh;
}

// ----------------------------------------------------------- construction

/** Ordered build list: [structureType, minRcl, packedPositions[]] */
function buildList(colony, plan) {
  const sourceIds = Object.keys(plan.src).sort((a, b) => plan.src[b].d - plan.src[a].d); // far first
  const sourceLinks = sourceIds.map((id) => plan.src[id].l).filter((p) => p !== undefined);
  const links = plan.link.concat(plan.ctrl.l !== undefined ? [plan.ctrl.l] : [], sourceLinks);
  const srcContainers = Object.keys(plan.src).map((id) => plan.src[id].c);
  const coreRoads = colony.level >= config.planner.minRclForRoads ?
    plan.road.filter((p) => hasBuiltNeighbour(colony, p)) : [];
  return [
    [STRUCTURE_SPAWN, 1, plan.spawn],
    [STRUCTURE_EXTENSION, 2, plan.extension],
    [STRUCTURE_TOWER, 3, plan.tower],
    [STRUCTURE_CONTAINER, config.planner.minRclForContainers, srcContainers],
    [STRUCTURE_CONTAINER, config.planner.minRclForContainers, plan.ctrl.c !== undefined ? [plan.ctrl.c] : []],
    [STRUCTURE_STORAGE, 4, plan.storage],
    [STRUCTURE_LINK, 5, links],
    [STRUCTURE_ROAD, config.planner.minRclForRoads, plan.lroad],
    [STRUCTURE_ROAD, config.planner.minRclForRoads, coreRoads],
    [STRUCTURE_TERMINAL, 6, plan.terminal],
    [STRUCTURE_EXTRACTOR, 6, plan.min.e !== undefined ? [plan.min.e] : []],
    [STRUCTURE_CONTAINER, 6, plan.min.c !== undefined ? [plan.min.c] : []],
    [STRUCTURE_FACTORY, 7, plan.factory],
    [STRUCTURE_POWER_SPAWN, 8, plan.powerSpawn],
    [STRUCTURE_NUKER, 8, plan.nuker],
    [STRUCTURE_OBSERVER, 8, plan.observer],
  ];
}

function hasBuiltNeighbour(colony, p) {
  const byPos = cache.structuresByPos(colony.room);
  const x = unpackX(p);
  const y = unpackY(p);
  for (const [dx, dy] of ORTHO) {
    const list = byPos[pack(x + dx, y + dy)];
    if (list && list.some((s) => isSolid(s.structureType))) {
      return true;
    }
  }
  return false;
}

function placeSites(colony, plan) {
  const room = colony.room;
  const rcl = colony.level;
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  let budget = config.planner.maxSitesPerRoom - sites.length;
  if (budget <= 0 || Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES - 5) {
    return;
  }
  const byPos = cache.structuresByPos(room);
  const siteByPos = cache.sitesByPos(room);
  const siteCount = {};
  sites.forEach((s) => siteCount[s.structureType] = (siteCount[s.structureType] || 0) + 1);

  let placed = 0;
  for (const [type, minRcl, positions] of buildList(colony, plan)) {
    if (rcl < minRcl) continue;
    let have = colony.structures(type).length + (siteCount[type] || 0);
    const limit = CONTROLLER_STRUCTURES[type][rcl];
    for (const p of positions) {
      if (have >= limit || budget <= 0) break;
      if (siteByPos[p]) continue;
      const existing = byPos[p] || [];
      if (existing.some((s) => s.structureType === type)) continue;
      if (type !== STRUCTURE_ROAD && type !== STRUCTURE_RAMPART && existing.some((s) => isSolid(s.structureType))) continue;
      const rc = room.createConstructionSite(unpackX(p), unpackY(p), type);
      if (rc === OK) {
        have++;
        budget--;
        placed++;
        siteCount[type] = (siteCount[type] || 0) + 1;
      } else if (rc !== ERR_RCL_NOT_ENOUGH && rc !== ERR_INVALID_TARGET) {
        log.warn(colony.name, `createConstructionSite ${type} @${unpackX(p)},${unpackY(p)} -> ${rc}`);
      }
    }
    if (budget <= 0) break;
  }
  if (placed) {
    invalidateMatrix(colony.name);
  }
}

function draw(colony, plan) {
  const v = colony.room.visual;
  const dot = (p, color, r) => v.circle(unpackX(p), unpackY(p), {radius: r || 0.2, fill: color, opacity: 0.5});
  plan.road.forEach((p) => dot(p, '#666', 0.1));
  plan.lroad.forEach((p) => dot(p, '#999', 0.1));
  plan.extension.forEach((p) => dot(p, '#ff0'));
  plan.tower.forEach((p) => dot(p, '#f00', 0.3));
  plan.spawn.forEach((p) => dot(p, '#0ff', 0.3));
  plan.storage.concat(plan.terminal).forEach((p) => dot(p, '#fff', 0.35));
  plan.link.forEach((p) => dot(p, '#0f0', 0.25));
  for (const id of Object.keys(plan.src)) {
    dot(plan.src[id].c, '#a52', 0.3);
    if (plan.src[id].l !== undefined) dot(plan.src[id].l, '#0f0', 0.25);
  }
  if (plan.ctrl.c !== undefined) dot(plan.ctrl.c, '#a52', 0.3);
  if (plan.ctrl.l !== undefined) dot(plan.ctrl.l, '#0f0', 0.25);
}

function run(colony) {
  if (Game.cpu.bucket < config.cpu.plannerMinBucket && colony.memory.plan) {
    return;
  }
  const plan = ensurePlan(colony);
  if (!plan) {
    return;
  }
  if (config.visuals.plan) {
    draw(colony, plan);
  }
  // Check every `interval` ticks, offset per room, and right after an RCL change.
  const offset = (plan.anchor % config.planner.interval);
  const rclChanged = colony.memory.lastRcl !== colony.level;
  if (rclChanged || (Game.time + offset) % config.planner.interval === 0) {
    colony.memory.lastRcl = colony.level;
    placeSites(colony, plan);
  }
}

module.exports = {run, makePlan, ensurePlan, distanceTransform};
