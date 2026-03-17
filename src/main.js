// Updated Screeps Script - 17-03-2026
// Fix: Multi-node distribution and Scavenger Logic

const roleMiner = {
    run: function (creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (source) {
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        }
    }
};

const roleHauler = {
    run: function (creep) {
        if (creep.store.getFreeCapacity() > 0) {
            // Only look for energy near assigned source
            const source = Game.getObjectById(creep.memory.sourceId);
            const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 5, {
                filter: r => r.resourceType == RESOURCE_ENERGY
            });
            
            if (dropped.length > 0) {
                const target = creep.pos.findClosestByPath(dropped);
                if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            } else {
                // Wait near source if nothing to pick up
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffffff' }, range: 3 });
            }
        } else {
            const spawn = Game.spawns['Spawn1'];
            const deliveryTargets = creep.room.find(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (deliveryTargets.length > 0) {
                if (creep.transfer(deliveryTargets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(deliveryTargets[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                // SPAWN FULL: Drop near spawn to stay productive
                if (creep.pos.isNearTo(spawn)) {
                    creep.drop(RESOURCE_ENERGY);
                } else {
                    creep.moveTo(spawn);
                }
            }
        }
    }
};

const scavengerLogic = function (creep) {
    // 1. Ground Energy
    let dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
    if (dropped) {
        if (creep.pickup(dropped) == ERR_NOT_IN_RANGE) creep.moveTo(dropped);
        return;
    }

    // 2. Storage/Containers
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => (s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_STORAGE) && s.store[RESOURCE_ENERGY] > 0
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(container);
        return;
    }

    // 3. Spawn (only if > 300)
    const spawn = Game.spawns['Spawn1'];
    if (spawn.store[RESOURCE_ENERGY] > 300) {
        if (creep.withdraw(spawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(spawn);
        return;
    }

    // 4. Manual Mine (Fallback)
    const sources = creep.room.find(FIND_SOURCES);
    if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) creep.moveTo(sources[0]);
};

const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) creep.memory.upgrading = false;
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) creep.memory.upgrading = true;

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller);
            }
        } else {
            scavengerLogic(creep);
        }
    }
};

const roleBuilder = {
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) creep.memory.building = false;
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) creep.memory.building = true;

        if (creep.memory.building) {
            const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
            if (site) {
                if (creep.build(site) == ERR_NOT_IN_RANGE) creep.moveTo(site);
            }
        } else {
            scavengerLogic(creep);
        }
    }
};

module.exports.loop = function () {
    // Memory Clean
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) delete Memory.creeps[name];
    }

    const spawn = Game.spawns['Spawn1'];
    const sources = spawn.room.find(FIND_SOURCES);

    // Population counts
    const miners = _.filter(Game.creeps, c => c.memory.role == 'miner');
    const haulers = _.filter(Game.creeps, c => c.memory.role == 'hauler');

    // Source Management Logic
    sources.forEach((source, index) => {
        const minersAtSource = _.filter(miners, c => c.memory.sourceId == source.id);
        const haulersAtSource = _.filter(haulers, c => c.memory.sourceId == source.id);

        // Target: 2 miners for the first node (index 0), 1 for the second (index 1)
        // Adjust targets here based on your node preference
        const targetMiners = (index === 0) ? 2 : 1; 

        if (minersAtSource.length < targetMiners) {
            spawn.spawnCreep([WORK, WORK, MOVE], `Miner_S${index}_${Game.time}`, 
                { memory: { role: 'miner', sourceId: source.id } });
        } 
        else if (haulersAtSource.length < minersAtSource.length) {
            spawn.spawnCreep([CARRY, CARRY, MOVE, MOVE], `Hauler_S${index}_${Game.time}`, 
                { memory: { role: 'hauler', sourceId: source.id } });
        }
    });

    // Spawn other roles if core economy is running
    if (miners.length >= 2) {
        const builders = _.filter(Game.creeps, c => c.memory.role == 'builder');
        if (builders.length < 2) spawn.spawnCreep([WORK, CARRY, MOVE], 'Builder' + Game.time, { memory: { role: 'builder' } });
        
        const upgraders = _.filter(Game.creeps, c => c.memory.role == 'upgrader');
        if (upgraders.length < 2) spawn.spawnCreep([WORK, CARRY, MOVE], 'Upgrader' + Game.time, { memory: { role: 'upgrader' } });
    }

    // Execute Creeps
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role == 'miner') roleMiner.run(creep);
        if (creep.memory.role == 'hauler') roleHauler.run(creep);
        if (creep.memory.role == 'upgrader') roleUpgrader.run(creep);
        if (creep.memory.role == 'builder') roleBuilder.run(creep);
    }
};