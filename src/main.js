/** * SCREEPS AUTO-BOT v4.0 (RCL 1-3+)
 * Features: Auto-Phasing, Fighter Patrols, 1-by-1 Extensions, Tower Defense, Path Visuals.
 */

// ==========================================
// 1. SETTINGS & CONFIGURATION
// ==========================================
const SETTINGS = {
    nodes: [ { miners: 1, haulers: 2 }, { miners: 1, haulers: 2 } ],
    builders: 4,
    upgraders: 2,
    guards: 2,
    stallThreshold: 4, // User requested 4 ticks
    extensionCheckFrequency: 20,
    scanFrequency: 10,
    pathStyle: { stroke: '#ffaa00', opacity: 0.5, lineStyle: 'dashed' }
};

// ==========================================
// 2. BODY SCALING LOGIC
// ==========================================
const getBody = function(role, room) {
    let cap = room.energyCapacityAvailable;
    
    // Starting Phase (RCL 1/2)
    if (cap < 500) {
        if (role === 'harvester') return [WORK, CARRY, MOVE];
        if (role === 'guard') return [ATTACK, MOVE, MOVE];
        return [WORK, CARRY, MOVE];
    }

    // Advanced Phase (RCL 3+)
    if (role === 'miner') return [WORK, WORK, WORK, WORK, WORK, MOVE]; // 550 cost
    if (role === 'hauler') {
        let body = [];
        for(let i=0; i<Math.floor(cap/100); i++) body.push(CARRY, MOVE);
        return body;
    }
    if (role === 'guard') {
        let body = [];
        for(let i=0; i<Math.floor(cap/130); i++) body.push(ATTACK, MOVE);
        return body;
    }
    // Workers (Builder/Upgrader)
    let body = [], cost = 0, part = [WORK, CARRY, MOVE];
    while (cost + 200 <= cap && body.length < 30) { body.push(...part); cost += 200; }
    return body;
};

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

const monitorStall = function(c) {
    if (c.memory.role === 'miner' || c.spawning) return;
    if (!c.memory.lastPos) { c.memory.lastPos = { x: c.pos.x, y: c.pos.y }; c.memory.stuckTicks = 0; return; }

    if (c.pos.x === c.memory.lastPos.x && c.pos.y === c.memory.lastPos.y) {
        c.memory.stuckTicks = (c.memory.stuckTicks || 0) + 1;
        if (c.memory.stuckTicks >= SETTINGS.stallThreshold) {
            if (!c.memory.intent || (!c.memory.intent.includes("Building") && !c.memory.intent.includes("Upgrading"))) {
                console.log(`[STALL] ${c.name} stuck for ${c.memory.stuckTicks} ticks at (${c.pos.x},${c.pos.y})`);
                c.say('Stuck! 🛑');
            }
        }
    } else { c.memory.lastPos = { x: c.pos.x, y: c.pos.y }; c.memory.stuckTicks = 0; }
};

const manageTowers = function(room) {
    let towers = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});
    for (let tower of towers) {
        let enemy = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemy) { tower.attack(enemy); continue; }
        
        let damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: (s) => s.hits < s.hitsMax && s.structureType != STRUCTURE_WALL
        });
        if (damaged) tower.repair(damaged);
    }
};

const autoBuildExtensions = function(room) {
    if (Game.time % SETTINGS.extensionCheckFrequency !== 0) return;
    let sites = room.find(FIND_CONSTRUCTION_SITES);
    if (sites.length > 0) return; // Only one site at a time

    let maxExtensions = [0, 0, 5, 10, 20, 30, 40, 50, 60][room.controller.level];
    let current = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_EXTENSION}}).length;

    if (current < maxExtensions) {
        let spawn = room.find(FIND_MY_SPAWNS)[0];
        // Simple spiral placement around spawn
        for (let x = -5; x <= 5; x++) {
            for (let y = -5; y <= 5; y++) {
                let res = room.createConstructionSite(spawn.pos.x + x, spawn.pos.y + y, STRUCTURE_EXTENSION);
                if (res === OK) return;
            }
        }
    }
};

// ==========================================
// 4. ROLE LOGIC
// ==========================================

const roleGuard = {
    run: function(c) {
        if (Game.time % SETTINGS.scanFrequency === 0 || c.memory.targetId) {
            let target = Game.getObjectById(c.memory.targetId) || c.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            if (target) {
                c.memory.targetId = target.id;
                c.memory.intent = "Hunting Enemy";
                if (c.attack(target) == ERR_NOT_IN_RANGE) c.moveTo(target, {visualizePathStyle: SETTINGS.pathStyle});
                return;
            }
            c.memory.targetId = null;
        }
        // Patrol Logic
        c.memory.intent = "Patrolling Base";
        let spawn = Game.spawns['Spawn1'];
        if (!c.pos.inRangeTo(spawn, 5)) c.moveTo(spawn, {visualizePathStyle: SETTINGS.pathStyle});
    }
};

const roleMiner = {
    run: function(c) {
        let s = Game.getObjectById(c.memory.sourceId);
        let container = s.pos.findInRange(FIND_STRUCTURES, 1, {filter: s => s.structureType == STRUCTURE_CONTAINER})[0];
        
        if (!c.pos.isNearTo(s)) {
            c.moveTo(s, {visualizePathStyle: SETTINGS.pathStyle});
        } else {
            if (!container) {
                let site = s.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: s => s.structureType == STRUCTURE_CONTAINER})[0];
                if (!site) c.room.createConstructionSite(c.pos, STRUCTURE_CONTAINER);
            }
            c.harvest(s);
        }
    }
};

const roleHauler = {
    run: function(c, spawn) {
        if (c.store.getUsedCapacity() === 0) c.memory.hauling = false;
        if (c.store.getFreeCapacity() === 0) c.memory.hauling = true;

        if (!c.memory.hauling) {
            let drop = c.pos.findClosestByRange(FIND_DROPPED_RESOURCES);
            if (drop) { if (c.pickup(drop) == ERR_NOT_IN_RANGE) c.moveTo(drop, {visualizePathStyle: SETTINGS.pathStyle}); }
            else {
                let con = Game.getObjectById(c.memory.sourceId).pos.findInRange(FIND_STRUCTURES, 2, {filter: s => s.structureType == STRUCTURE_CONTAINER})[0];
                if (con && con.store[RESOURCE_ENERGY] > 0) if (c.withdraw(con, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(con, {visualizePathStyle: SETTINGS.pathStyle});
            }
        } else {
            let target = c.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (target) {
                if (c.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(target, {visualizePathStyle: SETTINGS.pathStyle});
            } else {
                // Hunt workers or drop near controller
                let worker = c.pos.findClosestByRange(FIND_MY_CREEPS, {filter: cr => (cr.memory.role == 'builder' || cr.memory.role == 'upgrader') && cr.store.getFreeCapacity() > 0});
                if (worker) {
                    if (c.transfer(worker, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(worker, {visualizePathStyle: SETTINGS.pathStyle});
                } else {
                    c.moveTo(c.room.controller, {visualizePathStyle: SETTINGS.pathStyle});
                    if (c.pos.inRangeTo(c.room.controller, 3)) c.drop(RESOURCE_ENERGY);
                }
            }
        }
    }
};

const roleHarvester = {
    run: function(c, spawn) {
        if (c.store.getFreeCapacity() > 0) {
            let s = c.pos.findClosestByPath(FIND_SOURCES);
            if (c.harvest(s) == ERR_NOT_IN_RANGE) c.moveTo(s, {visualizePathStyle: SETTINGS.pathStyle});
        } else {
            let target = c.pos.findClosestByPath(FIND_STRUCTURES, { filter: (s) => (s.structureType == STRUCTURE_EXTENSION || s.structureType == STRUCTURE_SPAWN) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
            if (target) { if (c.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(target, {visualizePathStyle: SETTINGS.pathStyle}); }
            else { if (c.upgradeController(c.room.controller) == ERR_NOT_IN_RANGE) c.moveTo(c.room.controller, {visualizePathStyle: SETTINGS.pathStyle}); }
        }
    }
};

// ==========================================
// 5. MAIN LOOP
// ==========================================

module.exports.loop = function () {
    for(let n in Memory.creeps) if(!Game.creeps[n]) delete Memory.creeps[n];
    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    let room = spawn.room, cap = room.energyCapacityAvailable;

    // --- PHASE CONTROL ---
    let progressPct = (room.controller.progress / room.controller.progressTotal) * 100;
    let isEarlyPhase = (room.controller.level < 2 || (room.controller.level == 2 && progressPct < 30));
    
    manageTowers(room);
    autoBuildExtensions(room);

    // --- SUICIDE UPGRADE LOGIC ---
    if (room.energyAvailable === cap && !spawn.spawning) {
        let lowest = _.min(_.filter(Game.creeps, c => !c.spawning), c => c.body.length);
        if (lowest && lowest !== Infinity && lowest.body.length < getBody(lowest.memory.role, room).length) {
            lowest.suicide();
        }
    }

    // --- SPAWNING QUEUE ---
    let sources = room.find(FIND_SOURCES);
    if (!spawn.spawning) {
        let guards = _.filter(Game.creeps, c => c.memory.role == 'guard');
        if (guards.length < SETTINGS.guards) {
            spawn.spawnCreep(getBody('guard', room), `G_${Game.time%100}`, {memory: {role: 'guard'}});
        } else if (isEarlyPhase) {
            let harv = _.filter(Game.creeps, c => c.memory.role == 'harvester');
            if (harv.length < 4) spawn.spawnCreep(getBody('harvester', room), `Hrv_${Game.time%100}`, {memory: {role: 'harvester'}});
        } else {
            // Advanced Spawning
            sources.forEach((s, i) => {
                let m = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.sourceId == s.id);
                let h = _.filter(Game.creeps, c => c.memory.role == 'hauler' && c.memory.sourceId == s.id);
                if (m.length < 1) spawn.spawnCreep(getBody('miner', room), `M${i}_${Game.time%100}`, {memory: {role: 'miner', sourceId: s.id}});
                else if (h.length < 2) spawn.spawnCreep(getBody('hauler', room), `H${i}_${Game.time%100}`, {memory: {role: 'hauler', sourceId: s.id}});
            });
        }
        
        let bCount = _.filter(Game.creeps, c => c.memory.role == 'builder').length;
        let uCount = _.filter(Game.creeps, c => c.memory.role == 'upgrader').length;
        if (bCount < SETTINGS.builders) spawn.spawnCreep(getBody('worker', room), `B_${Game.time%100}`, {memory: {role: 'builder'}});
        else if (uCount < SETTINGS.upgraders) spawn.spawnCreep(getBody('worker', room), `U_${Game.time%100}`, {memory: {role: 'upgrader'}});
    }

    // --- CREEP EXECUTION ---
    for(let name in Game.creeps) {
        let c = Game.creeps[name];
        if (c.spawning) continue;
        monitorStall(c);

        if (c.memory.role == 'guard') roleGuard.run(c);
        if (c.memory.role == 'harvester') roleHarvester.run(c, spawn);
        if (c.memory.role == 'miner') roleMiner.run(c);
        if (c.memory.role == 'hauler') roleHauler.run(c, spawn);
        if (c.memory.role == 'builder' || c.memory.role == 'upgrader') {
            if (c.store[RESOURCE_ENERGY] == 0) {
                let d = getDumpPos(spawn), pile = d.lookFor(LOOK_RESOURCES)[0];
                if (pile) { if (c.pickup(pile) == ERR_NOT_IN_RANGE) c.moveTo(d, {visualizePathStyle: SETTINGS.pathStyle}); }
                else {
                    let con = c.pos.findClosestByRange(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0});
                    if (con) { if (c.withdraw(con, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) c.moveTo(con, {visualizePathStyle: SETTINGS.pathStyle}); }
                }
            } else {
                let site = c.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
                if (site && c.memory.role == 'builder') { if (c.build(site) == ERR_NOT_IN_RANGE) c.moveTo(site, {visualizePathStyle: SETTINGS.pathStyle}); }
                else { if (c.upgradeController(room.controller) == ERR_NOT_IN_RANGE) c.moveTo(room.controller, {visualizePathStyle: SETTINGS.pathStyle}); }
            }
        }
    }

    // --- REPORTING ---
    if (Game.time % 20 == 0) {
        console.log(`\n== [TICK ${Game.time}] PHASE: ${isEarlyPhase ? 'EARLY' : 'ADVANCED'} ==`);
        console.log(`RCL: ${room.controller.level} (${Math.round(progressPct)}%) | Energy: ${room.energyAvailable}/${cap}`);
        ['miner', 'hauler', 'builder', 'upgrader', 'guard', 'harvester'].forEach(r => {
            let cs = _.filter(Game.creeps, c => c.memory.role == r);
            if(cs.length > 0) console.log(`${r.toUpperCase()}S: ${cs.length}`);
        });
        console.log(`========================================\n`);
    }
};