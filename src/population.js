const { CONFIG } = require('./config');
const { getBestBody } = require('./helpers');

function managePopulation(spawn) {
    let room = spawn.room;
    let rcl = room.controller.level;
    let config = CONFIG.rcl[rcl] || CONFIG.rcl[1];
    let sources = room.find(FIND_SOURCES);
    let mineral = room.find(FIND_MINERALS)[0];
    
    if (sources.length === 0) {
        console.log(`[ERROR] No sources found in room!`);
        return null;
    }
    
    let creeps = _.filter(Game.creeps, c => c.room.name === room.name);
    
    let minerCount = _.filter(creeps, c => c.memory.role === 'miner').length;
    let haulerCount = _.filter(creeps, c => c.memory.role === 'hauler').length;
    let harvesterCount = _.filter(creeps, c => c.memory.role === 'harvester').length;
    let upgraderCount = _.filter(creeps, c => c.memory.role === 'upgrader').length;
    let builderCount = _.filter(creeps, c => c.memory.role === 'builder').length;
    let repairerCount = _.filter(creeps, c => c.memory.role === 'repairer').length;
    let fighterCount = _.filter(creeps, c => c.memory.role === 'fighter').length;
    let mineralHaulerCount = _.filter(creeps, c => c.memory.role === 'mineralHauler').length;

    let targetMiners = config.miners * sources.length;
    let targetHaulers = config.haulers * sources.length;
    let targetHarvesters = config.harvesters * sources.length;
    let targetUpgraders = config.upgraders;
    let targetBuilders = config.builders;
    let targetRepairers = config.repairers;
    let targetFighters = config.fighters;
    let targetMineralHaulers = mineral ? config.mineralHaulers : 0;

    let emergencyMode = (rcl >= 2 && minerCount === 0);

    if (spawn.spawning) return null;

    let trySpawn = (role, memory) => {
        let body = getBestBody(role, room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        let availableForSpawning = room.energyAvailable;
        
        if (availableForSpawning >= cost) {
            let level = body.length;
            let rolePrefix = role.slice(0,3).toUpperCase();
            let sourceInfo = memory.sIdx !== undefined ? `S${memory.sIdx}` : (role === 'mineralHauler' ? 'MIN' : 'S?');
            let name = `${rolePrefix}_L${level}_${sourceInfo}_${Game.time % 1000}`;
            let result = spawn.spawnCreep(body, name, { memory });
            if (result === OK) {
                console.log(`[SPAWN] ${name} (${role}) with ${level} parts`);
                return true;
            }
        }
        return false;
    };

    if (emergencyMode) {
        console.log(`[EMERGENCY] NO MINERS! Harvesters: ${harvesterCount}, RCL: ${rcl}`);
        for (let i = 0; i < sources.length; i++) {
            let harvestersAtSource = _.filter(creeps, c => c.memory.role === 'harvester' && c.memory.sIdx === i).length;
            if (harvestersAtSource < 1) {
                if (trySpawn('harvester', { role: 'harvester', sIdx: i })) return getStats();
            }
        }
        let minerBody = getBestBody('miner', room);
        let minerCost = _.sum(minerBody, p => BODYPART_COST[p]);
        if (room.energyAvailable >= minerCost) {
            for (let i = 0; i < sources.length; i++) {
                if (trySpawn('miner', { role: 'miner', sIdx: i })) return getStats();
            }
        }
        return getStats();
    }

    if (rcl === 1) {
        if (harvesterCount < targetHarvesters) {
            let srcCounts = sources.map((s, idx) => _.filter(creeps, c => c.memory.sIdx === idx).length);
            let bestSrcIdx = srcCounts.indexOf(Math.min(...srcCounts));
            if (trySpawn('harvester', { role: 'harvester', sIdx: bestSrcIdx })) return null;
        }
        if (harvesterCount >= targetHarvesters && upgraderCount < targetUpgraders) {
            if (trySpawn('upgrader', { role: 'upgrader', sIdx: 0 })) return null;
        }
        if (harvesterCount >= targetHarvesters && upgraderCount >= targetUpgraders && builderCount < targetBuilders) {
            if (trySpawn('builder', { role: 'builder', sIdx: 0 })) return null;
        }
        return getStats();
    }

    // RCL 2+ NORMAL MODE
    for (let i = 0; i < sources.length; i++) {
        let minersAtSource = _.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length;
        if (minersAtSource < config.miners) {
            if (trySpawn('miner', { role: 'miner', sIdx: i })) return null;
        }
    }

    let minersFull = true;
    for (let i = 0; i < sources.length; i++) {
        if (_.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length < config.miners) {
            minersFull = false;
            break;
        }
    }

    if (minersFull) {
        let miners = _.filter(creeps, c => c.memory.role === 'miner');
        for (let miner of miners) {
            let haulersForMiner = _.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length;
            if (haulersForMiner < 1) {
                if (trySpawn('hauler', { role: 'hauler', minerId: miner.name, sIdx: miner.memory.sIdx })) return null;
            }
        }
    } else {
        return getStats();
    }

    let miners = _.filter(creeps, c => c.memory.role === 'miner');
    let haulersFull = true;
    for (let miner of miners) {
        if (_.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length < 1) {
            haulersFull = false;
            break;
        }
    }

    if (minersFull && haulersFull) {
        if (builderCount < targetBuilders) {
            if (trySpawn('builder', { role: 'builder', sIdx: 0 })) return null;
        }
        if (builderCount >= targetBuilders && upgraderCount < targetUpgraders) {
            if (trySpawn('upgrader', { role: 'upgrader', sIdx: 0 })) return null;
        }
        if (builderCount >= targetBuilders && upgraderCount >= targetUpgraders && repairerCount < targetRepairers) {
            if (trySpawn('repairer', { role: 'repairer', sIdx: 0 })) return null;
        }
    }

    if (minersFull && haulersFull && builderCount >= targetBuilders && upgraderCount >= targetUpgraders && repairerCount >= targetRepairers) {
        if (rcl >= 3 && fighterCount < targetFighters) {
            if (trySpawn('fighter', { role: 'fighter', patrolling: true, sIdx: 0 })) return null;
        }
    }

    if (rcl >= 6 && mineral) {
        let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } })[0];
        if (extractor && mineralHaulerCount < targetMineralHaulers) {
            if (trySpawn('mineralHauler', { role: 'mineralHauler', mineralId: mineral.id })) return null;
        }
    }

    return getStats();
    
    function getStats() {
        return {
            minerCount, haulerCount, harvesterCount, upgraderCount, 
            builderCount, repairerCount, fighterCount, mineralHaulerCount,
            targetMiners, targetHaulers, targetHarvesters, 
            targetUpgraders, targetBuilders, targetRepairers, targetFighters, targetMineralHaulers
        };
    }
}

module.exports = { managePopulation };