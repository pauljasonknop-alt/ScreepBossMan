'use strict';

/**
 * Role registry. To add a role: create role.<name>.js exporting
 * `run(creep, colony)` and optionally `want(colony)`, then list it here.
 * The order here is also the order creeps are executed in each tick, so
 * critical roles come first (they still run if the CPU budget is tight).
 */
module.exports = {
  defender: require('./role.defender'),
  filler: require('./role.filler'),
  miner: require('./role.miner'),
  hauler: require('./role.hauler'),
  worker: require('./role.worker'),
  claimer: require('./role.claimer'),
  upgrader: require('./role.upgrader'),
  builder: require('./role.builder'),
};
