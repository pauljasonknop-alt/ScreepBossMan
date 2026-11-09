'use strict';

// Damage hits the front of the body first, so armour goes first, heal last.
const ORDER = {
  [TOUGH]: 0, [WORK]: 1, [CARRY]: 2, [ATTACK]: 3, [RANGED_ATTACK]: 4,
  [CLAIM]: 5, [MOVE]: 6, [HEAL]: 7,
};

function cost(body) {
  let total = 0;
  for (const part of body) {
    total += BODYPART_COST[part];
  }
  return total;
}

/**
 * Repeats `pattern` as often as `energy` allows.
 *
 * @param {string[]} pattern - parts repeated N times
 * @param {number} energy - energy budget
 * @param {object} [opts]
 * @param {string[]} [opts.prefix] - parts added once
 * @param {number} [opts.maxRepeat] - upper bound on repetitions
 * @param {number} [opts.minRepeat=1] - return null below this
 * @return {string[]|null}
 */
function build(pattern, energy, opts = {}) {
  const prefix = opts.prefix || [];
  const maxRepeat = opts.maxRepeat === undefined ? Infinity : opts.maxRepeat;
  const minRepeat = opts.minRepeat === undefined ? 1 : opts.minRepeat;
  const unit = cost(pattern);
  const repeats = Math.min(
    maxRepeat,
    Math.floor((energy - cost(prefix)) / unit),
    Math.floor((MAX_CREEP_SIZE - prefix.length) / pattern.length),
  );
  if (repeats < minRepeat) {
    return null;
  }
  const body = prefix.slice();
  for (let i = 0; i < repeats; i++) {
    body.push(...pattern);
  }
  return sort(body);
}

function sort(body) {
  return body.sort((a, b) => ORDER[a] - ORDER[b]);
}

function count(body, part) {
  let n = 0;
  for (const p of body) {
    if (p === part || p.type === part) {
      n++;
    }
  }
  return n;
}

module.exports = {cost, build, sort, count};
