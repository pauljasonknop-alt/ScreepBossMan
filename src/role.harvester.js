const roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (creep.store.getFreeCapacity() > 0) {
            const sources = creep.room.find(FIND_SOURCES);
            const sourceIndex = creep.memory.sourceIndex % sources.length;
            if (creep.harvest(sources[sourceIndex]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[sourceIndex], { visualizePathStyle: { stroke: '#15ff00' } });
            }
        } else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#000000' } });
                }
            }
        }
    }
};

module.exports = roleHarvester;