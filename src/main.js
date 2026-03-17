/** * SCREEPS OVERNIGHT AUTO-BOT v2.0
 * Focus: Ground Energy Recovery, Low CPU, Auto-Infrastructure
 */

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
            // PRIORITY 1: Large decaying piles anywhere in the room
            let bigDrop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                filter: r => r.amount > 100
            });
            
            if (bigDrop) {
                if (creep.pickup(bigDrop) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(bigDrop, { visualizePathStyle: {stroke: '#00ff00'}, reusePath: 15 });
                }
                return;
            }

            // PRIORITY 2: Normal Node Collection
            let source = Game.getObjectById(creep.memory.sourceId);
            let dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 5);
            if (dropped.length > 0) {
                if (creep.pickup(dropped[0]) == ERR_NOT_IN_RANGE) creep.moveTo(dropped[0], {reusePath: 10});
            } else {
                creep.moveTo(source, {range: 3, reusePath: 20});
            }
        } else {
            // Delivery Logic
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                               s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 15});
                }
            } else {
                // Spawn Full: Hand off or drop at spawn
                let spawn = Game.spawns['Spawn1'];
                if (creep.pos.isNearTo(spawn)) creep.drop(RESOURCE_ENERGY);
                else creep.moveTo(spawn, {reusePath: 15});
            }
        }
    }
};

const scavengerLogic = function(creep) {
    // 1. Pickup ANY big piles first (Save the decay!)
    let bigDrop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, { filter: r => r.amount > 150 });
    if (bigDrop) {
        if (creep.pickup(bigDrop) == ERR_NOT_IN_RANGE) creep.moveTo(bigDrop, {reusePath: 15});
        return;
    }

    // 2. Normal Scavenge (Spawn Surplus > Container > Mine)
    let spawn = Game.spawns['Spawn1'];
    if (spawn.store[RESOURCE_ENERGY] > 250) {
        if (creep.withdraw(spawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(spawn, {reusePath: 10});
    } else {
        let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
        });
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(container);
        } else {
            let source = creep.pos.findClosestByRange(FIND_SOURCES);
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) creep.moveTo(source, {range: 1, reusePath: 15});
        }
    }
};

// ... (roleBuilder and roleUpgrader use scavengerLogic as before) ...
const roleBuilder = {
    run: function(creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) creep.memory.building = false;
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) creep.memory.building = true;
        if (creep.memory.building) {
            let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
            if (site) { if (creep.build(site) == ERR_NOT_IN_RANGE) creep.moveTo(site, {reusePath: 15}); }
            else { /* No sites? Upgrade instead */ 
                if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller);
            }
        } else { scavengerLogic(creep); }
    }
};

const roleUpgrader = {
    run: function(creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) creep.memory.upgrading = false;
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) creep.memory.upgrading = true;
        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller, {reusePath: 20});
        } else { scavengerLogic(creep); }
    }
};

module.exports.loop = function () {
    // 1. Cleanup
    for(let name in Memory.creeps) if(!Game.creeps[name]) delete Memory.creeps[name];

    let spawn = Game.spawns['Spawn1'];
    let sources = spawn.room.find(FIND_SOURCES);

    // 2. AUTO-INFRASTRUCTURE (Run every 50 ticks to save CPU)
    if (Game.time % 50 == 0) {
        let sites = spawn.room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length == 0) { // Only build one thing at a time
            // Build Containers at sources
            for (let s of sources) {
                let containers = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER});
                if (containers.length == 0) {
                    spawn.room.createConstructionSite(s.pos.x + 1, s.pos.y + 1, STRUCTURE_CONTAINER);
                    break;
                }
            }
        }
    }

    // 3. POPULATION & SPAWNING
    // Automatically pairs Miners/Haulers to nodes
    sources.forEach((source, index) => {
        let miners = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == source.id);
        let haulers = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == source.id);
        
        let targetMiners = (index === 0) ? 2 : 1; // Node 1 gets 2, Node 2 gets 1
        
        if (miners.length < targetMiners) {
            spawn.spawnCreep([WORK, WORK, MOVE], `M_${index}_${Game.time % 100}`, {memory: {role: 'miner', sourceId: source.id}});
        } else if (haulers.length < miners.length) {
            spawn.spawnCreep([CARRY, CARRY, MOVE, MOVE], `H_${index}_${Game.time % 100}`, {memory: {role: 'hauler', sourceId: source.id}});
        }
    });

    // Upgraders/Builders (Scale based on Stage 2)
    let builders = _.filter(Game.creeps, c => c.memory.role == 'builder');
    if (builders.length < 3) spawn.spawnCreep([WORK, CARRY, MOVE], 'B'+Game.time%100, {memory: {role: 'builder'}});

    let upgraders = _.filter(Game.creeps, c => c.memory.role == 'upgrader');
    if (upgraders.length < 2) spawn.spawnCreep([WORK, CARRY, MOVE], 'U'+Game.time%100, {memory: {role: 'upgrader'}});

    // 4. EXECUTE
    for(let name in Game.creeps) {
        let creep = Game.creeps[name];
        if(creep.memory.role == 'miner') roleMiner.run(creep);
        if(creep.memory.role == 'hauler') roleHauler.run(creep);
        if(creep.memory.role == 'builder') roleBuilder.run(creep);
        if(creep.memory.role == 'upgrader') roleUpgrader.run(creep);
    }
};