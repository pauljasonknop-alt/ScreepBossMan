'use strict';

/**
 * Room-name geometry.
 *
 * World coordinates: E0 -> x=0, E1 -> x=1, W0 -> x=-1, W1 -> x=-2;
 *                    S0 -> y=0, S1 -> y=1, N0 -> y=-1, N1 -> y=-2.
 */

const NAME = /^([WE])(\d+)([NS])(\d+)$/;

function parse(name) {
  const m = NAME.exec(name);
  if (!m) return null;
  const h = Number(m[2]);
  const v = Number(m[4]);
  return {
    x: m[1] === 'W' ? -h - 1 : h,
    y: m[3] === 'N' ? -v - 1 : v,
    h, v,
  };
}

function format(x, y) {
  const h = x < 0 ? `W${-x - 1}` : `E${x}`;
  const v = y < 0 ? `N${-y - 1}` : `S${y}`;
  return h + v;
}

function offset(name, dx, dy) {
  const p = parse(name);
  return p ? format(p.x + dx, p.y + dy) : null;
}

/** Highways (sector borders): no controller, can't be claimed. */
function isHighway(name) {
  const p = parse(name);
  return !!p && (p.h % 10 === 0 || p.v % 10 === 0);
}

/** Source-keeper rooms (the 3x3 around each sector centre, minus the centre). */
function isKeeperRoom(name) {
  const p = parse(name);
  if (!p) return false;
  const fx = p.h % 10;
  const fy = p.v % 10;
  return fx >= 4 && fx <= 6 && fy >= 4 && fy <= 6 && !(fx === 5 && fy === 5);
}

/** All rooms within `radius` (square grid) of `center`, excluding the centre. */
function grid(center, radius) {
  const out = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx || dy) out.push(offset(center, dx, dy));
    }
  }
  return out.filter(Boolean);
}

/** 'normal' | 'closed' | 'novice' | 'respawn' (defaults to normal if unsupported). */
function status(name) {
  try {
    const s = Game.map.getRoomStatus(name);
    return s ? s.status : 'normal';
  } catch (e) {
    return 'normal';
  }
}

module.exports = {parse, format, offset, isHighway, isKeeperRoom, grid, status};
