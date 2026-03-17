// Complete Screeps Script - Last Updated: 17-03-2026
// Economy: Drop-Mining / Hauling setup with Stage-based scaling

// ==========================================
// ROLE DEFINITIONS
// ==========================================

const roleMiner = {
    run: function (creep) {
        if (!creep.memory.sourceId) {
            const sources = creep.room.find(FIND_SOURCES);
            if (sources.length > 0) creep.memory.sourceId = sources[0].id;
        }
        const source = Game.getObjectById(creep.memory.sourceId);
        if (source) {
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 });
            }
        }
    }
};

const roleHauler = {
    run: function (creep) {
        const spawn = Game.spawns['Spawn1'];
        if (creep.store.getFreeCapacity() > 0) {
            // Find assigned miner
            const miner = creep.memory.minerId ? Game.creeps[creep.memory.minerId] : null;
            if (miner) {
                const droppedNearMiner = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
                    filter: (r) => r.resourceType == RESOURCE_ENERGY
                });
                if (droppedNearMiner.length > 0) {
                    const closest = creep.pos.findClosestByPath(droppedNearMiner);
                    if (creep.pickup(closest) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 });
                    }
                    return;
                }
                if (!creep.pos.inRangeTo(miner, 2)) {
                    creep.moveTo(miner, { visualizePathStyle: { stroke: '#0088ff' }, reusePath: 10 });
                }
            } else {
                // Fallback to dropped energy in room
                const dropped = creep.room.find(FIND_DROPPED_RESOURCES);
                if (dropped.length > 0) {
                    const closest = creep.pos.findClosestByPath(dropped);
                    if (creep.pickup(closest) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 });
                    }
                }
            }
        } else {
            // Delivery Logic
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 });
                }
            } else {
                // Park near spawn
                creep.moveTo(spawn.pos.x + 2, spawn.pos.y + 2);
            }
        }
    }
};

const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) creep.memory.upgrading = false;
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) creep.memory.upgrading = true;

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#8a2be2' } });
            }
        } else {
            const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
            });
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(container);
            } else {
                const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
                if (creep.pickup(dropped) == ERR_NOT_IN_RANGE) creep.moveTo(dropped);
            }
        }
    }
};

const roleBuilder = {
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) creep.memory.building = false;
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) creep.memory.building = true;

        if (creep.memory.building) {
            const target = Game.getObjectById(Memory.primaryBuildSite);
            if (target) {
                if (creep.build(target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#0000ff' } });
                }
            }
        } else {
            const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
            if (creep.pickup(dropped) == ERR_NOT_IN_RANGE) creep.moveTo(dropped);
        }
    }
};

const roleRepairer = {
    run: function (creep) {
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) creep.memory.repairing = false;
        if (!creep.memory.repairing && creep.store.getFreeCapacity() == 0) creep.memory.repairing = true;

        if (creep.memory.repairing) {
            const targets = creep.room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax });
            if (targets.length > 0) {
                if (creep.repair(targets[0]) == ERR_NOT_IN_RANGE) creep.moveTo(targets[0]);
            }
        } else {
            const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
            if (creep.pickup(dropped) == ERR_NOT_IN_RANGE) creep.moveTo(dropped);
        }
    }
};

const roleHarvester = {
    run: function (creep) {
        if (creep.store.getFreeCapacity() > 0) {
            const sources = creep.room.find(FIND_SOURCES);
            if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) creep.moveTo(sources[0]);
        } else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (targets.length > 0) {
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(targets[0]);
            }
        }
    }
};

// ==========================================
// MAIN LOOP
// ==========================================

module.exports.loop = function () {
    // 1. Memory Cleanup
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return; // Exit if spawn is destroyed

    const sources = spawn.room.find(FIND_SOURCES);
    const stage = spawn.room.controller.level;

    // 2. Construction Site Management (Stage 2+)
    if (stage >= 2 && Game.time % 20 == 0) {
        sources.forEach(source => {
            const containers = source.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER });
            if (containers.length == 0) {
                const terrain = spawn.room.getTerrain();
                const pos = { x: source.pos.x + 1, y: source.pos.y }; // Simplified placement
                if (terrain.get(pos.x, pos.y) != TERRAIN_MASK_WALL) {
                    spawn.room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
                }
            }
        });
    }

    // 3. Population Logic
    const miners = _.filter(Game.creeps, (c) => c.memory.role == 'miner');
    const haulers = _.filter(Game.creeps, (c) => c.memory.role == 'hauler');
    const upgraders = _.filter(Game.creeps, (c) => c.memory.role == 'upgrader');
    const builders = _.filter(Game.creeps, (c) => c.memory.role == 'builder');
    const harvesters = _.filter(Game.creeps, (c) => c.memory.role == 'harvester');

    // Population Targets
    const desiredMiners = sources.length;
    const desiredHaulers = miners.length; // 1-to-1 pairing
    const desiredBuilders = 2;
    const desiredUpgraders = 2;

    // 4. Spawning Chain
    if (miners.length == 0 && harvesters.length < 2) {
        spawn.spawnCreep([WORK, CARRY, MOVE], 'Emergency' + Game.time, { memory: { role: 'harvester' } });
    } else if (miners.length < desiredMiners) {
        spawn.spawnCreep([WORK, WORK, MOVE], 'Miner' + Game.time, { memory: { role: 'miner' } });
    } else if (haulers.length < desiredHaulers) {
        // Find miner without a hauler
        const unassignedMiner = miners.find(m => !_.any(haulers, h => h.memory.minerId == m.name));
        if (unassignedMiner) {
            spawn.spawnCreep([CARRY, CARRY, MOVE, MOVE], 'Hauler' + Game.time, { 
                memory: { role: 'hauler', minerId: unassignedMiner.name } 
            });
        }
    } else if (builders.length < desiredBuilders) {
        spawn.spawnCreep([WORK, CARRY, MOVE], 'Builder' + Game.time, { memory: { role: 'builder' } });
    } else if (upgraders.length < desiredUpgraders) {
        spawn.spawnCreep([WORK, CARRY, MOVE], 'Upgrader' + Game.time, { memory: { role: 'upgrader' } });
    }

    // 5. Build Site Selection
    const sites = spawn.room.find(FIND_CONSTRUCTION_SITES);
    if (sites.length > 0) Memory.primaryBuildSite = sites[0].id;

    // 6. Run Creep Logic
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role == 'miner') roleMiner.run(creep);
        if (creep.memory.role == 'hauler') roleHauler.run(creep);
        if (creep.memory.role == 'upgrader') roleUpgrader.run(creep);
        if (creep.memory.role == 'builder') roleBuilder.run(creep);
        if (creep.memory.role == 'harvester') roleHarvester.run(creep);
        if (creep.memory.role == 'repairer') roleRepairer.run(creep);
    }
};