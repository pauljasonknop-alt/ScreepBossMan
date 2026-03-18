/** * SCREEPS AUTO-BOT v3.5 (RCL 3)
 * Feature: Anti-Stall Monitoring & Intent Tracking
 */

// ==========================================
// 1. POPULATION & SETTINGS CONFIGURATION
// ==========================================
const SETTINGS = {
    nodes: [
        { miners: 2, haulers: 2 }, // Node 0
        { miners: 2, haulers: 2 }  // Node 1
    ],
    builders: 4,
    upgraders: 1,
    
    purgeLowLevel: true,
    fullTicksToPurge: 100,
    dumpOffset: { x: 0, y: 2 },
    stallThreshold: 5 // Ticks before logging a stall
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const getBody = function(role, room) {
    let cap = room.energyCapacityAvailable;
    if (role === 'miner') {
        return (cap >= 550) ? [WORK, WORK, WORK, WORK, WORK, MOVE] : [WORK, WORK, MOVE];
    }
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

const getDumpPos = (spawn) => new RoomPosition(spawn.pos.x + SETTINGS.dumpOffset.x, spawn.pos.y + SETTINGS.dumpOffset.y, spawn.room.name);

/**
 * Monitors if a creep has been stationary.
 * Miners are ignored as they are meant to stay still.
 */
const monitorStall = function(creep) {
    if (creep.memory.role === 'miner') return;

    if (!creep.memory.lastPos) {
        creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y };
        creep.memory.stuckTicks = 0;
        return;
    }

    if (creep.pos.x === creep.memory.lastPos.x && creep.pos.y === creep.memory.lastPos.y) {
        creep.memory.stuckTicks = (creep.memory.stuckTicks || 0) + 1;
        
        if (creep.memory.stuckTicks >= SETTINGS.stallThreshold) {
            let task = creep.memory.intent || "Idle/Unknown";
            let reason = "Path blocked or no valid target";
            
            // Contextual guessing for the reason
            if (creep.store.getUsedCapacity() === 0) reason = "Waiting for energy source availability";
            if (creep.memory.hauling && creep.room.energyAvailable === creep.room.energyCapacityAvailable) reason = "Spawn/Extensions full";

            console.log(`[STALL] ${creep.name} stuck for ${creep.memory.stuckTicks} ticks at (${creep.pos.x},${creep.pos.y}). Task: ${task}. Reason: ${reason}`);
            creep.say('Stuck! 🛑');
        }
    } else {
        creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y };
        creep.memory.stuckTicks = 0;
    }
};

// ==========================================
// 3. ROLE LOGIC
// ==========================================

const roleHauler = {
    run: function(creep, spawn) {
        if (creep.memory.hauling && creep.store[RESOURCE_ENERGY] == 0) creep.memory.hauling = false;
        if (!creep.memory.hauling && creep.store.getFreeCapacity() == 0) creep.memory.hauling = true;

        if (!creep.memory.hauling) {
            creep.memory.intent = "Fetching Energy";
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
            creep.memory.intent = "Filling Spawn/Extensions";
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) &&
                               s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) creep.moveTo(target);
            } else {
                creep.memory.intent = "Dumping at Reserve Pile";
                let d = getDumpPos(spawn);
                if (creep.pos.isEqualTo(d)) creep.drop(RESOURCE_ENERGY);
                else creep.moveTo(d);
            }
        }
    }
};

const workerEnergyLogic = function(creep, spawn) {
    creep.memory.intent = "Withdrawing from Reserve/Container";
    let d = getDumpPos(spawn);
    let pile = d.lookFor(LOOK_RESOURCES)[0];
    if (pile && pile.amount > 50) {
        if (creep.pickup(pile) == ERR_NOT_IN_RANGE) creep.moveTo(d);
        return;
    }
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
    for(let n in Memory.creeps) if(!Game.creeps[n]) delete Memory.creeps[n];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let room = spawn.room;
    let cap = room.energyCapacityAvailable;

    // --- AUTO-PURGE ---
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

    // --- POPULATION ---
    let sources = room.find(FIND_SOURCES);
    sources.forEach((s, i) => {
        let nodeCfg = SETTINGS.nodes[i] || { miners: 1, haulers: 1 };
        let m = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == s.id);
        let h = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == s.id);

        if (m.length < nodeCfg.miners) {
            let b = getBody('miner', room);
            spawn.spawnCreep(b, `M${i}_L${b.length}_${Game.time%100}`, {memory: {role: 'miner', sourceId: s.id}});
        } else if (h.length < nodeCfg.haulers) {
            let b = getBody('hauler', room);
            spawn.spawnCreep(b, `H${i}_L${b.length}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: s.id}});
        }
    });

    if (!spawn.spawning && room.energyAvailable >= cap) {
        let bCount = _.filter(Game.creeps, c => c.memory.role == 'builder').length;
        let uCount = _.filter(Game.creeps, c => c.memory.role == 'upgrader').length;
        if (bCount < SETTINGS.builders) {
            let b = getBody('worker', room);
            spawn.spawnCreep(b, `B_L${b.length}_${Game.time%100}`, {memory: {role: 'builder'}});
        } else if (uCount < SETTINGS.upgraders) {
            let b = getBody('worker', room);
            spawn.spawnCreep(b, `U_L${b.length}_${Game.time%100}`, {memory: {role: 'upgrader'}});
        }
    }

    // --- EXECUTION ---
    for(let name in Game.creeps) {
        let c = Game.creeps[name];
        
        // Anti-Stall Check
        monitorStall(c);

        if (c.memory.role == 'miner') {
            c.memory.intent = "Mining Source";
            let s = Game.getObjectById(c.memory.sourceId);
            if (c.harvest(s) == ERR_NOT_IN_RANGE) c.moveTo(s);
        }
        
        if (c.memory.role == 'hauler') roleHauler.run(c, spawn);
        
        if (c.memory.role == 'builder' || c.memory.role == 'upgrader') {
            if (c.store[RESOURCE_ENERGY] == 0) {
                workerEnergyLogic(c, spawn);
            } else {
                if (c.memory.role == 'builder') {
                    c.memory.intent = "Building Construction Site";
                    let site = c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
                    if (site) { if (c.build(site) == ERR_NOT_IN_RANGE) c.moveTo(site); return; }
                }
                c.memory.intent = "Upgrading Controller";
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
        ['miner', 'hauler', 'builder', 'upgrader'].forEach(r => {
            let cs = _.filter(Game.creeps, c => c.memory.role == r);
            console.log(`${r.toUpperCase()}S (${cs.length}): ${cs.map(c => `L${c.body.length}`).join(', ')}`);
        });
        sources.forEach((s, i) => {
            let con = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER})[0];
            console.log(`Node ${i}: ${con ? con.store[RESOURCE_ENERGY] : 0}/${con ? con.store.getCapacity() : 0}`);
        });
        let sCounts = _.countBy(room.find(FIND_CONSTRUCTION_SITES), s => s.structureType);
        for (let type in sCounts) console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}s: ${sCounts[type]}`);
        if (Game.time % 100 == 0) console.log(`>>> GCL: ${Game.gcl.level} - PROGRESS: ${Math.round((Game.gcl.progress/Game.gcl.progressTotal)*100)}% <<<`);
        console.log(`============================================================\n`);
    }
};