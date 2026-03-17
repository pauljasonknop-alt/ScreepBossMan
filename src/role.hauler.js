const roleHauler = {

    /** @param {Creep} creep **/
    run: function(creep) {
        const spawn = Game.spawns['Spawn1'];
        if (creep.store.getFreeCapacity() > 0) {
            // Find dropped energy
            const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
                filter: (resource) => resource.resourceType == RESOURCE_ENERGY
            });
            if (droppedEnergy.length > 0) {
                const closest = creep.pos.findClosestByPath(droppedEnergy);
                if (closest) {
                    if (creep.pickup(closest) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
                    }
                }
            }
        } else {
            // Deliver to spawn/extensions
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#000000' }, reusePath: 10 }); // black
                }
            } else {
                // If spawn/extensions are full, deliver to needy creeps
                const needyCreeps = creep.room.find(FIND_MY_CREEPS, {
                    filter: (c) => c.store.getFreeCapacity() > 0 && c.memory.role != 'miner' && c.memory.role != 'hauler'
                });
                if (needyCreeps.length > 0) {
                    const closest = creep.pos.findClosestByPath(needyCreeps);
                    if (closest) {
                        if (creep.transfer(closest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
                        }
                    }
                } else {
                    // Park
                    const parkingPos = { x: spawn.pos.x + 5, y: spawn.pos.y + 5 };
                    if (!creep.pos.isEqualTo(parkingPos)) {
                        creep.moveTo(parkingPos, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 }); // gray
                    }
                }
            }
        }
    }
};

module.exports = roleHauler;