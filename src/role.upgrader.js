const roleUpgrader = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
            creep.memory.upgrading = true;
        }

        let task;
        let pathColor;
        if (creep.memory.upgrading) {
            task = 'Upgrading';
            pathColor = '#8a2be2'; // violet
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: pathColor } });
            }
        } else {
            task = 'Harvesting';
            pathColor = '#ffff00'; // yellow
            const sources = creep.room.find(FIND_SOURCES);
            if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], { visualizePathStyle: { stroke: pathColor } });
            }
        }
        if (creep.memory.lastTask != task) {
            creep.say(task);
            creep.memory.lastTask = task;
        }
    }
};

module.exports = roleUpgrader;