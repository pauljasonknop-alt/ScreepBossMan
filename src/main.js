/** * SCREEPS AUTO-BOT v3.7.1 (RCL 3)
 * Full Page Code - Restoration of Full Console Reporting
 */

// ==========================================
// 1. POPULATION & SETTINGS CONFIGURATION
// ==========================================
const SETTINGS = {
    nodes: [
        { miners: 2, haulers: 2 }, 
        { miners: 2, haulers: 2 }
    ],
    builders: 4,
    upgraders: 1,
    purgeLowLevel: true,
    fullTicksToPurge: 100,
    dumpOffset: { x: 0, y: 2 },
    stallThreshold: 10 
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const getBody = function(role, room) {
    let cap = room.energyCapacityAvailable;
    if (role === 'miner') return (cap >= 550) ? [WORK, WORK, WORK, WORK, WORK, MOVE] : [WORK, WORK, MOVE];
    let body = [], cost = 0, part = (role === 'hauler') ? [CARRY, MOVE] : [WORK, CARRY, MOVE];
    let pCost = _.sum(part, p => BODYPART_COST[p]);
    while (cost + pCost <= cap && body.length < 48) { body.push(...part); cost += pCost; }
    return body;
};

const getDumpPos = (spawn) => new RoomPosition(spawn.pos.x + SETTINGS.dumpOffset.x, spawn.pos.y + SETTINGS.dumpOffset.y, spawn.room.name);

const monitorStall = function(c) {
    if (c.memory.role === 'miner') return;

    let isWorking = (c.memory.intent && (c.memory.intent.includes("Building") || c.memory.intent.includes("Upgrading")));
    if (isWorking) {
        c.memory.stuckTicks = 0;
        return;
    }

    if (!c.memory.lastPos) {
        c.memory.lastPos = { x: c.pos.x, y: c.pos.y };
        c.memory.stuckTicks = 0;
        return;
    }

    if (c.pos.x === c.memory.lastPos.x && c.pos.y === c.memory.lastPos.y) {
        c.memory.stuckTicks = (c.memory.stuckTicks || 0) + 1;
        if (c.memory.stuckTicks >= SETTINGS.stallThreshold) {
            console.log(`[STALL] ${c.name} stuck at (${c.pos.x},${c.pos.y}) for ${c.memory.stuckTicks} ticks. Task: ${c.memory.intent}`);
            c.say('Stall! 🛑');
        }
    } else {
        c.memory.lastPos = { x: c.pos.x, y: c.pos.y };
        c.memory.stuckTicks = 0;
    }
};

// ==========================================
// 3. ROLE LOGIC
// ==========================================

const roleMiner = {
    run: function(c) {
        let s = Game.getObjectById(c.memory.sourceId);
        if(!s) return;
        let container = s.pos.findInRange(FIND_STRUCTURES, 1, { filter: st => st.structureType == STRUCTURE_CONTAINER })[0];
        let site = s.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, { filter: cs => cs.structureType == STRUCTURE_CONTAINER })[0];

        if (container) {
            if (!c.pos.isEqualTo(container.pos)) {
                c.memory.intent = "Moving to Container";
                c.moveTo(container);
            } else {
                c.memory.intent = "Mining (on Container)";
                c.harvest(s);
            }
        } else {
            if (!site && c.pos.isNearTo(s)) {
                c.room.createConstructionSite(c.pos, STRUCTURE_CONTAINER);
                c.say('New Box! 🛠️');
            }
            c.memory.intent = "Mining (No Container)";
            if (c.harvest(s) == ERR_NOT_IN_RANGE) c.moveTo(s);
        }
    }
};

const roleHauler = {
    run: function(c, spawn) {
        if (c.memory.hauling && c.store[RESOURCE_ENERGY] == 0) c.memory.hauling = false;
        if (!c.memory.hauling && c.store.getFreeCapacity() == 0) c.memory.hauling = true;

        if (!c.memory.hauling) {
            c.memory.intent = "Fetching Energy";
            let drop = c.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: r => r.amount > 50});
            if (drop) { if (c.pickup(drop) == ERR_NOT_IN_RANGE) c.moveTo(drop); return; }
            
            let s = Game.getObjectById(c.memory.sourceId);
            let con = s.pos.findInRange(FIND_STRUCTURES, 2, {filter: st => st.structureType == STRUCTURE_CONTAINER})[0];
            if (con && con.store[RESOURCE_ENERGY] > 0) {
                if (c.withdraw(con, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(con);
            }
        } else {
            c.memory.intent = "Filling Spawn/Extensions";
            let target = c.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (target) { if (c.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(target); }
            else {
                c.memory.intent = "Dumping at Reserve Pile";
                let d = getDumpPos(spawn);
                if (c.pos.isEqualTo(d)) c.drop(RESOURCE_ENERGY); else c.moveTo(d);
            }
        }
    }
};

const workerEnergyLogic = function(c, spawn) {
    c.memory.intent = "Getting Energy";
    let d = getDumpPos(spawn), pile = d.lookFor(LOOK_RESOURCES)[0];
    if (pile && pile.amount > 50) { if (c.pickup(pile) == ERR_NOT_IN_RANGE) c.moveTo(d); return; }
    let con = c.pos.findClosestByRange(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50});
    if (con && c.withdraw(con, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(con);
};

// ==========================================
// 4. MAIN LOOP
// ==========================================

module.exports.loop = function () {
    for(let n in Memory.creeps) if(!Game.creeps[n]) delete Memory.creeps[n];
    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let room = spawn.room, cap = room.energyCapacityAvailable;

    // --- AUTO-PURGE ---
    if (SETTINGS.purgeLowLevel && room.energyAvailable === cap) {
        Memory.fT = (Memory.fT || 0) + 1;
        if (Memory.fT > SETTINGS.fullTicksToPurge) {
            let low = _.find(Game.creeps, c => c.body.length < (getBody(c.memory.role, room).length));
            if (low) { low.suicide(); Memory.fT = 0; }
        }
    } else { Memory.fT = 0; }

    // --- POPULATION ---
    let sources = room.find(FIND_SOURCES);
    sources.forEach((s, i) => {
        let nodeCfg = SETTINGS.nodes[i] || { miners: 1, haulers: 1 };
        let m = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == s.id);
        let h = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == s.id);
        if (m.length < nodeCfg.miners) spawn.spawnCreep(getBody('miner', room), `M${i}_${Game.time%100}`, {memory: {role: 'miner', sourceId: s.id}});
        else if (h.length < nodeCfg.haulers) spawn.spawnCreep(getBody('hauler', room), `H${i}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: s.id}});
    });

    if (!spawn.spawning && room.energyAvailable >= cap) {
        let bCount = _.filter(Game.creeps, c => c.memory.role == 'builder').length;
        let uCount = _.filter(Game.creeps, c => c.memory.role == 'upgrader').length;
        if (bCount < SETTINGS.builders) spawn.spawnCreep(getBody('worker', room), `B_${Game.time%100}`, {memory: {role: 'builder'}});
        else if (uCount < SETTINGS.upgraders) spawn.spawnCreep(getBody('worker', room), `U_${Game.time%100}`, {memory: {role: 'upgrader'}});
    }

    // --- EXECUTION ---
    for(let name in Game.creeps) {
        let c = Game.creeps[name];
        monitorStall(c);

        if (c.memory.role == 'miner') roleMiner.run(c);
        if (c.memory.role == 'hauler') roleHauler.run(c, spawn);
        
        if (c.memory.role == 'builder' || c.memory.role == 'upgrader') {
            if (c.store[RESOURCE_ENERGY] == 0) workerEnergyLogic(c, spawn);
            else {
                if (c.memory.role == 'builder') {
                    c.memory.intent = "Building Construction Site";
                    let site = c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
                    if (site) { if (c.build(site) == ERR_NOT_IN_RANGE) c.moveTo(site); } 
                    else { c.memory.intent = "Upgrading Controller"; if (c.upgradeController(room.controller) == ERR_NOT_IN_RANGE) c.moveTo(room.controller); }
                } else {
                    c.memory.intent = "Upgrading Controller";
                    if (c.upgradeController(room.controller) == ERR_NOT_IN_RANGE) c.moveTo(room.controller);
                }
            }
        }
    }

    // --- FULL CONSOLE REPORTING ---
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