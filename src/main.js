/** * SCREEPS OVERNIGHT AUTO-BOT v2.1 
 * Focus: Ground Energy Recovery, Dynamic Body Scaling, Auto-Infrastructure
 */

// --- UTILITY: Dynamic Body Scaling ---
const getBody = function(role, capacity) {
    if (role === 'miner') return [WORK, WORK, WORK, MOVE]; // 350 cost
    if (role === 'hauler') {
        if (capacity >= 400) return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]; // 400 cost
        return [CARRY, CARRY, MOVE, MOVE]; // 200 cost
    }
    if (role === 'worker') { // For Builders/Upgraders
        if (capacity >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; // 400 cost
        return [WORK, CARRY, MOVE]; // 200 cost
    }
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
            // VACUUM MODE: Prioritize the biggest piles first to stop decay
            let bigDrop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                filter: r => r.resourceType == RESOURCE_ENERGY && r.amount > 50
            });
            if (bigDrop) {
                if (creep.pickup(bigDrop) == ERR_NOT_IN_RANGE) creep.moveTo(bigDrop, {reusePath: 15});
                return;
            }
            // Fallback to assigned source
            let source = Game.getObjectById(creep.memory.sourceId);
            creep.moveTo(source, {range: 3, reusePath: 20});
        } else {
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                               s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(target, {reusePath: 15});
            } else {
                let spawn = Game.spawns['Spawn1'];
                if (creep.pos.isNearTo(spawn)) creep.drop(RESOURCE_ENERGY);
                else creep.moveTo(spawn, {reusePath: 15});
            }
        }
    }
};

const scavengerLogic = function(creep) {
    let bigDrop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, { filter: r => r.amount > 100 });
    if (bigDrop) {
        if (creep.pickup(bigDrop) == ERR_NOT_IN_RANGE) creep.moveTo(bigDrop, {reusePath: 10});
        return;
    }
    let spawn = Game.spawns['Spawn1'];
    if (spawn.store[RESOURCE_ENERGY] > 200) {
        if (creep.withdraw(spawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    } else {
        let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
        });
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(container);
        }
    }
};

const roleBuilder = {
    run: function(creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) creep.memory.building = false;
        if (!creep.memory.building && creep.store.getFreeCapacity() == 0) creep.memory.building = true;
        if (creep.memory.building) {
            let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
            if (site) { if (creep.build(site) == ERR_NOT_IN_RANGE) creep.moveTo(site, {reusePath: 15}); }
            else { if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller); }
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
    for(let name in Memory.creeps) if(!Game.creeps[name]) delete Memory.creeps[name];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let sources = spawn.room.find(FIND_SOURCES);
    let cap = spawn.room.energyCapacityAvailable;

    // 1. AUTO-INFRASTRUCTURE (One at a time)
    if (Game.time % 100 == 0 && spawn.room.find(FIND_CONSTRUCTION_SITES).length < 2) {
        for (let s of sources) {
            let containers = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER});
            if (containers.length == 0) {
                spawn.room.createConstructionSite(s.pos.x + 1, s.pos.y + 1, STRUCTURE_CONTAINER);
                break;
            }
        }
    }

    // 2. POPULATION & DYNAMIC SPAWNING
    sources.forEach((source, index) => {
        let miners = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == source.id);
        let haulers = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == source.id);
        let targetMiners = (index === 0) ? 2 : 1; 
        
        if (miners.length < targetMiners) {
            spawn.spawnCreep(getBody('miner', cap), `M_${index}_${Game.time%100}`, {memory: {role: 'miner', sourceId: source.id}});
        } else if (haulers.length < miners.length) {
            spawn.spawnCreep(getBody('hauler', cap), `H_${index}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: source.id}});
        }
    });

    if (spawn.room.energyAvailable >= cap) {
        let builders = _.filter(Game.creeps, c => c.memory.role == 'builder');
        if (builders.length < 3) spawn.spawnCreep(getBody('worker', cap), 'B'+Game.time%100, {memory: {role: 'builder'}});

        let upgraders = _.filter(Game.creeps, c => c.memory.role == 'upgrader');
        if (upgraders.length < 2) spawn.spawnCreep(getBody('worker', cap), 'U'+Game.time%100, {memory: {role: 'upgrader'}});
    }

    // 3. EXECUTE
    for(let name in Game.creeps) {
        let creep = Game.creeps[name];
        if(creep.memory.role == 'miner') roleMiner.run(creep);
        if(creep.memory.role == 'hauler') roleHauler.run(creep);
        if(creep.memory.role == 'builder') roleBuilder.run(creep);
        if(creep.memory.role == 'upgrader') roleUpgrader.run(creep);
    }

    // 4. MONITORING
    if (Game.time % 20 == 0) {
        const floorEnergy = _.sum(spawn.room.find(FIND_DROPPED_RESOURCES), r => r.amount);
        console.log(`TICK: ${Game.time} | PRODUCTION: ${spawn.room.energyAvailable}/${cap} | FLOOR: ${floorEnergy} | SITES: ${spawn.room.find(FIND_CONSTRUCTION_SITES).length}`);
    }
};