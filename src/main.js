/** * SCREEPS OVERNIGHT AUTO-BOT v2.3
 * Focus: Active Delivery Hunting & Worker Container-Prioritization
 */

const getBody = function(role, capacity) {
    if (role === 'miner') return [WORK, WORK, WORK, MOVE]; // 350
    if (role === 'hauler') {
        return capacity >= 400 ? [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE] : [CARRY, CARRY, MOVE, MOVE];
    }
    return capacity >= 400 ? [WORK, WORK, CARRY, CARRY, MOVE, MOVE] : [WORK, CARRY, MOVE];
};

const roleMiner = {
    run: function(creep) {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 20 });
        }
    }
};

const roleHauler = {
    run: function(creep) {
        if (creep.store.getFreeCapacity() > 0) {
            // 1. Pickup any dropped energy > 50 units
            let drop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                filter: r => r.resourceType == RESOURCE_ENERGY && r.amount > 50
            });
            if (drop) {
                if (creep.pickup(drop) == ERR_NOT_IN_RANGE) creep.moveTo(drop, {reusePath: 10});
                return;
            }
            // 2. Go to assigned node
            let source = Game.getObjectById(creep.memory.sourceId);
            creep.moveTo(source, {range: 3, reusePath: 20});
        } else {
            // --- DELIVERY LOGIC ---
            // A. Primary: Fill Spawn & Extensions
            let structureTarget = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                               s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (structureTarget) {
                if (creep.transfer(structureTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(structureTarget, {reusePath: 15});
                }
                return;
            }

            // B. Secondary: Hunt Builders/Upgraders that need energy
            let workerTarget = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
                filter: (c) => (c.memory.role == 'builder' || c.memory.role == 'upgrader') && 
                               c.store.getFreeCapacity(RESOURCE_ENERGY) > 20
            });

            if (workerTarget) {
                if (creep.transfer(workerTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(workerTarget, {visualizePathStyle: {stroke: '#00ff00'}});
                }
                return;
            }

            // C. Tertiary: Drop near Spawn
            let spawn = Game.spawns['Spawn1'];
            if (creep.pos.isNearTo(spawn)) {
                creep.drop(RESOURCE_ENERGY);
            } else {
                creep.moveTo(spawn, {reusePath: 15});
            }
        }
    }
};

const workerEnergyLogic = function(creep) {
    // 1. Priority: Fullest Container
    let containers = creep.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
    });
    
    if (containers.length > 0) {
        containers.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
        if (creep.withdraw(containers[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(containers[0], {visualizePathStyle: {stroke: '#ffaa00'}});
        }
        return;
    }

    // 2. Priority: Spawn Surplus (only if no containers have energy)
    let spawn = Game.spawns['Spawn1'];
    if (spawn.store[RESOURCE_ENERGY] > 250) {
        if (creep.withdraw(spawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    }
};

const roleBuilder = {
    run: function(creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) creep.memory.building = false;
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) creep.memory.building = true;
        
        if (creep.memory.building) {
            let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
            if (site) {
                if (creep.build(site) == ERR_NOT_IN_RANGE) creep.moveTo(site, {reusePath: 15});
            } else {
                if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller);
            }
        } else {
            workerEnergyLogic(creep);
        }
    }
};

const roleUpgrader = {
    run: function(creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) creep.memory.upgrading = false;
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) creep.memory.upgrading = true;

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {reusePath: 20});
            }
        } else {
            workerEnergyLogic(creep);
        }
    }
};

module.exports.loop = function () {
    for(let name in Memory.creeps) if(!Game.creeps[name]) delete Memory.creeps[name];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let sources = spawn.room.find(FIND_SOURCES);
    let cap = spawn.room.energyCapacityAvailable;

    // Infrastructure: Build Containers 1x1
    if (Game.time % 100 == 0 && spawn.room.find(FIND_CONSTRUCTION_SITES).length < 1) {
        for (let s of sources) {
            let hasContainer = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER}).length > 0;
            if (!hasContainer) {
                spawn.room.createConstructionSite(s.pos.x + 1, s.pos.y + 1, STRUCTURE_CONTAINER);
                break;
            }
        }
    }

    // Population & Spawning
    sources.forEach((source, index) => {
        let miners = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == source.id);
        let haulers = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == source.id);
        let targetM = (index === 0) ? 2 : 1; 
        
        if (miners.length < targetM) {
            spawn.spawnCreep(getBody('miner', cap), `M_${index}_${Game.time%100}`, {memory: {role: 'miner', sourceId: source.id}});
        } else if (haulers.length < miners.length) {
            spawn.spawnCreep(getBody('hauler', cap), `H_${index}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: source.id}});
        }
    });

    if (spawn.room.energyAvailable >= cap) {
        if (_.filter(Game.creeps, c => c.memory.role == 'builder').length < 3) {
            spawn.spawnCreep(getBody('worker', cap), 'B'+Game.time%100, {memory: {role: 'builder'}});
        }
        if (_.filter(Game.creeps, c => c.memory.role == 'upgrader').length < 2) {
            spawn.spawnCreep(getBody('worker', cap), 'U'+Game.time%100, {memory: {role: 'upgrader'}});
        }
    }

    // Execution
    for(let name in Game.creeps) {
        let creep = Game.creeps[name];
        if(creep.memory.role == 'miner') roleMiner.run(creep);
        if(creep.memory.role == 'hauler') roleHauler.run(creep);
        if(creep.memory.role == 'builder') roleBuilder.run(creep);
        if(creep.memory.role == 'upgrader') roleUpgrader.run(creep);
    }

    // Overnight Log
    if (Game.time % 20 == 0) {
        const floor = _.sum(spawn.room.find(FIND_DROPPED_RESOURCES), r => r.amount);
        console.log(`TICK: ${Game.time} | FLOOR: ${floor} | SPAWN: ${spawn.room.energyAvailable}/${cap} | SITES: ${spawn.room.find(FIND_CONSTRUCTION_SITES).length}`);
    }
};