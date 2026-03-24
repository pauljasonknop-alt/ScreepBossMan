const { CONFIG } = require('./config');
const { getDropPoint, smartMove, announce } = require('./helpers');
const { runTowers, autoBuild } = require('./infrastructure');
const { managePopulation } = require('./population');
const { scout, claimer, expansionMiner, expansionHauler, manageExpansionPopulation, getEnabledExpansionRooms, isRoomOwned, getExpansionMemory } = require('./expansion');

// Import all roles
const harvester = require('./roles/harvester');
const miner = require('./roles/miner');
const hauler = require('./roles/hauler');
const upgrader = require('./roles/upgrader');
const builder = require('./roles/builder');
const repairer = require('./roles/repairer');
const fighter = require('./roles/fighter');
const mineralHauler = require('./roles/mineralHauler');

const ROLES = {
    harvester, miner, hauler, upgrader, builder, repairer, fighter, mineralHauler
};

module.exports.loop = function () {
    // Clean memory
    for (let name in Memory.creeps) if (!Game.creeps[name]) delete Memory.creeps[name];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;

    let room = spawn.room;

    // Initialize room memory
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
    let roomMem = Memory.rooms[room.name];

    if (!roomMem.dropPos) {
        let drop = getDropPoint(room);
        if (drop) roomMem.dropPos = { x: drop.x, y: drop.y };
    }
    if (!roomMem.sourceIds) {
        roomMem.sourceIds = room.find(FIND_SOURCES).map(s => s.id);
        roomMem.sourceIndices = roomMem.sourceIds.reduce((acc, id, i) => { acc[id] = i; return acc; }, {});
    }

    // Run infrastructure
    autoBuild(room);
    runTowers(room);
    
    // EMERGENCY DEFENSE
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    if (enemies.length > 0) {
        let fighters = _.filter(Game.creeps, c => c.memory.role === 'fighter' && c.room.name === room.name).length;
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length;
        if (fighters === 0 && towers === 0 && !spawn.spawning) {
            console.log(`[EMERGENCY] Invaders detected! Spawning emergency fighter!`);
            let body = [ATTACK, ATTACK, MOVE, MOVE, ATTACK, MOVE];
            if (room.energyAvailable >= 400) {
                spawn.spawnCreep(body, `🛡️EmergencyFighter${Game.time}`, { 
                    memory: { role: 'fighter', patrolling: true, emergency: true } 
                });
            }
        }
    }
    
    // Manage population
    let stats = managePopulation(spawn);
    
    // Visual display
    if (spawn && stats) {
        let energyPercent = Math.floor((room.energyAvailable / room.energyCapacityAvailable) * 100);
        let color = energyPercent > 75 ? '#00ff00' : (energyPercent > 30 ? '#ffff00' : '#ff0000');
        
        room.visual.text(
            `⚡ ${room.energyAvailable}/${room.energyCapacityAvailable} (${energyPercent}%)`,
            spawn.pos.x,
            spawn.pos.y - 1.5,
            { color: color, font: 0.7, stroke: '#000000', strokeWidth: 0.2 }
        );
        
        room.visual.text(
            `RCL ${room.controller.level}`,
            spawn.pos.x,
            spawn.pos.y - 2.5,
            { color: '#88ff88', font: 0.6, stroke: '#000000', strokeWidth: 0.15 }
        );
        
        let statusText = `M:${stats.minerCount}/${stats.targetMiners} H:${stats.haulerCount}/${stats.targetHaulers} U:${stats.upgraderCount}/${stats.targetUpgraders} B:${stats.builderCount}/${stats.targetBuilders} R:${stats.repairerCount}/${stats.targetRepairers} F:${stats.fighterCount}/${stats.targetFighters} MH:${stats.mineralHaulerCount || 0}/${stats.targetMineralHaulers || 0}`;
        
        room.visual.text(
            statusText,
            spawn.pos.x,
            spawn.pos.y - 0.5,
            { color: '#aaaaff', font: 0.45, stroke: '#000000', strokeWidth: 0.1 }
        );
    }

    // Run all creeps
    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        
        if (creep.memory.role === 'scout') {
            scout.run(creep);
        } else if (creep.memory.role === 'claimer') {
            claimer.run(creep);
        } else if (creep.memory.role === 'expansionMiner') {
            expansionMiner.run(creep, creep.memory.targetRoom);
        } else if (creep.memory.role === 'expansionHauler') {
            expansionHauler.run(creep, creep.memory.targetRoom, creep.memory.mainRoom);
        } else if (ROLES[creep.memory.role]) {
            ROLES[creep.memory.role](creep, roomMem);
        }
    }
    
    // Manage expansion
    manageExpansionPopulation(spawn);

    // Periodic status report
    if (Game.time % 50 === 0) {
        console.log(`\n🔷🔷🔷 COLONY STATUS REPORT (Tick ${Game.time}) 🔷🔷🔷`);
        console.log(`🏛️  MAIN ROOM: RCL ${room.controller.level} | ⚡ Energy: ${room.energyAvailable}/${room.energyCapacityAvailable} (${Math.floor(room.energyAvailable / room.energyCapacityAvailable * 100)}%)`);
        
        // Energy full tracking
        if (!Memory.energyFullStart) Memory.energyFullStart = null;
        if (room.energyAvailable >= room.energyCapacityAvailable) {
            if (!Memory.energyFullStart) {
                Memory.energyFullStart = Game.time;
                console.log(`💰 Energy FULL at tick ${Game.time}`);
            } else {
                let fullDuration = Game.time - Memory.energyFullStart;
                console.log(`💰 Energy has been FULL for ${fullDuration} ticks`);
            }
        } else {
            if (Memory.energyFullStart) {
                let fullDuration = Game.time - Memory.energyFullStart;
                console.log(`💰 Energy was FULL for ${fullDuration} ticks (ended at tick ${Game.time})`);
                Memory.energyFullStart = null;
            }
        }
        
        // Count by role with level tracking
        console.log(`\n📊 CREEP POPULATION (by level):`);
        let roleSummary = {};
        let creepList = [];
        
        for (let name in Game.creeps) {
            let c = Game.creeps[name];
            let role = c.memory.role || 'unknown';
            let level = c.body.length;
            let sourceInfo = c.memory.sIdx !== undefined ? `S${c.memory.sIdx}` : '';
            let health = Math.floor(c.hits / c.hitsMax * 100);
            
            if (!roleSummary[role]) {
                roleSummary[role] = { count: 0, levels: [], totalLevel: 0 };
            }
            roleSummary[role].count++;
            roleSummary[role].levels.push(level);
            roleSummary[role].totalLevel += level;
            creepList.push({ name: c.name, role, level, source: sourceInfo, health, energy: c.store[RESOURCE_ENERGY] || 0 });
        }
        
        let roleOrder = ['miner', 'hauler', 'fighter', 'upgrader', 'builder', 'repairer', 'harvester', 'mineralHauler', 'expansionMiner', 'expansionHauler'];
        for (let role of roleOrder) {
            if (roleSummary[role]) {
                let avgLevel = Math.round(roleSummary[role].totalLevel / roleSummary[role].count);
                let levelRange = roleSummary[role].levels.length > 1 ? ` (${Math.min(...roleSummary[role].levels)}-${Math.max(...roleSummary[role].levels)})` : '';
                console.log(`  ${role.padEnd(14)}: ${roleSummary[role].count.toString().padStart(2)}  |  Avg Lvl: ${avgLevel}${levelRange}`);
            }
        }
        
        // Expansion Rooms Report
        let expansionRooms = getEnabledExpansionRooms();
        if (expansionRooms.length > 0) {
            console.log(`\n🌍 EXPANSION ROOMS:`);
            for (let expRoom of expansionRooms) {
                let expRoomName = expRoom.name;
                let expMem = getExpansionMemory(expRoomName);
                let expRoomObj = Game.rooms[expRoomName];
                
                let status = '❓ Unknown';
                let energyInfo = '';
                let creepInfo = '';
                
                if (!expRoomObj) {
                    status = '🔍 Scouting...';
                } else if (!isRoomOwned(expRoomObj)) {
                    status = '🚩 Claim needed';
                } else {
                    let miners = _.filter(Game.creeps, c => c.memory.role === 'expansionMiner' && c.memory.targetRoom === expRoomName).length;
                    let haulers = _.filter(Game.creeps, c => c.memory.role === 'expansionHauler' && c.memory.targetRoom === expRoomName).length;
                    let sources = expRoomObj.find(FIND_SOURCES).length;
                    status = '✅ Active';
                    creepInfo = ` | Miners: ${miners}/${sources * 1} | Haulers: ${haulers}`;
                    energyInfo = ` | Energy: ${expRoomObj.energyAvailable}/${expRoomObj.energyCapacityAvailable}`;
                }
                
                console.log(`  ${expRoom.direction.padEnd(6)} → ${expRoomName.padEnd(10)} : ${status}${creepInfo}${energyInfo}`);
            }
        } else {
            console.log(`\n🌍 EXPANSION: No rooms configured. Set grid values to 1 in EXPANSION.grid`);
        }
        
        // Detailed creep list
        console.log(`\n📋 DETAILED CREEP LIST:`);
        creepList.sort((a, b) => {
            if (a.role === 'miner' && b.role !== 'miner') return -1;
            if (a.role !== 'miner' && b.role === 'miner') return 1;
            return a.role.localeCompare(b.role);
        });
        
        for (let c of creepList) {
            let healthBar = '';
            let barLength = 10;
            let filledBars = Math.floor(c.health / (100 / barLength));
            for (let i = 0; i < barLength; i++) healthBar += i < filledBars ? '█' : '░';
            console.log(`  ${c.name.padEnd(20)} | ${c.role.padEnd(14)} | Lvl: ${c.level.toString().padStart(2)} | ${c.source.padEnd(3)} | ❤️ ${c.health}% ${healthBar} | ⚡ ${c.energy}`);
        }
        
        // Mineral info
        let mineral = room.find(FIND_MINERALS)[0];
        if (mineral) {
            let mineralPercent = mineral.mineralCapacity > 0 ? Math.floor(mineral.mineralAmount / mineral.mineralCapacity * 100) : 0;
            console.log(`\n⛏️  MINERAL: ${mineral.mineralType} | ${Math.floor(mineral.mineralAmount)}/${mineral.mineralCapacity} (${mineralPercent}%)`);
            let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } })[0];
            if (extractor) console.log(`   Extractor: ACTIVE at (${extractor.pos.x},${extractor.pos.y})`);
        }
        
        // Tower status
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        if (towers.length > 0) {
            console.log(`\n🗼 TOWERS: ${towers.length}`);
            for (let tower of towers) {
                let energyPercent = tower.store.getCapacity() > 0 ? Math.floor(tower.store[RESOURCE_ENERGY] / tower.store.getCapacity() * 100) : 0;
                console.log(`   Tower at (${tower.pos.x},${tower.pos.y}): ⚡ ${energyPercent}% (${tower.store[RESOURCE_ENERGY]}/${tower.store.getCapacity()})`);
            }
        }
        
        // Construction sites
        let sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            console.log(`\n🏗️  CONSTRUCTION: ${sites.length} sites`);
            let byType = _.groupBy(sites, 'structureType');
            for (let type in byType) console.log(`   ${type}: ${byType[type].length}`);
        }
        
        console.log(`🔷🔷🔷 END REPORT (CPU: ${Game.cpu.getUsed().toFixed(2)}) 🔷🔷🔷\n`);
    }
};