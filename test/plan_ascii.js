'use strict';
/**
 * Renders the planner output for the sim room as ASCII.
 * Usage: node test/plan_ascii.js
 * Legend: S spawn  E extension  T tower  O storage  M terminal  L link
 *         C container  X extractor  F/P/N/V factory/powerSpawn/nuker/observer
 *         + road  # wall  ~ swamp  @ source  m mineral  K controller
 */
process.argv = [process.argv[0], process.argv[1], '1'];
const origLog = console.log;
console.log = () => {};
require('./sim.js');
console.log = origLog;

const ROOM = Object.keys(Memory.rooms)[0];
const plan = Memory.rooms[ROOM].plan;
const grid = [];
const terrain = Game.map.getRoomTerrain(ROOM);
for (let y = 0; y < 50; y++) {
  grid.push([]);
  for (let x = 0; x < 50; x++) grid[y].push(['.', '#', '~'][terrain.get(x, y)]);
}
const put = (p, ch) => grid[Math.floor(p / 50)][p % 50] = ch;
plan.road.concat(plan.lroad).forEach((p) => put(p, '+'));
const marks = {spawn: 'S', extension: 'E', tower: 'T', storage: 'O', terminal: 'M', link: 'L',
  factory: 'F', powerSpawn: 'P', nuker: 'N', observer: 'V'};
for (const k of Object.keys(marks)) plan[k].forEach((p) => put(p, marks[k]));
for (const id of Object.keys(plan.src)) {
  put(plan.src[id].c, 'C');
  if (plan.src[id].l !== undefined) put(plan.src[id].l, 'L');
}
put(plan.ctrl.c, 'C');
if (plan.ctrl.l !== undefined) put(plan.ctrl.l, 'L');
if (plan.min.c !== undefined) put(plan.min.c, 'C');
for (const s of Game.rooms[ROOM].find(FIND_SOURCES)) grid[s.pos.y][s.pos.x] = '@';
const m = Game.rooms[ROOM].find(FIND_MINERALS)[0];
grid[m.pos.y][m.pos.x] = 'm';
const c = Game.rooms[ROOM].controller;
grid[c.pos.y][c.pos.x] = 'K';
console.log(grid.map((r) => r.join('')).join('\n'));
console.log(`extensions ${plan.extension.length}, towers ${plan.tower.length}, spawns ${plan.spawn.length}, ` +
  `roads ${plan.road.length}+${plan.lroad.length}`);
