/**
 * Screeps Colony Script - Updated 17-03-2026
 * Features: Node-specific hauling, priority scavenging, and spawn-overflow handling.
 */

// --- ROLE: MINER ---
const roleMiner = {
    run: function (creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (source) {
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
            }
        }
    }
};

// --- ROLE: HAULER ---
const roleHauler = {
    run: function (creep) {
        if (creep.store.getFreeCapacity() > 0) {
            // Collect only from assigned node area
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
                // Wait near source if node is empty
                creep.moveTo(source, { range: 3, reusePath: 10 });
            }
        } else {
            const spawn = Game.spawns['Spawn1'];
            
            // 1. Priority: Fill Spawn & Extensions
            const fillTargets = creep.room.find(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (fillTargets.length > 0) {
                if (creep.transfer(fillTargets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(fillTargets[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } 
            // 2. If Spawn Full: Hand off to nearby builders or upgraders
            else {
                const needyCreep = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
                    filter: (c) => (c.memory.role == 'builder' || c.memory.role == 'upgrader') && 
                                   c.store.getFreeCapacity() > 0
                });

                if (needyCreep.length > 0) {
                    if (creep.transfer(needyCreep[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(needyCreep[0]);
                    }
                } else {
                    // 3. Last Resort: Drop it at Spawn's feet (creating a pile for builders)
                    if (creep.pos.isNearTo(spawn)) {
                        creep.drop(RESOURCE_ENERGY);
                    } else {
                        creep.moveTo(spawn);
                    }
                }
            }
        }
    }
};

// --- SHARED SCAVENGER LOGIC ---
const scavengerLogic = function (creep) {
    const spawn = Game.spawns['Spawn1'];

    // 1. Ground Energy near Spawn (Prioritize the pile created by haulers)
    let droppedNearSpawn = spawn.pos.findInRange(FIND_DROPPED_RESOURCES, 4, {
        filter: r => r.resourceType == RESOURCE_ENERGY && r.amount > 20
    });
    
    if (droppedNearSpawn.length > 0) {
        let target = creep.pos.findClosestByPath(droppedNearSpawn);
        if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return; 
    }

    // 2. Containers / Storage
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => (s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_STORAGE) && 
                     s.store[RESOURCE_ENERGY] > 0
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(container);
        }
        return;
    }

    // 3. Spawn Surplus (only pull if spawn has > 250 energy)
    if (spawn.store[RESOURCE_ENERGY] > 250) {
        if (creep.withdraw(spawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(spawn);
        }
        return;
    }

    // 4. Fallback: Manual Mining (Last resort if room is empty)
    const sources = creep.room.find(FIND_SOURCES);
    if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
        creep.moveTo(sources[0], { visualizePathStyle: { stroke: '#ff0000' }, range: 1 });
    }
};

// --- ROLE: UPGRADER ---
const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) creep.memory.upgrading = false;
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) creep.memory.upgrading = true;

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#8a2be2' } });
            }
        } else {
            scavengerLogic(creep);
        }
    }
};

// --- ROLE: BUILDER ---
const roleBuilder = {
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) creep.memory.building = false;
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) creep.memory.building = true;

        if (creep.memory.building) {
            const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
            if (site) {
                if (creep.build(site) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(site, { visualizePathStyle: { stroke: '#0000ff' } });
                }
            }
        } else {
            scavengerLogic(creep);
        }
    }
};

// --- MAIN LOOP ---
module.exports.loop = function () {
    // 1. Memory Management
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) delete Memory.creeps[name];
    }

    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    const sources = spawn.room.find(FIND_SOURCES);

    // 2. Population Counts
    const miners = _.filter(Game.creeps, c => c.memory.role == 'miner');
    const haulers = _.filter(Game.creeps, c => c.memory.role == 'hauler');
    const builders = _.filter(Game.creeps, c => c.memory.role == 'builder');
    const upgraders = _.filter(Game.creeps, c => c.memory.role == 'upgrader');

    // 3. Spawning Logic per Node
    sources.forEach((source, index) => {
        const minersAtSource = _.filter(miners, c => c.memory.sourceId == source.id);
        const haulersAtSource = _.filter(haulers, c => c.memory.sourceId == source.id);

        // Adjust targets: Node 0 (2 miners), Node 1 (1 miner)
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

    // Spawn non-economy roles if miners are present
    if (miners.length >= 2) {
        if (builders.length < 2) {
            spawn.spawnCreep([WORK, CARRY, MOVE], 'Builder' + Game.time, { memory: { role: 'builder' } });
        }
        if (upgraders.length < 2) {
            spawn.spawnCreep([WORK, CARRY, MOVE], 'Upgrader' + Game.time, { memory: { role: 'upgrader' } });
        }
    }

    // 4. Execute Creep Logic
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role == 'miner') roleMiner.run(creep);
        if (creep.memory.role == 'hauler') roleHauler.run(creep);
        if (creep.memory.role == 'upgrader') roleUpgrader.run(creep);
        if (creep.memory.role == 'builder') roleBuilder.run(creep);
    }
};