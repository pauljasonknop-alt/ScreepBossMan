/** * SCREEPS AUTO-BOT v3.4 (RCL 3)
 * Configuration-Driven Logic for easy population control.
 */

// ==========================================
// 1. POPULATION & SETTINGS CONFIGURATION
// ==========================================
const SETTINGS = {
    // Control Miners/Haulers per Node index [0, 1, 2...]
    nodes: [
        { miners: 2, haulers: 2 }, // Node 0 (Index 0)
        { miners: 2, haulers: 2 }  // Node 1 (Index 1) - Heavy mining
    ],
    // Control Global Workers
    builders: 4,
    upgraders: 1,
    
    // Efficiency Toggles
    purgeLowLevel: true,    // Kill old creeps to upgrade them when spawn is full
    fullTicksToPurge: 100,  // How long to wait before purging
    dumpOffset: { x: 0, y: 2 } // Where to drop energy (relative to spawn)
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const getBody = function(role, room) {
    let cap = room.energyCapacityAvailable;
    
    // Miner: Max efficiency is 5x WORK + 1x MOVE (550 cost)
    if (role === 'miner') {
        return (cap >= 550) ? [WORK, WORK, WORK, WORK, WORK, MOVE] : [WORK, WORK, MOVE];
    }
    
    // Dynamic Scaling for Haulers and Workers
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

const getDumpPos = function(spawn) {
    return new RoomPosition(
        spawn.pos.x + SETTINGS.dumpOffset.x, 
        spawn.pos.y + SETTINGS.dumpOffset.y, 
        spawn.room.name
    );
};

// ==========================================
// 3. ROLE LOGIC
// ==========================================

const roleHauler = {
    run: function(creep, spawn) {
        // State Toggle
        if (creep.memory.hauling && creep.store[RESOURCE_ENERGY] == 0) creep.memory.hauling = false;
        if (!creep.memory.hauling && creep.store.getFreeCapacity() == 0) creep.memory.hauling = true;

        if (!creep.memory.hauling) {
            // PICKUP PHASE
            let drop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: r => r.amount > 50});
            if (drop) {
                if (creep.pickup(drop) == ERR_NOT_IN_RANGE) creep.moveTo(drop);
                return;
            }
            let s = Game.getObjectById(creep.memory.sourceId);
            let con = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER})[0];
            if (con && con.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(con, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(con);
            }
        } else {
            // DELIVERY PHASE
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                               s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(target);
            } else {
                let d = getDumpPos(spawn);
                if (creep.pos.isEqualTo(d)) creep.drop(RESOURCE_ENERGY);
                else creep.moveTo(d);
            }
        }
    }
};

const workerEnergyLogic = function(creep, spawn) {
    let d = getDumpPos(spawn);
    let pile = d.lookFor(LOOK_RESOURCES)[0];
    
    // 1. Pull from Dump Pile
    if (pile && pile.amount > 50) {
        if (creep.pickup(pile) == ERR_NOT_IN_RANGE) creep.moveTo(d);
        return;
    }
    // 2. Pull from Containers
    let con = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50
    });
    if (con) {
        if (creep.withdraw(con, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(con);
    }
};

// ==========================================
// 4. MAIN LOOP
// ==========================================

module.exports.loop = function () {
    // Memory Cleanup
    for(let n in Memory.creeps) if(!Game.creeps[n]) delete Memory.creeps[n];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let room = spawn.room;
    let cap = room.energyCapacityAvailable;

    // --- AUTO-PURGE LOW LEVEL CREEPS ---
    if (SETTINGS.purgeLowLevel && room.energyAvailable === cap) {
        Memory.fT = (Memory.fT || 0) + 1;
        if (Memory.fT > SETTINGS.fullTicksToPurge) {
            let low = _.find(Game.creeps, c => c.body.length < (getBody(c.memory.role, room).length));
            if (low) {
                console.log(`!!!! PURGING LOW LEVEL: ${low.name} !!!!`);
                low.suicide();
                Memory.fT = 0;
            }
        }
    } else { Memory.fT = 0; }

    // --- POPULATION MANAGEMENT ---
    let sources = room.find(FIND_SOURCES);
    
    // 1. Spawning Miners and Haulers based on Node Config
    sources.forEach((s, i) => {
        let nodeCfg = SETTINGS.nodes[i] || { miners: 1, haulers: 1 };
        let m = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == s.id);
        let h = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == s.id);

        if (m.length < nodeCfg.miners) {
            let body = getBody('miner', room);
            spawn.spawnCreep(body, `M${i}_L${body.length}_${Game.time%100}`, {memory: {role: 'miner', sourceId: s.id}});
        } else if (h.length < nodeCfg.haulers) {
            let body = getBody('hauler', room);
            spawn.spawnCreep(body, `H${i}_L${body.length}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: s.id}});
        }
    });

    // 2. Spawning Global Workers
    if (!spawn.spawning && room.energyAvailable >= cap) {
        let b = _.filter(Game.creeps, c => c.memory.role == 'builder');
        let u = _.filter(Game.creeps, c => c.memory.role == 'upgrader');

        if (b.length < SETTINGS.builders) {
            let body = getBody('worker', room);
            spawn.spawnCreep(body, `B_L${body.length}_${Game.time%100}`, {memory: {role: 'builder'}});
        } else if (u.length < SETTINGS.upgraders) {
            let body = getBody('worker', room);
            spawn.spawnCreep(body, `U_L${body.length}_${Game.time%100}`, {memory: {role: 'upgrader'}});
        }
    }

    // --- EXECUTION ---
    for(let name in Game.creeps) {
        let c = Game.creeps[name];
        if (c.memory.role == 'miner') {
            let s = Game.getObjectById(c.memory.sourceId);
            if (c.harvest(s) == ERR_NOT_IN_RANGE) c.moveTo(s);
        }
        if (c.memory.role == 'hauler') roleHauler.run(c, spawn);
        
        if (c.memory.role == 'builder' || c.memory.role == 'upgrader') {
            if (c.store[RESOURCE_ENERGY] == 0) {
                workerEnergyLogic(c, spawn);
            } else {
                if (c.memory.role == 'builder') {
                    let site = c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
                    if (site) { if (c.build(site) == ERR_NOT_IN_RANGE) c.moveTo(site); return; }
                }
                if (c.upgradeController(room.controller) == ERR_NOT_IN_RANGE) c.moveTo(room.controller);
            }
        }
    }

    // --- CONSOLE REPORTING ---
    if (Game.time % 20 == 0) {
        let progress = Math.round(room.controller.progress/room.controller.progressTotal*100);
        console.log(`\n============== ROOM REPORT [TICK ${Game.time}] ==============`);
        console.log(`RCL: ${room.controller.level} | Next: ${room.controller.progress}/${room.controller.progressTotal} (${progress}%)`);
        console.log(`ENERGY: ${room.energyAvailable}/${cap} | FULL TICKS: ${Memory.fT || 0}`);
        
        console.log(`-- CREEP LEVELS --`);
        ['miner', 'hauler', 'builder', 'upgrader'].forEach(r => {
            let cs = _.filter(Game.creeps, c => c.memory.role == r);
            console.log(`${r.toUpperCase()}S (${cs.length}): ${cs.map(c => `L${c.body.length}`).join(', ')}`);
        });

        console.log(`-- NODE STORAGE --`);
        sources.forEach((s, i) => {
            let con = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER})[0];
            console.log(`Node ${i}: ${con ? con.store[RESOURCE_ENERGY] : 0}/${con ? con.store.getCapacity() : 0}`);
        });

        console.log(`-- CONSTRUCTION SITES --`);
        let sites = room.find(FIND_CONSTRUCTION_SITES);
        let sCounts = _.countBy(sites, s => s.structureType);
        if (Object.keys(sCounts).length > 0) {
            for (let type in sCounts) console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}s: ${sCounts[type]}`);
        } else { console.log("No active sites."); }

        if (Game.time % 100 == 0) {
            console.log(`>>> GCL: ${Game.gcl.level} - PROGRESS: ${Math.round((Game.gcl.progress/Game.gcl.progressTotal)*100)}% <<<`);
        }
        console.log(`============================================================\n`);
    }
};