const { smartMove, announce } = require('../helpers');

module.exports = (creep, roomMem) => {
    let mineral = creep.room.find(FIND_MINERALS)[0];
    if (!mineral) return;
    
    if (!creep.memory.task) creep.memory.task = 'COLLECT_MINERAL';
    let task = creep.memory.task;
    
    if (task === 'COLLECT_MINERAL' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'DELIVER_MINERAL';
        task = 'DELIVER_MINERAL';
    } else if (task === 'DELIVER_MINERAL' && creep.store[RESOURCE_ENERGY] === 0 && _.sum(creep.store) === 0) {
        creep.memory.task = 'COLLECT_MINERAL';
        task = 'COLLECT_MINERAL';
    }
    
    if (task === 'COLLECT_MINERAL') {
        if (mineral.mineralAmount > 0) {
            let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } })[0];
            if (extractor) {
                if (creep.harvest(mineral) === ERR_NOT_IN_RANGE) smartMove(creep, mineral, '#aa00ff');
                announce(creep, '⛏️ Mineral');
            }
        }
    } else {
        let labs = creep.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB && s.store.getFreeCapacity(creep.store.getResourceTypes()[0]) > 0
        });
        if (labs.length > 0) {
            let lab = labs[0];
            let resourceType = creep.store.getResourceTypes()[0];
            if (resourceType && creep.transfer(lab, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, lab, '#ffff00');
            announce(creep, '🧪 Lab');
        } else {
            let terminal = creep.room.terminal;
            let storage = creep.room.storage;
            if (terminal && terminal.store.getFreeCapacity() > 0) {
                let resourceType = creep.store.getResourceTypes()[0];
                if (resourceType && creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, terminal, '#ffff00');
                announce(creep, '📦 Terminal');
            } else if (storage && storage.store.getFreeCapacity() > 0) {
                let resourceType = creep.store.getResourceTypes()[0];
                if (resourceType && creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, storage, '#ffff00');
                announce(creep, '🏚️ Storage');
            }
        }
    }
};