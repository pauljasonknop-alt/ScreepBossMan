// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
    rcl: {
        1: { harvesters: 2, miners: 0, haulers: 0, builders: 1, upgraders: 1, repairers: 0, fighters: 0, mineralHaulers: 0 },
        2: { harvesters: 0, miners: 2, haulers: 2, builders: 2, upgraders: 2, repairers: 1, fighters: 0, mineralHaulers: 0 },
        3: { harvesters: 0, miners: 2, haulers: 2, builders: 2, upgraders: 2, repairers: 1, fighters: 2, mineralHaulers: 0 },
        4: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 2, repairers: 1, fighters: 2, mineralHaulers: 1 },
        5: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 3, repairers: 2, fighters: 2, mineralHaulers: 1 },
        6: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 3, repairers: 2, fighters: 2, mineralHaulers: 2 },
        7: { harvesters: 0, miners: 2, haulers: 4, builders: 4, upgraders: 4, repairers: 2, fighters: 2, mineralHaulers: 2 },
        8: { harvesters: 0, miners: 2, haulers: 4, builders: 4, upgraders: 4, repairers: 3, fighters: 2, mineralHaulers: 2 }
    },
    ratios: {
        worker: [WORK, CARRY, MOVE],
        hauler: [CARRY, CARRY, MOVE],
        miner:  [WORK, WORK, MOVE],
        fighter: [TOUGH, MOVE, ATTACK, MOVE, ATTACK],
        mineralHauler: [CARRY, CARRY, MOVE, CARRY, MOVE]
    },
    tower: { repairThreshold: 0.5, energyReserve: 200, attackRange: 20 },
    energyReserve: { 1: 0, 2: 0, 3: 300, 4: 300, 5: 300, 6: 300, 7: 300, 8: 300 },
    expansionMinRCL: 3
};

const EXPANSION = {
    grid: [[0,0,0],[1,0,0],[0,0,0]],
    roomNameTemplate: 'W{sectorX}N{sectorY}',
    minersPerSource: 1,
    haulersPerMiner: 1,
    minEnergyForExpansion: 500
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function getBestBody(role, room) {
    let availableEnergy = room.energyAvailable;
    let reserve = (role !== 'harvester' || room.controller.level < 2) ? (CONFIG.energyReserve[room.controller.level] || 0) : 0;
    let energyForSpawning = Math.max(200, availableEnergy - reserve);
    let creepCount = _.filter(Game.creeps, c => c.room.name === room.name).length;
    if (creepCount < 3) energyForSpawning = Math.min(energyForSpawning, 300);
    
    let template = CONFIG.ratios.worker;
    if (role === 'hauler') template = CONFIG.ratios.hauler;
    if (role === 'miner') template = CONFIG.ratios.miner;
    if (role === 'fighter') template = CONFIG.ratios.fighter;
    if (role === 'mineralHauler') template = CONFIG.ratios.mineralHauler;

    let unitCost = _.sum(template, p => BODYPART_COST[p]);
    let maxUnits = Math.floor(energyForSpawning / unitCost);
    if (role === 'miner') maxUnits = Math.min(maxUnits, 3);
    if (role === 'fighter') maxUnits = Math.min(maxUnits, 2);
    maxUnits = Math.min(maxUnits, Math.floor(50 / template.length));
    if (maxUnits < 1 && energyForSpawning >= unitCost) maxUnits = 1;
    
    let body = [];
    if (maxUnits >= 1) {
        for (let i = 0; i < maxUnits; i++) body.push(...template);
    } else {
        if (role === 'miner') return [WORK, MOVE];
        if (role === 'hauler') return [CARRY, MOVE];
        if (role === 'fighter') return [ATTACK, MOVE, ATTACK, MOVE];
        if (role === 'mineralHauler') return [CARRY, CARRY, MOVE];
        return [WORK, CARRY, MOVE];
    }
    return body;
}

function smartMove(creep, target, color) {
    if (!target) return;
    return creep.moveTo(target, { visualizePathStyle: { stroke: color, opacity: 0.5 }, reusePath: 10, maxRooms: 1 });
}

function announce(creep, msg) {
    if (creep.memory.lastMsg !== msg) { creep.say(msg); creep.memory.lastMsg = msg; }
}

function acquireEnergy(creep, roomMem) {
    // Priority 1: Dropped energy anywhere in the room
    let anyDropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50 });
    if (anyDropped) {
        if (creep.pickup(anyDropped) === ERR_NOT_IN_RANGE) smartMove(creep, anyDropped, '#ffff00');
        return true;
    }
    
    // Priority 2: Active sources
    let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, '#ffaa00');
        return true;
    }
    
    // Priority 3: Central drop point
    if (roomMem && roomMem.dropPos) {
        let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
        let dropped = pos.lookFor(LOOK_ENERGY);
        if (dropped.length) {
            if (creep.pickup(dropped[0]) === ERR_NOT_IN_RANGE) smartMove(creep, pos, '#ffff00');
            return true;
        }
        
        // Check 4x4 grid around drop point
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                let x = roomMem.dropPos.x + dx, y = roomMem.dropPos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                let gridPos = new RoomPosition(x, y, creep.room.name);
                let gridDropped = gridPos.lookFor(LOOK_ENERGY);
                if (gridDropped.length) {
                    if (creep.pickup(gridDropped[0]) === ERR_NOT_IN_RANGE) smartMove(creep, gridPos, '#ffff00');
                    return true;
                }
            }
        }
    }
    
    // Priority 4: Dropped near controller
    let controller = creep.room.controller;
    if (controller) {
        let nearCtrl = controller.pos.findInRange(FIND_DROPPED_RESOURCES, 5, { filter: r => r.resourceType === RESOURCE_ENERGY })[0];
        if (nearCtrl) {
            if (creep.pickup(nearCtrl) === ERR_NOT_IN_RANGE) smartMove(creep, nearCtrl, '#ffff00');
            return true;
        }
    }
    
    // Priority 5: Containers
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
        return true;
    }
    
    // Priority 6: Spawn/Extensions with surplus
    let struct = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store[RESOURCE_ENERGY] > 200
    });
    if (struct && creep.withdraw(struct, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, struct, '#ffff00');
    return false;
}

function getDropPoint(room) {
    let spawn = room.find(FIND_MY_SPAWNS)[0];
    let controller = room.controller;
    if (!spawn || !controller) return null;
    let midX = Math.floor((spawn.pos.x + controller.pos.x) / 2);
    let midY = Math.floor((spawn.pos.y + controller.pos.y) / 2);
    let terrain = room.getTerrain();
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            let x = midX + dx, y = midY + dy;
            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
            if (terrain.get(x, y) !== TERRAIN_MASK_WALL)
                return new RoomPosition(x, y, room.name);
        }
    }
    return new RoomPosition(midX, midY, room.name);
}

// ==========================================
// 3. INFRASTRUCTURE FUNCTIONS
// ==========================================
function runTowers(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    if (towers.length === 0) return;
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    
    for (let tower of towers) {
        // PRIORITY 1: ATTACK ENEMIES
        if (enemies.length > 0) {
            let target = tower.pos.findClosestByRange(enemies);
            if (target) tower.attack(target);
            continue;
        }
        
        // PRIORITY 2: HEAL DAMAGED CREEPS
        let damagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });
        if (damagedCreep && tower.store[RESOURCE_ENERGY] > 500) {
            tower.heal(damagedCreep);
            continue;
        }
        
        // PRIORITY 3: REPAIR STRUCTURES
        if (tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve + 200) {
            let repairPriority = [
                STRUCTURE_RAMPART, STRUCTURE_TOWER, STRUCTURE_SPAWN,
                STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL
            ];
            let damagedStructure = null;
            for (let type of repairPriority) {
                damagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: s => s.structureType === type && s.hits < s.hitsMax * (type === STRUCTURE_WALL ? 0.3 : 0.7)
                });
                if (damagedStructure) break;
            }
            if (damagedStructure) tower.repair(damagedStructure);
        }
    }
}

function monitorTowerHealth(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    for (let tower of towers) {
        let energyPercent = Math.floor(tower.store[RESOURCE_ENERGY] / tower.store.getCapacity() * 100);
        let healthPercent = Math.floor(tower.hits / tower.hitsMax * 100);
        room.visual.text(`🗼 ${energyPercent}% | ❤️ ${healthPercent}%`, tower.pos.x, tower.pos.y - 0.8,
            { color: energyPercent > 50 ? '#00ff00' : (energyPercent > 25 ? '#ffff00' : '#ff0000'), font: 0.5 });
        if (energyPercent < 25 && Game.time % 50 === 0) console.log(`[TOWER] ⚠️ Tower at (${tower.pos.x},${tower.pos.y}) low energy: ${energyPercent}%`);
        if (healthPercent < 50 && Game.time % 50 === 0) console.log(`[TOWER] ⚠️ Tower at (${tower.pos.x},${tower.pos.y}) damaged: ${healthPercent}%`);
    }
}

function emergencyTowerDefense(room, spawn) {
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    if (enemies.length === 0) return;
    let spawnEnemy = _.find(enemies, e => e.pos.getRangeTo(spawn) <= 10);
    if (spawnEnemy && Game.time % 10 === 0) {
        console.log(`[EMERGENCY] ⚠️ Enemy ${spawnEnemy.owner.username} is near spawn!`);
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        for (let tower of towers) {
            if (tower.store[RESOURCE_ENERGY] < 500) {
                let haulers = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === 'hauler' && c.store[RESOURCE_ENERGY] > 0 });
                if (haulers.length > 0) {
                    let nearestHauler = spawnEnemy.pos.findClosestByPath(haulers);
                    if (nearestHauler) nearestHauler.memory.emergencyTower = tower.id;
                }
            }
        }
    }
}

function autoBuild(room) {
    if (Game.time % 100 !== 0) return;
    let spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    let rcl = room.controller.level;
    let progressPercent = room.controller.progress / room.controller.progressTotal * 100;

    if (rcl === 1) return;
    
    // CONTAINERS at RCL 2+
    if (rcl >= 2) {
        room.find(FIND_SOURCES).forEach(src => {
            let adj = [[-1,0],[1,0],[0,-1],[0,1]];
            for (let d of adj) {
                let x = src.pos.x + d[0], y = src.pos.y + d[1];
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                let structures = src.pos.findInRange(FIND_STRUCTURES, 2, { filter: { structureType: STRUCTURE_CONTAINER } });
                if (structures.length > 0) break;
                let sites = src.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: { structureType: STRUCTURE_CONTAINER } });
                if (sites.length > 0) break;
                room.createConstructionSite(x, y, STRUCTURE_CONTAINER);
                console.log(`[BUILD] Container at (${x},${y}) for source`);
                break;
            }
        });
    }
    
    // ROADS at RCL 2+ with 50% progress
    if (rcl === 2 && progressPercent >= 50) {
        room.find(FIND_SOURCES).forEach(src => {
            let path = spawn.pos.findPathTo(src, { ignoreCreeps: true });
            for (let i = 0; i < path.length - 1; i++) {
                room.createConstructionSite(path[i].x, path[i].y, STRUCTURE_ROAD);
            }
        });
    } else if (rcl >= 3) {
        let sources = room.find(FIND_SOURCES);
        let controller = room.controller;
        sources.forEach(src => {
            let pathToSrc = PathFinder.search(spawn.pos, { pos: src.pos, range: 1 }).path;
            pathToSrc.forEach(step => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
        });
        let pathToCtrl = PathFinder.search(spawn.pos, { pos: controller.pos, range: 3 }).path;
        pathToCtrl.forEach(step => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
        sources.forEach(src => {
            let pathSrcToCtrl = PathFinder.search(src.pos, { pos: controller.pos, range: 3 }).path;
            pathSrcToCtrl.forEach(step => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
        });
        for (let i = 0; i < sources.length; i++) {
            for (let j = i + 1; j < sources.length; j++) {
                let pathSrcToSrc = PathFinder.search(sources[i].pos, { pos: sources[j].pos, range: 1 }).path;
                pathSrcToSrc.forEach(step => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
            }
        }
    }

    // EXTENSIONS at RCL 2+
    if (rcl >= 2) {
        let firstRing = [[-2,-2],[-2,0],[-2,2],[0,-2],[0,2],[2,-2],[2,0],[2,2]];
        let secondRing = [[-3,-3],[-3,-1],[-3,1],[-3,3],[-1,-3],[-1,3],[1,-3],[1,3],[3,-3],[3,-1],[3,1],[3,3]];
        firstRing.forEach(p => {
            let x = spawn.pos.x + p[0], y = spawn.pos.y + p[1];
            if (x >= 0 && x < 50 && y >= 0 && y < 50 && room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
            }
        });
        if (rcl >= 3) {
            secondRing.forEach(p => {
                let x = spawn.pos.x + p[0], y = spawn.pos.y + p[1];
                if (x >= 0 && x < 50 && y >= 0 && y < 50 && room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                    room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
                }
            });
        }
    }
    
    // TOWERS at RCL 3+
    if (rcl >= 3) {
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        let towerSites = room.find(FIND_CONSTRUCTION_SITES, { filter: { structureType: STRUCTURE_TOWER } });
        if (towers.length === 0 && towerSites.length === 0) {
            let bestSpot = null;
            let bestScore = -Infinity;
            for (let x = 5; x < 45; x+=3) {
                for (let y = 5; y < 45; y+=3) {
                    let pos = new RoomPosition(x, y, room.name);
                    if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                    let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                    if (structures.length > 0) continue;
                    let score = 0;
                    room.find(FIND_SOURCES).forEach(src => score += 10 - pos.getRangeTo(src));
                    score += 20 - pos.getRangeTo(room.controller);
                    score -= pos.getRangeTo(spawn);
                    if (score > bestScore) { bestScore = score; bestSpot = pos; }
                }
            }
            if (bestSpot) room.createConstructionSite(bestSpot.x, bestSpot.y, STRUCTURE_TOWER);
        }
    }
    
    // LABS at RCL 6+
    if (rcl >= 6) {
        let labs = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LAB } });
        if (labs.length < 3) {
            let labSpots = [[-4,-4],[-4,-2],[-4,0],[-2,-4],[-2,-2]];
            for (let spot of labSpots) {
                let x = spawn.pos.x + spot[0], y = spawn.pos.y + spot[1];
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                if (structures.length > 0) continue;
                room.createConstructionSite(x, y, STRUCTURE_LAB);
                break;
            }
        }
    }
    
    // EXTRACTOR at RCL 6+
    let mineral = room.find(FIND_MINERALS)[0];
    if (rcl >= 6 && mineral) {
        let extractors = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } });
        if (extractors.length === 0) {
            room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
        }
    }
}

// ==========================================
// 4. POPULATION MANAGEMENT
// ==========================================
function managePopulation(spawn) {
    let room = spawn.room;
    let rcl = room.controller.level;
    let config = CONFIG.rcl[rcl] || CONFIG.rcl[1];
    let sources = room.find(FIND_SOURCES);
    let mineral = room.find(FIND_MINERALS)[0];
    
    if (sources.length === 0) return null;
    
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
        let reserve = CONFIG.energyReserve[room.controller.level] || 0;
        let availableForSpawning = room.energyAvailable - reserve;
        
        if (availableForSpawning >= cost) {
            let level = body.length;
            let rolePrefix = role.slice(0,3).toUpperCase();
            let sourceInfo = memory.sIdx !== undefined ? `S${memory.sIdx}` : (role === 'mineralHauler' ? 'MIN' : 'S?');
            let name = `${rolePrefix}_L${level}_${sourceInfo}_${Game.time % 1000}`;
            let result = spawn.spawnCreep(body, name, { memory });
            if (result === OK) console.log(`[SPAWN] ${name} (${role}) with ${level} parts`);
            return result === OK;
        }
        return false;
    };

    if (emergencyMode) {
        console.log(`[EMERGENCY] NO MINERS! Harvesters: ${harvesterCount}`);
        for (let i = 0; i < sources.length; i++) {
            let harvestersAtSource = _.filter(creeps, c => c.memory.role === 'harvester' && c.memory.sIdx === i).length;
            if (harvestersAtSource < 1 && trySpawn('harvester', { role: 'harvester', sIdx: i })) return getStats();
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
        if (harvesterCount >= targetHarvesters && upgraderCount < targetUpgraders && trySpawn('upgrader', { role: 'upgrader', sIdx: 0 })) return null;
        if (harvesterCount >= targetHarvesters && upgraderCount >= targetUpgraders && builderCount < targetBuilders && trySpawn('builder', { role: 'builder', sIdx: 0 })) return null;
        return getStats();
    }

    // RCL 2+ - PRIORITY: MINERS FIRST
    for (let i = 0; i < sources.length; i++) {
        let minersAtSource = _.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length;
        if (minersAtSource < config.miners && trySpawn('miner', { role: 'miner', sIdx: i })) return null;
    }

    let minersFull = true;
    for (let i = 0; i < sources.length; i++) {
        if (_.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length < config.miners) {
            minersFull = false;
            break;
        }
    }
    if (!minersFull) return getStats();

    // THEN HAULERS
    let miners = _.filter(creeps, c => c.memory.role === 'miner');
    for (let miner of miners) {
        let haulersForMiner = _.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length;
        if (haulersForMiner < 1 && trySpawn('hauler', { role: 'hauler', minerId: miner.name, sIdx: miner.memory.sIdx })) return null;
    }

    let haulersFull = true;
    for (let miner of miners) {
        if (_.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length < 1) {
            haulersFull = false;
            break;
        }
    }
    if (!haulersFull) return getStats();

    // THEN OTHER ROLES
    if (builderCount < targetBuilders && trySpawn('builder', { role: 'builder', sIdx: 0 })) return null;
    if (builderCount >= targetBuilders && upgraderCount < targetUpgraders && trySpawn('upgrader', { role: 'upgrader', sIdx: 0 })) return null;
    if (builderCount >= targetBuilders && upgraderCount >= targetUpgraders && repairerCount < targetRepairers && trySpawn('repairer', { role: 'repairer', sIdx: 0 })) return null;
    if (rcl >= 3 && fighterCount < targetFighters && trySpawn('fighter', { role: 'fighter', patrolling: true, sIdx: 0 })) return null;
    if (rcl >= 6 && mineral) {
        let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } })[0];
        if (extractor && mineralHaulerCount < targetMineralHaulers && trySpawn('mineralHauler', { role: 'mineralHauler', mineralId: mineral.id })) return null;
    }

    return getStats();
    
    function getStats() {
        return {
            minerCount, haulerCount, harvesterCount, upgraderCount, builderCount, repairerCount, fighterCount, mineralHaulerCount,
            targetMiners, targetHaulers, targetHarvesters, targetUpgraders, targetBuilders, targetRepairers, targetFighters, targetMineralHaulers
        };
    }
}

// ==========================================
// 5. ROLE: HARVESTER
// ==========================================
// Purpose: Basic energy gathering for early game (RCL 1-2)
// Behavior: Harvests from assigned source, delivers to spawn/extensions
// When spawn/extensions are full, drops energy in 4x4 grid around spawn
const harvester = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = creep.store.getFreeCapacity() > 0 ? 'HARVEST' : 'TRANSFER';
    let task = creep.memory.task;

    if (task === 'HARVEST' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'TRANSFER';
        task = 'TRANSFER';
    } else if (task === 'TRANSFER' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'HARVEST';
        task = 'HARVEST';
    }

    if (task === 'HARVEST') {
        let src;
        if (creep.memory.sIdx !== undefined) src = creep.room.find(FIND_SOURCES)[creep.memory.sIdx];
        if (!src) src = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (src) {
            if (creep.harvest(src) === ERR_NOT_IN_RANGE) smartMove(creep, src, '#ffaa00');
            announce(creep, '🌾');
        }
    } else {
        let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (dest) {
            if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#ffffff');
            announce(creep, '🚚');
        } else {
            let spawn = Game.spawns['Spawn1'];
            if (spawn) {
                if (!creep.memory.dropTile) {
                    let terrain = creep.room.getTerrain();
                    for (let dx = -2; dx <= 2; dx++) {
                        for (let dy = -2; dy <= 2; dy++) {
                            let x = spawn.pos.x + dx, y = spawn.pos.y + dy;
                            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                            let structures = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
                            if (structures.length > 0) continue;
                            let sites = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
                            if (sites.length > 0) continue;
                            creep.memory.dropTile = { x, y };
                            break;
                        }
                        if (creep.memory.dropTile) break;
                    }
                }
                if (creep.memory.dropTile) {
                    let pos = new RoomPosition(creep.memory.dropTile.x, creep.memory.dropTile.y, creep.room.name);
                    if (creep.pos.isEqualTo(pos)) {
                        creep.drop(RESOURCE_ENERGY);
                        announce(creep, '📦');
                        if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.dropTile = null;
                    } else {
                        smartMove(creep, pos, '#888888');
                        announce(creep, '🚶 Drop');
                    }
                }
            }
        }
    }
};

// ==========================================
// 6. ROLE: MINER
// ==========================================
// Purpose: Stationary mining at sources (RCL 2+)
// Behavior: Finds optimal spot adjacent to source (prefers containers)
// Moves to spot once and NEVER moves again
// Drops energy into container at its feet
const miner = (creep, roomMem) => {
    let src = creep.room.find(FIND_SOURCES)[creep.memory.sIdx || 0];
    if (!src) return;
    
    if (!creep.memory.miningPos) {
        let terrain = src.room.getTerrain();
        let spawn = Game.spawns['Spawn1'];
        let allSpots = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                let x = src.pos.x + dx, y = src.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                let structures = src.room.lookForAt(LOOK_STRUCTURES, x, y);
                let hasContainer = structures.some(s => s.structureType === STRUCTURE_CONTAINER);
                let distToSpawn = Math.abs(x - spawn.pos.x) + Math.abs(y - spawn.pos.y);
                allSpots.push({ x, y, hasContainer, distToSpawn, score: (hasContainer ? 1000 : 0) + (100 - distToSpawn) });
            }
        }
        if (allSpots.length === 0) return;
        allSpots.sort((a, b) => b.score - a.score);
        let takenSpots = [];
        _.filter(Game.creeps, c => c.memory.role === 'miner' && c.memory.sIdx === creep.memory.sIdx && c.memory.miningPos)
            .forEach(m => { if (m.id !== creep.id) takenSpots.push(`${m.memory.miningPos.x},${m.memory.miningPos.y}`); });
        let selectedSpot = null;
        for (let spot of allSpots) {
            if (!takenSpots.includes(`${spot.x},${spot.y}`)) { selectedSpot = spot; break; }
        }
        if (selectedSpot) creep.memory.miningPos = { x: selectedSpot.x, y: selectedSpot.y };
        else if (allSpots.length > 0) creep.memory.miningPos = { x: allSpots[0].x, y: allSpots[0].y };
    }
    
    if (creep.memory.miningPos) {
        let targetPos = new RoomPosition(creep.memory.miningPos.x, creep.memory.miningPos.y, creep.room.name);
        if (!creep.pos.isEqualTo(targetPos)) {
            creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 20, range: 0 });
            announce(creep, '🚶');
            return;
        } else if (!creep.memory.arrivedAtSpot) {
            creep.memory.arrivedAtSpot = true;
        }
    }
    if (creep.harvest(src) === OK) announce(creep, '⛏️');
};

// ==========================================
// 7. ROLE: HAULER
// ==========================================
// Purpose: Transport energy from miners to base (RCL 2+)
// Behavior: Priority: Spawn/Extensions -> Towers -> Workers -> Drop Point
// Pairs with specific miner, waits at parking spot when no energy available
const hauler = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'COLLECT';
    let task = creep.memory.task;
    let miner = Game.creeps[creep.memory.minerId];
    
    // Find parking spot 4 blocks from miner
    if (!creep.memory.parkPos && miner) {
        let sourcePos = miner.pos;
        let terrain = creep.room.getTerrain();
        for (let dx = -4; dx <= 4; dx++) {
            for (let dy = -4; dy <= 4; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== 4) continue;
                let x = sourcePos.x + dx, y = sourcePos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (creep.room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
                let otherHauler = _.find(Game.creeps, c => c.memory.role === 'hauler' && c.memory.parkPos && c.memory.parkPos.x === x && c.memory.parkPos.y === y);
                if (otherHauler && otherHauler.id !== creep.id) continue;
                creep.memory.parkPos = { x, y };
                break;
            }
            if (creep.memory.parkPos) break;
        }
    }

    if (task === 'COLLECT' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'DELIVER';
        task = 'DELIVER';
    } else if (task === 'DELIVER' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'COLLECT';
        task = 'COLLECT';
    }

    if (task === 'COLLECT') {
        if (miner) {
            let container = miner.pos.findInRange(FIND_STRUCTURES, 3, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
            })[0];
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
                announce(creep, '📦 Take');
                return;
            }
            let dropped = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, { filter: r => r.resourceType === RESOURCE_ENERGY });
            if (dropped.length) {
                let target = creep.pos.findClosestByPath(dropped);
                if (target && creep.pickup(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ffff00');
                announce(creep, '⬆️');
                return;
            }
            if (creep.memory.parkPos) {
                let pos = new RoomPosition(creep.memory.parkPos.x, creep.memory.parkPos.y, creep.room.name);
                if (!creep.pos.isEqualTo(pos)) smartMove(creep, pos, '#888888');
                announce(creep, '🅿️');
            }
        }
    } else {
        // PRIORITY 1: Spawn and Extensions
        let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (dest) {
            if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#aaff00');
            announce(creep, '🚚 Spawn/Ext');
            return;
        }
        // PRIORITY 2: Towers
        let tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (tower) {
            if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, tower, '#ff8800');
            announce(creep, '🗼 Tower');
            return;
        }
        // PRIORITY 3: Workers (upgraders/builders/repairers)
        let worker = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: c => (c.memory.role === 'upgrader' || c.memory.role === 'builder' || c.memory.role === 'repairer') && c.store.getFreeCapacity() > 0
        });
        if (worker) {
            if (creep.transfer(worker, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, worker, '#aaff00');
            announce(creep, '🤝 Feed');
            return;
        }
        // PRIORITY 4: Drop Point
        if (roomMem && roomMem.dropPos) {
            let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
            if (creep.pos.isEqualTo(pos)) creep.drop(RESOURCE_ENERGY);
            else smartMove(creep, pos, '#aaff00');
            announce(creep, '📦 Drop');
        }
    }
};

// ==========================================
// 8. ROLE: UPGRADER
// ==========================================
// Purpose: Upgrade room controller
// Behavior: Gets energy from drop point, containers, or sources, then upgrades
const upgrader = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'GET_ENERGY';
    let task = creep.memory.task;

    if (task === 'UPGRADE' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'GET_ENERGY';
        task = 'GET_ENERGY';
    } else if (task === 'GET_ENERGY' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'UPGRADE';
        task = 'UPGRADE';
    }

    if (task === 'UPGRADE') {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE)
            smartMove(creep, creep.room.controller, '#8a2be2');
        announce(creep, '⚡');
    } else {
        acquireEnergy(creep, roomMem);
    }
};

// ==========================================
// 9. ROLE: BUILDER
// ==========================================
// Purpose: Build construction sites
// Behavior: If no sites, falls back to repairing damaged structures, then upgrading
const builder = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'GET_ENERGY';
    let task = creep.memory.task;

    if (task === 'BUILD' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'GET_ENERGY';
        task = 'GET_ENERGY';
    } else if (task === 'GET_ENERGY' && creep.store.getFreeCapacity() === 0) {
        let sites = creep.room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            creep.memory.task = 'BUILD';
            task = 'BUILD';
        } else {
            creep.memory.task = 'UPGRADE';
            task = 'UPGRADE';
        }
    }

    if (task === 'BUILD') {
        let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
        if (site) {
            if (creep.build(site) === ERR_NOT_IN_RANGE) smartMove(creep, site, '#0000ff');
            announce(creep, '🔨');
        } else {
            // Fallback: repair damaged structures
            let damaged = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD) && s.hits < s.hitsMax * 0.5
            });
            if (damaged) {
                if (creep.repair(damaged) === ERR_NOT_IN_RANGE) smartMove(creep, damaged, '#ff0000');
                announce(creep, '🔧');
            } else {
                upgrader(creep, roomMem);
            }
        }
    } else if (task === 'UPGRADE') {
        upgrader(creep, roomMem);
    } else {
        acquireEnergy(creep, roomMem);
    }
};

// ==========================================
// 10. ROLE: REPAIRER
// ==========================================
// Purpose: Repair damaged structures
// Behavior: Priority: Ramparts > Roads > Containers > Walls > Others
const repairer = (creep, roomMem) => {
    if (!creep.memory.task) creep.memory.task = 'GET_ENERGY';
    let task = creep.memory.task;

    if (task === 'REPAIR' && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.task = 'GET_ENERGY';
        task = 'GET_ENERGY';
    } else if (task === 'GET_ENERGY' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'REPAIR';
        task = 'REPAIR';
    }

    if (task === 'REPAIR') {
        let priority = [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER];
        let target = null;
        for (let type of priority) {
            target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType === type && s.hits < s.hitsMax && (type !== STRUCTURE_WALL ? s.hits < s.hitsMax * 0.8 : s.hits < s.hitsMax * 0.5)
            });
            if (target) break;
        }
        if (target) {
            if (creep.repair(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ff0000');
            announce(creep, target.structureType === STRUCTURE_WALL ? '🧱 Wall' : '🔧 Repair');
        } else {
            builder(creep, roomMem);
        }
    } else {
        acquireEnergy(creep, roomMem);
    }
};

// ==========================================
// 11. ROLE: FIGHTER
// ==========================================
// Purpose: Defend the room from invaders
// Behavior: Hunts enemies in room, patrols around spawn when no enemies
const fighter = (creep, roomMem) => {
    let enemies = creep.room.find(FIND_HOSTILE_CREEPS);
    if (enemies.length > 0) {
        let target = creep.pos.findClosestByRange(enemies);
        if (target) {
            if (creep.pos.getRangeTo(target) <= 1) creep.attack(target);
            else smartMove(creep, target, '#ff0000');
            announce(creep, '⚔️');
            return;
        }
    }
    let spawn = Game.spawns['Spawn1'];
    if (spawn && !creep.pos.inRangeTo(spawn, 12)) smartMove(creep, spawn, '#ff00ff');
    announce(creep, '🚶 Patrol');
};

// ==========================================
// 12. ROLE: MINERAL HAULER
// ==========================================
// Purpose: Transport minerals from extractor to storage/labs
// Behavior: Collects minerals from extractor, delivers to labs or storage
const mineralHauler = (creep, roomMem) => {
    let mineral = creep.room.find(FIND_MINERALS)[0];
    if (!mineral) return;
    if (!creep.memory.task) creep.memory.task = 'COLLECT_MINERAL';
    let task = creep.memory.task;
    if (task === 'COLLECT_MINERAL' && creep.store.getFreeCapacity() === 0) {
        creep.memory.task = 'DELIVER_MINERAL';
        task = 'DELIVER_MINERAL';
    } else if (task === 'DELIVER_MINERAL' && creep.store[RESOURCE_ENERGY] === 0 && _.sum(creep.store) === 0) {
        creep.memory.task = 'COLLECT_MINERAL';
        task = 'COLLECT_MINERAL';
    }
    if (task === 'COLLECT_MINERAL') {
        if (mineral.mineralAmount > 0) {
            let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } })[0];
            if (extractor && creep.harvest(mineral) === ERR_NOT_IN_RANGE) smartMove(creep, mineral, '#aa00ff');
            announce(creep, '⛏️ Mineral');
        }
    } else {
        let storage = creep.room.storage;
        let terminal = creep.room.terminal;
        if (storage && storage.store.getFreeCapacity() > 0) {
            let resourceType = creep.store.getResourceTypes()[0];
            if (resourceType && creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, storage, '#ffff00');
            announce(creep, '🏚️ Storage');
        } else if (terminal && terminal.store.getFreeCapacity() > 0) {
            let resourceType = creep.store.getResourceTypes()[0];
            if (resourceType && creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, terminal, '#ffff00');
            announce(creep, '📦 Terminal');
        }
    }
};

// ==========================================
// 13. EXPANSION ROLES
// ==========================================
const expansionMiner = (creep, targetRoomName) => {
    if (creep.room.name !== targetRoomName) {
        let exitDir = creep.room.findExitTo(targetRoomName);
        if (exitDir) {
            let exit = creep.pos.findClosestByPath(exitDir);
            if (exit) smartMove(creep, exit, '#ffaa00');
        }
        return;
    }
    let src = creep.room.find(FIND_SOURCES)[creep.memory.sIdx || 0];
    if (!src) return;
    if (!creep.memory.miningPos) {
        let terrain = src.room.getTerrain();
        let bestSpot = null;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                let x = src.pos.x + dx, y = src.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                bestSpot = { x, y };
                break;
            }
            if (bestSpot) break;
        }
        if (bestSpot) creep.memory.miningPos = bestSpot;
    }
    if (creep.memory.miningPos) {
        let targetPos = new RoomPosition(creep.memory.miningPos.x, creep.memory.miningPos.y, creep.room.name);
        if (!creep.pos.isEqualTo(targetPos)) {
            smartMove(creep, targetPos, '#00ff00');
            return;
        }
    }
    if (creep.harvest(src) === OK) announce(creep, '⛏️');
};

const expansionHauler = (creep, targetRoomName, mainRoomName) => {
    if (creep.room.name === targetRoomName) {
        if (creep.store.getFreeCapacity() > 0) {
            let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
            });
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
                return;
            }
        } else {
            creep.memory.returning = true;
        }
    }
    if (creep.memory.returning || creep.room.name === mainRoomName) {
        if (creep.room.name !== mainRoomName) {
            let exitDir = creep.room.findExitTo(mainRoomName);
            if (exitDir) {
                let exit = creep.pos.findClosestByPath(exitDir);
                if (exit) smartMove(creep, exit, '#ffaa00');
            }
            return;
        }
        let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (dest) {
            if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#aaff00');
            if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.returning = false;
            return;
        }
        let roomMem = Memory.rooms[mainRoomName];
        if (roomMem && roomMem.dropPos) {
            let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, mainRoomName);
            if (creep.pos.isEqualTo(pos)) {
                creep.drop(RESOURCE_ENERGY);
                creep.memory.returning = false;
            } else {
                smartMove(creep, pos, '#aaff00');
            }
        }
    }
};

// ==========================================
// 14. SCOUT AND CLAIMER
// ==========================================
const scout = {
    run: (creep) => {
        let targetRoom = creep.memory.targetRoom;
        if (creep.room.name !== targetRoom) {
            let exitDir = creep.room.findExitTo(targetRoom);
            if (exitDir) {
                let exit = creep.pos.findClosestByPath(exitDir);
                if (exit) smartMove(creep, exit, '#88ff88');
            }
        } else {
            let sources = creep.room.find(FIND_SOURCES);
            let controller = creep.room.controller;
            let owner = controller ? (controller.owner ? controller.owner.username : 'unclaimed') : 'no controller';
            console.log(`[SCOUT] ${creep.name} reached ${targetRoom}! Sources: ${sources.length}, Controller: ${owner}`);
            creep.suicide();
        }
    }
};

const claimer = {
    run: (creep) => {
        let targetRoom = creep.memory.targetRoom;
        if (creep.room.name !== targetRoom) {
            let exitDir = creep.room.findExitTo(targetRoom);
            if (exitDir) {
                let exit = creep.pos.findClosestByPath(exitDir);
                if (exit) smartMove(creep, exit, '#ffff88');
            }
        } else {
            let controller = creep.room.controller;
            if (controller) {
                if (creep.claimController(controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(controller);
                } else {
                    console.log(`[CLAIMER] ${creep.name} claimed controller in ${targetRoom}!`);
                }
            }
        }
    }
};

// ==========================================
// 15. EXPANSION FUNCTIONS
// ==========================================
function getExpansionRoomName(gridX, gridY) {
    let sectorX = gridX - 1, sectorY = gridY - 1;
    if (sectorX === 0 && sectorY === 0) return null;
    return EXPANSION.roomNameTemplate.replace('{sectorX}', sectorX).replace('{sectorY}', sectorY);
}

function getEnabledExpansionRooms() {
    let rooms = [];
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            if (EXPANSION.grid[y] && EXPANSION.grid[y][x] === 1 && !(x === 1 && y === 1)) {
                let roomName = getExpansionRoomName(x, y);
                if (roomName) rooms.push({ name: roomName, direction: x === 0 ? 'West' : (x === 2 ? 'East' : (y === 0 ? 'North' : 'South')) });
            }
        }
    }
    return rooms;
}

function manageExpansionPopulation(spawn) {
    let mainRoom = spawn.room;
    let mainRCL = mainRoom.controller.level;
    if (mainRCL < CONFIG.expansionMinRCL) return;
    let expansionRooms = getEnabledExpansionRooms();
    if (expansionRooms.length === 0) return;
    if (mainRoom.energyAvailable < EXPANSION.minEnergyForExpansion) return;
    
    for (let expRoom of expansionRooms) {
        let expRoomName = expRoom.name;
        let expRoomObj = Game.rooms[expRoomName];
        
        if (!expRoomObj) {
            let scout = _.find(Game.creeps, c => c.memory.role === 'scout' && c.memory.targetRoom === expRoomName);
            if (!scout && !spawn.spawning) {
                spawn.spawnCreep([MOVE], `Scout_${expRoomName}_${Game.time}`, { memory: { role: 'scout', targetRoom: expRoomName } });
            }
            continue;
        }
        
        if (!expRoomObj.controller || !expRoomObj.controller.my) {
            let claimer = _.find(Game.creeps, c => c.memory.role === 'claimer' && c.memory.targetRoom === expRoomName);
            if (!claimer && !spawn.spawning) {
                spawn.spawnCreep([CLAIM, MOVE], `Claimer_${expRoomName}_${Game.time}`, { memory: { role: 'claimer', targetRoom: expRoomName } });
            }
            continue;
        }
        
        let sources = expRoomObj.find(FIND_SOURCES);
        let expansionMiners = _.filter(Game.creeps, c => c.memory.role === 'expansionMiner' && c.memory.targetRoom === expRoomName).length;
        if (expansionMiners < sources.length && !spawn.spawning) {
            let body = getBestBody('miner', mainRoom);
            spawn.spawnCreep(body, `ExpMin_${expRoomName}_${Game.time}`, { memory: { role: 'expansionMiner', targetRoom: expRoomName, sIdx: expansionMiners % sources.length } });
            return;
        }
        
        let expansionHaulers = _.filter(Game.creeps, c => c.memory.role === 'expansionHauler' && c.memory.targetRoom === expRoomName).length;
        if (expansionHaulers < expansionMiners && !spawn.spawning) {
            let body = getBestBody('hauler', mainRoom);
            spawn.spawnCreep(body, `ExpHaul_${expRoomName}_${Game.time}`, { memory: { role: 'expansionHauler', targetRoom: expRoomName, mainRoom: mainRoom.name, returning: false } });
            return;
        }
    }
}

// ==========================================
// 16. MAIN LOOP
// ==========================================
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
    monitorTowerHealth(room);
    emergencyTowerDefense(room, spawn);
    
    // Emergency defense - spawn fighter if enemies detected and no defenses
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    if (enemies.length > 0) {
        let fighters = _.filter(Game.creeps, c => c.memory.role === 'fighter' && c.room.name === room.name).length;
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length;
        if (fighters === 0 && towers === 0 && !spawn.spawning && room.energyAvailable >= 400) {
            spawn.spawnCreep([ATTACK, ATTACK, MOVE, MOVE, ATTACK, MOVE], `🛡️EmergencyFighter${Game.time}`, { memory: { role: 'fighter', patrolling: true } });
        }
    }
    
    // Manage population
    let stats = managePopulation(spawn);
    
    // Visual display above spawn
    if (spawn && stats) {
        let energyPercent = Math.floor((room.energyAvailable / room.energyCapacityAvailable) * 100);
        let color = energyPercent > 75 ? '#00ff00' : (energyPercent > 30 ? '#ffff00' : '#ff0000');
        room.visual.text(`⚡ ${room.energyAvailable}/${room.energyCapacityAvailable} (${energyPercent}%)`, spawn.pos.x, spawn.pos.y - 1.5, { color: color, font: 0.7 });
        room.visual.text(`RCL ${room.controller.level}`, spawn.pos.x, spawn.pos.y - 2.5, { color: '#88ff88', font: 0.6 });
        let statusText = `M:${stats.minerCount}/${stats.targetMiners} H:${stats.haulerCount}/${stats.targetHaulers} U:${stats.upgraderCount}/${stats.targetUpgraders} B:${stats.builderCount}/${stats.targetBuilders} R:${stats.repairerCount}/${stats.targetRepairers} F:${stats.fighterCount}/${stats.targetFighters}`;
        room.visual.text(statusText, spawn.pos.x, spawn.pos.y - 0.5, { color: '#aaaaff', font: 0.45 });
    }

    // Run all creeps
    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        let role = creep.memory.role;
        
        if (role === 'scout') scout.run(creep);
        else if (role === 'claimer') claimer.run(creep);
        else if (role === 'expansionMiner') expansionMiner(creep, creep.memory.targetRoom);
        else if (role === 'expansionHauler') expansionHauler(creep, creep.memory.targetRoom, creep.memory.mainRoom);
        else if (role === 'harvester') harvester(creep, roomMem);
        else if (role === 'miner') miner(creep, roomMem);
        else if (role === 'hauler') hauler(creep, roomMem);
        else if (role === 'upgrader') upgrader(creep, roomMem);
        else if (role === 'builder') builder(creep, roomMem);
        else if (role === 'repairer') repairer(creep, roomMem);
        else if (role === 'fighter') fighter(creep, roomMem);
        else if (role === 'mineralHauler') mineralHauler(creep, roomMem);
    }
    
    // Manage expansion
    manageExpansionPopulation(spawn);

    // Periodic status report
    if (Game.time % 50 === 0) {
        console.log(`\n🔷🔷🔷 COLONY STATUS (Tick ${Game.time}) 🔷🔷🔷`);
        console.log(`🏛️ RCL ${room.controller.level} | ⚡ ${room.energyAvailable}/${room.energyCapacityAvailable} (${Math.floor(room.energyAvailable / room.energyCapacityAvailable * 100)}%)`);
        
        // Energy full tracking
        if (!Memory.energyFullStart) Memory.energyFullStart = null;
        if (room.energyAvailable >= room.energyCapacityAvailable) {
            if (!Memory.energyFullStart) {
                Memory.energyFullStart = Game.time;
                console.log(`💰 Energy FULL at tick ${Game.time}`);
            } else {
                console.log(`💰 Energy has been FULL for ${Game.time - Memory.energyFullStart} ticks`);
            }
        } else if (Memory.energyFullStart) {
            console.log(`💰 Energy was FULL for ${Game.time - Memory.energyFullStart} ticks (ended at tick ${Game.time})`);
            Memory.energyFullStart = null;
        }
        
        // Creep counts
        console.log(`\n📊 CREEP POPULATION:`);
        let roles = ['harvester', 'miner', 'hauler', 'upgrader', 'builder', 'repairer', 'fighter', 'mineralHauler', 'expansionMiner', 'expansionHauler'];
        for (let r of roles) {
            let count = _.filter(Game.creeps, c => c.memory.role === r).length;
            if (count > 0) console.log(`  ${r.padEnd(14)}: ${count}`);
        }
        
        // Tower status
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        if (towers.length > 0) {
            console.log(`\n🗼 TOWERS: ${towers.length}`);
            for (let tower of towers) {
                let energyPercent = Math.floor(tower.store[RESOURCE_ENERGY] / tower.store.getCapacity() * 100);
                let healthPercent = Math.floor(tower.hits / tower.hitsMax * 100);
                console.log(`   Tower at (${tower.pos.x},${tower.pos.y}): ⚡ ${energyPercent}% | ❤️ ${healthPercent}%`);
            }
        }
        
        // Expansion rooms
        let expansionRooms = getEnabledExpansionRooms();
        if (expansionRooms.length > 0) {
            console.log(`\n🌍 EXPANSION ROOMS:`);
            for (let exp of expansionRooms) {
                let expRoom = Game.rooms[exp.name];
                let status = !expRoom ? '🔍 Scouting' : (!expRoom.controller || !expRoom.controller.my ? '🚩 Claim needed' : '✅ Active');
                console.log(`   ${exp.direction.padEnd(6)} → ${exp.name.padEnd(10)} : ${status}`);
            }
        }
        
        // Construction sites
        let sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            console.log(`\n🏗️ CONSTRUCTION: ${sites.length} sites`);
            let byType = _.groupBy(sites, 'structureType');
            for (let type in byType) console.log(`   ${type}: ${byType[type].length}`);
        }
        
        console.log(`🔷🔷🔷 END REPORT (CPU: ${Game.cpu.getUsed().toFixed(2)}) 🔷🔷🔷\n`);
    }
};