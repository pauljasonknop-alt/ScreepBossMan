/** * SCREEPS AUTO-BOT v3.1 (RCL 3)
 * Full System: Body Scaling, Auto-Purge, & Advanced Logistics
 */

// --- 1. BODY SCALING & LEVEL CALCULATION ---
const getBody = function(role, room) {
    let cap = room.energyCapacityAvailable;
    if (role === 'miner') {
        // Max efficiency miner is 5x WORK + 1x MOVE (550 energy)
        if (cap >= 550) return [WORK, WORK, WORK, WORK, WORK, MOVE]; 
        return [WORK, WORK, MOVE]; // Basic starter
    }
    
    // Haulers and Workers scale dynamically to fill the Spawn's current capacity
    let body = [];
    let cost = 0;
    let part = (role === 'hauler') ? [CARRY, MOVE] : [WORK, CARRY, MOVE];
    let partCost = _.sum(part, p => BODYPART_COST[p]);
    
    while (cost + partCost <= cap && body.length < 48) {
        body.push(...part);
        cost += partCost;
    }
    return body;
};

// Helper for the Dump Zone (2 blocks below spawn)
const getDumpPos = function(spawn) {
    return new RoomPosition(spawn.pos.x, spawn.pos.y + 2, spawn.room.name);
};

// --- 2. ROLE LOGIC ---

const roleMiner = {
    run: function(creep) {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
            creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}, reusePath: 10});
        }
    }
};

const roleHauler = {
    run: function(creep) {
        // --- 1. STATE MANAGEMENT ---
        // If we are hauling and run out of energy, stop hauling
        if (creep.memory.hauling && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.hauling = false;
            creep.say('🔄 Pickup');
        }
        // If we are NOT hauling and we are full, start hauling
        if (!creep.memory.hauling && creep.store.getFreeCapacity() == 0) {
            creep.memory.hauling = true;
            creep.say('🚚 Deliver');
        }

        // --- 2. EXECUTION ---
        if (!creep.memory.hauling) {
            // PICKUP PHASE: Only go back to nodes if not in "Delivery Mode"
            
            // Priority A: Floor scraps
            let drop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: r => r.amount > 50});
            if (drop) {
                if (creep.pickup(drop) == ERR_NOT_IN_RANGE) creep.moveTo(drop, {visualizePathStyle: {stroke: '#ffaa00'}});
                return;
            }
            // Priority B: Node Storage
            let source = Game.getObjectById(creep.memory.sourceId);
            let container = source.pos.findInRange(FIND_STRUCTURES, 2, {filter: s => s.structureType == STRUCTURE_CONTAINER})[0];
            if (container && container.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        } else {
            // DELIVERY PHASE: Empty the entire pockets before leaving the base
            
            // A. Primary: Fill Spawn & Extensions
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                               s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#00ff00'}});
                }
            } else {
                // B. Secondary: Go to Dump Zone (x, y+2)
                let dump = getDumpPos(Game.spawns['Spawn1']);
                if (creep.pos.isEqualTo(dump)) {
                    creep.drop(RESOURCE_ENERGY);
                } else {
                    creep.moveTo(dump, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

const workerEnergyLogic = function(creep) {
    // Priority 1: Pick up from the Dump Zone (Pile on the floor)
    let dump = getDumpPos(Game.spawns['Spawn1']);
    let pile = dump.lookFor(LOOK_RESOURCES)[0];
    if (pile && pile.amount > 50) {
        if (creep.pickup(pile) == ERR_NOT_IN_RANGE) creep.moveTo(dump);
        return true;
    }
    // Priority 2: Fullest Container
    let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(container);
        return true;
    }
    return false;
};

const roleWorker = {
    run: function(creep, type) {
        // Toggle state
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) creep.memory.working = false;
        if (!creep.memory.working && creep.store.getFreeCapacity() == 0) creep.memory.working = true;

        if (creep.memory.working) {
            if (type === 'builder') {
                let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
                if (site) {
                    if (creep.build(site) == ERR_NOT_IN_RANGE) creep.moveTo(site);
                    return;
                }
            }
            // If no sites or role is upgrader
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller);
            }
        } else {
            workerEnergyLogic(creep);
        }
    }
};

// --- 3. MAIN LOOP ---

module.exports.loop = function () {
    // A. Memory Cleanup
    for(let name in Memory.creeps) if(!Game.creeps[name]) delete Memory.creeps[name];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let room = spawn.room;
    let cap = room.energyCapacityAvailable;

    // B. Auto-Purge Logic (Replacement of low-level creeps)
    if (room.energyAvailable === cap) {
        Memory.fullTicks = (Memory.fullTicks || 0) + 1;
        if (Memory.fullTicks > 100) {
            // Find a creep whose body is smaller than what we can currently build
            let lowLvl = _.find(Game.creeps, c => c.body.length < (getBody(c.memory.role, room).length));
            if (lowLvl) {
                console.log(`!!!! PURGING LOW LEVEL CREEP: ${lowLvl.name} !!!!`);
                lowLvl.suicide();
                Memory.fullTicks = 0;
            }
        }
    } else { Memory.fullTicks = 0; }

    // C. Population Management (2 Miners + 2 Haulers per node)
    let sources = room.find(FIND_SOURCES);
    sources.forEach((source, index) => {
        let miners = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == source.id);
        let haulers = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == source.id);
        
        if (miners.length < 2) {
            let body = getBody('miner', room);
            spawn.spawnCreep(body, `M_${index}_L${body.length}_${Game.time%100}`, {memory: {role: 'miner', sourceId: source.id}});
        } else if (haulers.length < 2) {
            let body = getBody('hauler', room);
            spawn.spawnCreep(body, `H_${index}_L${body.length}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: source.id}});
        }
    });

    // Worker population (Builders/Upgraders)
    if (!spawn.spawning && room.energyAvailable >= cap) {
        let builders = _.filter(Game.creeps, c => c.memory.role == 'builder');
        let upgraders = _.filter(Game.creeps, c => c.memory.role == 'upgrader');
        
        if (builders.length < 3) {
            let body = getBody('worker', room);
            spawn.spawnCreep(body, `B_L${body.length}_${Game.time%100}`, {memory: {role: 'builder'}});
        } else if (upgraders.length < 2) {
            let body = getBody('worker', room);
            spawn.spawnCreep(body, `U_L${body.length}_${Game.time%100}`, {memory: {role: 'upgrader'}});
        }
    }

    // D. Execution
    for(let name in Game.creeps) {
        let creep = Game.creeps[name];
        if (creep.memory.role == 'miner') roleMiner.run(creep);
        if (creep.memory.role == 'hauler') roleHauler.run(creep);
        if (creep.memory.role == 'builder') roleWorker.run(creep, 'builder');
        if (creep.memory.role == 'upgrader') roleWorker.run(creep, 'upgrader');
    }

    // E. Advanced Console Log (Every 20 ticks)
    if (Game.time % 20 == 0) {
        let ext = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_EXTENSION}});
        let progress = Math.round((room.controller.progress / room.controller.progressTotal) * 100);

        console.log(`------------------------------------------------------------`);
        console.log(`TICK: ${Game.time} | RCL: ${room.controller.level} (${progress}%)`);
        console.log(`ENERGY: ${room.energyAvailable}/${cap} | EXTENSIONS: ${ext.length}`);
        
        sources.forEach((s, idx) => {
            let con = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER})[0];
            let amt = con ? `${con.store[RESOURCE_ENERGY]}/${con.store.getCapacity()}` : "NONE";
            console.log(`NODE ${idx} BOX: ${amt}`);
        });

        // Periodic GCL update
        if (Game.time % 100 == 0) {
            console.log(`>>> GCL: ${Game.gcl.level} - PROGRESS: ${Math.round((Game.gcl.progress/Game.gcl.progressTotal)*100)}% <<<`);
        }
        console.log(`------------------------------------------------------------`);
    }
};