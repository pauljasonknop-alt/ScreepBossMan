const roleRepairer = {

    /** @param {Creep} creep **/
    run: function(creep) {
        const spawn = Game.spawns['Spawn1'];
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.repairing = false;
        }
        if (!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
            creep.memory.repairing = true;
        }

        let task;
        let pathColor;
        if (creep.memory.repairing) {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => structure.hits < structure.hitsMax
            });
            if (targets.length) {
                task = 'Repairing';
                pathColor = '#ff0000'; // red
                if (creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            } else {
                // Park
                task = 'Parking';
                pathColor = '#888888'; // gray
                const parkingPos = { x: spawn.pos.x + 2, y: spawn.pos.y + 5 };
                if (!creep.pos.isEqualTo(parkingPos)) {
                    creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            }
        } else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                        (structure.structureType == STRUCTURE_SPAWN && structure.store[RESOURCE_ENERGY] > 200)) &&
                        structure.store[RESOURCE_ENERGY] > 0;
                }
            });
            if (targets.length > 0) {
                task = 'Withdrawing';
                pathColor = '#ffff00'; // yellow
                if (creep.withdraw(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            } else {
                // Park
                task = 'Parking';
                pathColor = '#888888'; // gray
                const parkingPos = { x: spawn.pos.x + 2, y: spawn.pos.y + 5 };
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

module.exports = roleRepairer;