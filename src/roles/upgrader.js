const { smartMove, announce, acquireEnergy } = require('../helpers');

module.exports = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'GET_ENERGY';
    let task = creep.memory.task;

    if (task === 'UPGRADE' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'GET_ENERGY';
        task = 'GET_ENERGY';
    } else if (task === 'GET_ENERGY' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'UPGRADE';
        task = 'UPGRADE';
    }

    if (task === 'UPGRADE') {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE)
            smartMove(creep, creep.room.controller, '#8a2be2');
        announce(creep, '⚡');
    } else {
        acquireEnergy(creep, roomMem);
    }
};