const { smartMove, announce, acquireEnergy } = require('../helpers');
const upgrader = require('./upgrader');

module.exports = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'GET_ENERGY';
    let task = creep.memory.task;

    if (task === 'BUILD' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'GET_ENERGY';
        task = 'GET_ENERGY';
    } else if (task === 'GET_ENERGY' && creep.store.getFreeCapacity() === 0) {
        let sites = creep.room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            creep.memory.task = 'BUILD';
            task = 'BUILD';
        } else {
            creep.memory.task = 'UPGRADE';
            task = 'UPGRADE';
        }
    }

    if (task === 'BUILD') {
        let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (site) {
            if (creep.build(site) === ERR_NOT_IN_RANGE) smartMove(creep, site, '#0000ff');
            announce(creep, '🔨');
        } else {
            upgrader(creep, roomMem);
        }
    } else if (task === 'UPGRADE') {
        upgrader(creep, roomMem);
    } else {
        acquireEnergy(creep, roomMem);
    }
};