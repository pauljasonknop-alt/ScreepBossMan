const roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        const spawn = Game.spawns['Spawn1'];
        let task;
        let pathColor;
        if (creep.store.getFreeCapacity() > 0) {
            task = 'Harvesting';
            pathColor = '#ffff00'; // yellow
            const sources = creep.room.find(FIND_SOURCES);
            const sourceIndex = creep.memory.sourceIndex % sources.length;
            const source = sources[sourceIndex];
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
        } else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if (targets.length > 0) {
                task = 'Delivering';
                pathColor = '#000000'; // black
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            } else {
                // Park
                task = 'Parking';
                pathColor = '#888888'; // gray
                const parkingPos = { x: spawn.pos.x + (creep.memory.sourceIndex * 2) - 4, y: spawn.pos.y + 5 };
                if (!creep.pos.isEqualTo(parkingPos)) {
                    creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            }
        }
        if (creep.memory.lastTask != task) {
            creep.say(task);
            creep.memory.lastTask = task;
        }
    }
};

module.exports = roleHarvester;