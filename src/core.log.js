'use strict';

const config = require('./core.config');

const lastPrinted = {};

function info(scope, message) {
  console.log(`[${Game.time}] ${scope}: ${message}`);
}

function warn(scope, message) {
  console.log(`<span style="color:#fc6">[${Game.time}] ${scope}: ${message}</span>`);
}

/**
 * Prints an error at most once per `config.log.errorThrottle` ticks per key,
 * so a broken creep doesn't flood the console 20 times a second.
 */
function error(scope, err) {
  const text = err && err.stack ? err.stack : String(err);
  const key = scope + text.split('\n')[0];
  if (lastPrinted[key] !== undefined && Game.time - lastPrinted[key] < config.log.errorThrottle) {
    return;
  }
  lastPrinted[key] = Game.time;
  console.log(`<span style="color:#f66">[${Game.time}] ERROR ${scope}: ${text}</span>`);
}

/** Runs fn and logs (instead of throwing) on failure. */
function safe(scope, fn) {
  try {
    return fn();
  } catch (err) {
    error(scope, err);
    return undefined;
  }
}

module.exports = {info, warn, error, safe};
