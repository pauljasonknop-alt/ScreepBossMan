const roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {
        const spawn = Game.spawns['Spawn1'];
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
        }

        let task;
        let pathColor;
        if (creep.memory.building) {
            const targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (targets.length) {
                task = 'Building';
                pathColor = '#0000ff'; // bright blue
                if (creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            } else {
                // Park
                task = 'Parking';
                pathColor = '#888888'; // gray
                const parkingPos = { x: spawn.pos.x - 3, y: spawn.pos.y + 5 };
                if (!creep.pos.isEqualTo(parkingPos)) {
                    creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
                }
            }
        } else {
            task = 'Harvesting';
            pathColor = '#ffff00'; // yellow
            const sources = creep.room.find(FIND_SOURCES);
            if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
        }
        if (creep.memory.lastTask != task) {
            creep.say(task);
            creep.memory.lastTask = task;
        }
    }
};

module.exports = roleBuilder;