'use strict';

/**
 * Claimer: walks to memory.target and claims its controller.
 * Requested by mgr.expansion (no want() here).
 */

const config = require('./core.config');
const log = require('./core.log');
const {travelTo} = require('./core.move');

function run(creep) {
  const target = creep.memory.target;
  if (!target) {
    creep.suicide();
    return;
  }
  const room = Game.rooms[target];
  if (!room || creep.room.name !== target) {
    const pos = room && room.controller ? room.controller.pos : new RoomPosition(25, 25, target);
    travelTo(creep, pos, {range: room ? 1 : 20});
    return;
  }
  const controller = room.controller;
  if (!controller) {
    log.warn(target, 'claim target has no controller');
    creep.suicide();
    return;
  }
  if (!creep.pos.isNearTo(controller)) {
    travelTo(creep, controller);
    return;
  }
  let rc;
  if ((controller.owner && !controller.my) ||
    (controller.reservation && controller.reservation.username !== Memory.username)) {
    rc = creep.attackController(controller);
  } else {
    rc = creep.claimController(controller);
  }
  if (rc === OK && config.signText) {
    creep.signController(controller, config.signText);
  } else if (rc === ERR_GCL_NOT_ENOUGH) {
    log.warn(target, 'cannot claim: GCL too low');
  } else if (rc !== OK && rc !== ERR_TIRED) {
    log.warn(target, `claim failed: ${rc}`);
  }
}

module.exports = {run};
