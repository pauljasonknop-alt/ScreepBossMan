const { smartMove, announce, acquireEnergy } = require('../helpers');
const builder = require('./builder');

module.exports = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'GET_ENERGY';
    let task = creep.memory.task;

    if (task === 'REPAIR' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'GET_ENERGY';
        task = 'GET_ENERGY';
    } else if (task === 'GET_ENERGY' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'REPAIR';
        task = 'REPAIR';
    }

    if (task === 'REPAIR') {
        let priority = [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER];
        let target = null;
        
        for (let type of priority) {
            target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType === type && s.hits < s.hitsMax && (type !== STRUCTURE_WALL ? s.hits < s.hitsMax * 0.8 : s.hits < s.hitsMax * 0.5)
            });
            if (target) break;
        }
        
        if (!target) {
            let walls = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_WALL && s.hits < s.hitsMax * 0.5 });
            if (walls.length > 0) { walls.sort((a, b) => a.hits - b.hits); target = walls[0]; }
        }
        
        if (target) {
            if (creep.repair(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ff0000');
            let repairType = target.structureType === STRUCTURE_WALL ? '🧱 Wall' : (target.structureType === STRUCTURE_RAMPART ? '🛡️ Rampart' : '🔧 Repair');
            announce(creep, repairType);
        } else {
            builder(creep, roomMem);
        }
    } else {
        acquireEnergy(creep, roomMem);
    }
};