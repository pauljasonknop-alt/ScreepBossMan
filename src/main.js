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
        fighter: [TOUGH, MOVE, ATTACK, MOVE, ATTACK], // Better fighter layout
        mineralHauler: [CARRY, CARRY, MOVE, CARRY, MOVE] // For minerals
    },
    tower: { 
        repairThreshold: 0.5, 
        energyReserve: 200,
        attackRange: 20
    },
    energyReserve: { 1: 0, 2: 0, 3: 300, 4: 300, 5: 300, 6: 300, 7: 300, 8: 300 }
};

// ==========================================
// 2. HELPERS & UTILITIES
// ==========================================
function getBestBody(role, room) {
    let availableEnergy = room.energyAvailable;
    
    let reserve = 0;
    if (role !== 'harvester' || room.controller.level < 2) {
        reserve = CONFIG.energyReserve[room.controller.level] || 0;
    }
    
    let energyForSpawning = Math.max(200, availableEnergy - reserve);
    
    let creepCount = _.filter(Game.creeps, c => c.room.name === room.name).length;
    if (creepCount < 3) {
        energyForSpawning = Math.min(energyForSpawning, 300);
    }
    
    let template = CONFIG.ratios.worker;
    if (role === 'hauler') template = CONFIG.ratios.hauler;
    if (role === 'miner') template = CONFIG.ratios.miner;
    if (role === 'fighter') template = CONFIG.ratios.fighter;
    if (role === 'mineralHauler') template = CONFIG.ratios.mineralHauler;

    let unitCost = _.sum(template, p => BODYPART_COST[p]);
    
    let maxUnits = Math.floor(energyForSpawning / unitCost);
    
    if (role === 'miner') maxUnits = Math.min(maxUnits, 3);
    if (role === 'fighter') maxUnits = Math.min(maxUnits, 2); // Cap fighters
    maxUnits = Math.min(maxUnits, Math.floor(50 / template.length));
    
    if (maxUnits < 1 && energyForSpawning >= unitCost) {
        maxUnits = 1;
    }
    
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
    return creep.moveTo(target, { 
        visualizePathStyle: { stroke: color, opacity: 0.5 }, 
        reusePath: 10,
        maxRooms: 1
    });
}

function announce(creep, msg) {
    if (creep.memory.lastMsg !== msg) { creep.say(msg); creep.memory.lastMsg = msg; }
}

function acquireEnergy(creep, roomMem) {
    let anyDropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    });
    if (anyDropped) {
        if (creep.pickup(anyDropped) === ERR_NOT_IN_RANGE) smartMove(creep, anyDropped, '#ffff00');
        return;
    }

    let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, '#ffaa00');
        return;
    }

    if (roomMem.dropPos) {
        let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
        let dropped = pos.lookFor(LOOK_ENERGY);
        if (dropped.length) {
            if (creep.pickup(dropped[0]) === ERR_NOT_IN_RANGE) smartMove(creep, pos, '#ffff00');
            return;
        }
        
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                let x = roomMem.dropPos.x + dx;
                let y = roomMem.dropPos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                
                let gridPos = new RoomPosition(x, y, creep.room.name);
                let gridDropped = gridPos.lookFor(LOOK_ENERGY);
                if (gridDropped.length) {
                    if (creep.pickup(gridDropped[0]) === ERR_NOT_IN_RANGE) smartMove(creep, gridPos, '#ffff00');
                    return;
                }
            }
        }
    }

    let controller = creep.room.controller;
    if (controller) {
        let nearCtrl = controller.pos.findInRange(FIND_DROPPED_RESOURCES, 5, { filter: r => r.resourceType === RESOURCE_ENERGY })[0];
        if (nearCtrl) {
            if (creep.pickup(nearCtrl) === ERR_NOT_IN_RANGE) smartMove(creep, nearCtrl, '#ffff00');
            return;
        }
    }

    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
        return;
    }

    let struct = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                     s.store[RESOURCE_ENERGY] > 200
    });
    if (struct && creep.withdraw(struct, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, struct, '#ffff00');
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
// 3. INFRASTRUCTURE & DEFENSE
// ==========================================
function runTowers(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    
    if (towers.length === 0) return;
    
    // Find ALL enemies in the room
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    
    // Log enemies for debugging
    if (enemies.length > 0 && Game.time % 10 === 0) {
        console.log(`[ALERT] ${enemies.length} enemies detected in ${room.name}!`);
    }
    
    for (let tower of towers) {
        // PRIORITY 1: ATTACK ENEMIES - THIS RUNS EVERY TICK
        if (enemies.length > 0) {
            // Find the most threatening enemy (closest or strongest)
            let target = tower.pos.findClosestByRange(enemies);
            
            if (target) {
                let result = tower.attack(target);
                if (result === OK) {
                    console.log(`[TOWER] 🔥 ATTACKING ${target.owner.username} (${target.pos.x},${target.pos.y}) - Health: ${target.hits}/${target.hitsMax}`);
                } else if (result === ERR_NOT_IN_RANGE) {
                    console.log(`[TOWER] ⚠️ Enemy at (${target.pos.x},${target.pos.y}) out of range!`);
                } else if (result === ERR_INVALID_TARGET) {
                    console.log(`[TOWER] ❌ Invalid target!`);
                }
                continue; // Skip healing/repairing while attacking
            }
        }
        
        // PRIORITY 2: Heal damaged friendly creeps (only if no enemies)
        let damagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
            filter: c => c.hits < c.hitsMax
        });
        if (damagedCreep && tower.store[RESOURCE_ENERGY] > 500) {
            tower.heal(damagedCreep);
            if (Game.time % 20 === 0) {
                console.log(`[TOWER] 💚 Healing ${damagedCreep.name}`);
            }
            continue;
        }

        // PRIORITY 3: Repair critical structures (only if we have excess energy)
        if (tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve + 200) {
            // Priority: Ramparts > Roads > Containers
            let priority = [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER];
            let damagedStructure = null;
            
            for (let type of priority) {
                damagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: s => s.structureType === type && 
                                 s.hits < s.hitsMax * 0.5 // Below 50% health
                });
                if (damagedStructure) break;
            }
            
            if (damagedStructure) {
                tower.repair(damagedStructure);
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

    if (rcl === 1) {
        return;
    }
    
    if (rcl >= 2) {
        room.find(FIND_SOURCES).forEach(src => {
            let adj = [[-1,0],[1,0],[0,-1],[0,1]];
            let containerPlaced = false;
            
            for (let d of adj) {
                let x = src.pos.x + d[0], y = src.pos.y + d[1];
                
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                
                let structures = src.pos.findInRange(FIND_STRUCTURES, 2, { 
                    filter: { structureType: STRUCTURE_CONTAINER } 
                });
                
                if (structures.length > 0) {
                    containerPlaced = true;
                    break;
                }
                
                let sites = src.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { 
                    filter: { structureType: STRUCTURE_CONTAINER } 
                });
                
                if (sites.length > 0) {
                    containerPlaced = true;
                    break;
                }
                
                let result = room.createConstructionSite(x, y, STRUCTURE_CONTAINER);
                if (result === OK) {
                    console.log(`[BUILD] Placing container at (${x},${y}) for source at (${src.pos.x},${src.pos.y})`);
                    containerPlaced = true;
                    break;
                }
            }
            
            if (!containerPlaced) {
                console.log(`[BUILD] WARNING: No spot found for container near source at (${src.pos.x},${src.pos.y})`);
            }
        });
    }
    
    if (rcl === 2) {
        if (progressPercent >= 50) {
            room.find(FIND_SOURCES).forEach(src => {
                let path = spawn.pos.findPathTo(src, { ignoreCreeps: true });
                for (let i = 0; i < path.length - 1; i++) {
                    room.createConstructionSite(path[i].x, path[i].y, STRUCTURE_ROAD);
                }
            });
        }
    } else if (rcl >= 3) {
        let sources = room.find(FIND_SOURCES);
        let controller = room.controller;
        
        sources.forEach(src => {
            let pathToSrc = PathFinder.search(spawn.pos, { pos: src.pos, range: 1 }).path;
            pathToSrc.forEach(step => {
                room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
            });
        });
        
        let pathToCtrl = PathFinder.search(spawn.pos, { pos: controller.pos, range: 3 }).path;
        pathToCtrl.forEach(step => {
            room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
        });
        
        sources.forEach(src => {
            let pathSrcToCtrl = PathFinder.search(src.pos, { pos: controller.pos, range: 3 }).path;
            pathSrcToCtrl.forEach(step => {
                room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
            });
        });
        
        for (let i = 0; i < sources.length; i++) {
            for (let j = i + 1; j < sources.length; j++) {
                let pathSrcToSrc = PathFinder.search(sources[i].pos, { pos: sources[j].pos, range: 1 }).path;
                pathSrcToSrc.forEach(step => {
                    room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
                });
            }
        }
    }

    if (rcl >= 2) {
        let firstRing = [
            [-2, -2], [-2, 0], [-2, 2],
            [0, -2],           [0, 2],
            [2, -2],  [2, 0],  [2, 2]
        ];
        
        let secondRing = [
            [-3, -3], [-3, -1], [-3, 1], [-3, 3],
            [-1, -3],                    [-1, 3],
            [1, -3],                     [1, 3],
            [3, -3],  [3, -1],  [3, 1],  [3, 3]
        ];
        
        firstRing.forEach(p => {
            let x = spawn.pos.x + p[0], y = spawn.pos.y + p[1];
            if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                if (room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                    room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
                }
            }
        });
        
        if (rcl >= 3) {
            secondRing.forEach(p => {
                let x = spawn.pos.x + p[0], y = spawn.pos.y + p[1];
                if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                    if (room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                        room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
                    }
                }
            });
        }
    }
    
    // TOWER PLACEMENT - RCL 3+ (IMPROVED)
    if (rcl >= 3) {
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        let towerSites = room.find(FIND_CONSTRUCTION_SITES, { filter: { structureType: STRUCTURE_TOWER } });
        
        if (towers.length === 0 && towerSites.length === 0) {
            // Find the best tower position (central with good coverage)
            let bestSpot = null;
            let bestScore = -Infinity;
            
            for (let x = 5; x < 45; x+=3) {
                for (let y = 5; y < 45; y+=3) {
                    let pos = new RoomPosition(x, y, room.name);
                    if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                    
                    // Check if spot is empty
                    let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                    if (structures.length > 0) continue;
                    
                    // Score based on distance to sources and controller
                    let score = 0;
                    room.find(FIND_SOURCES).forEach(src => {
                        score += 10 - pos.getRangeTo(src);
                    });
                    score += 20 - pos.getRangeTo(room.controller);
                    score -= pos.getRangeTo(spawn); // Prefer closer to spawn
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestSpot = pos;
                    }
                }
            }
            
            if (bestSpot) {
                let result = room.createConstructionSite(bestSpot.x, bestSpot.y, STRUCTURE_TOWER);
                if (result === OK) {
                    console.log(`[BUILD] Placing tower at (${bestSpot.x},${bestSpot.y})`);
                }
            }
        }
    }
    
    // LAB PLACEMENT - RCL 6+
    if (rcl >= 6) {
        let labs = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LAB } });
        if (labs.length < 3) {
            // Place labs in a cluster near spawn but away from extensions
            let labSpots = [
                [spawn.pos.x - 4, spawn.pos.y - 4],
                [spawn.pos.x - 4, spawn.pos.y - 2],
                [spawn.pos.x - 4, spawn.pos.y],
                [spawn.pos.x - 2, spawn.pos.y - 4],
                [spawn.pos.x - 2, spawn.pos.y - 2]
            ];
            
            for (let spot of labSpots) {
                let x = spot[0], y = spot[1];
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                
                let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                if (structures.length > 0) continue;
                
                room.createConstructionSite(x, y, STRUCTURE_LAB);
                console.log(`[BUILD] Placing lab at (${x},${y})`);
                break;
            }
        }
    }
    
    // EXTRACTOR PLACEMENT - RCL 6+ (on mineral deposit)
// Fix for mineral capacity (replace the mineral section)
let mineral = room.find(FIND_MINERALS)[0];
if (mineral) {
    let mineralPercent = mineral.mineralCapacity > 0 
        ? Math.floor(mineral.mineralAmount / mineral.mineralCapacity * 100) 
        : 0;
    console.log(`\n⛏️  MINERAL: ${mineral.mineralType} | ${Math.floor(mineral.mineralAmount)}/${mineral.mineralCapacity} (${mineralPercent}%)`);
    
    // Check extractor
    let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, {
        filter: { structureType: STRUCTURE_EXTRACTOR }
    })[0];
    if (extractor) {
        console.log(`   Extractor: ACTIVE at (${extractor.pos.x},${extractor.pos.y})`);
    }
}

// Fix for tower energy (replace the tower section)
let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
if (towers.length > 0) {
    console.log(`\n🗼 TOWERS: ${towers.length}`);
    for (let tower of towers) {
        let energyPercent = tower.store.getCapacity() > 0 
            ? Math.floor(tower.store[RESOURCE_ENERGY] / tower.store.getCapacity() * 100) 
            : 0;
        console.log(`   Tower at (${tower.pos.x},${tower.pos.y}): ⚡ ${energyPercent}% (${tower.store[RESOURCE_ENERGY]}/${tower.store.getCapacity()})`);
    }
}
}

// ==========================================
// 4. POPULATION MANAGER - WITH MINERAL SUPPORT
// ==========================================
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
            let sourceInfo = memory.sIdx !== undefined ? `S${memory.sIdx}` : 
                            (role === 'mineralHauler' ? 'MIN' : 'S?');
            let name = `${rolePrefix}_L${level}_${sourceInfo}_${Game.time % 1000}`;
            
            let result = spawn.spawnCreep(body, name, { memory });
            if (result === OK) {
                console.log(`[SPAWN] ${name} (${role}) with ${level} parts`);
                return true;
            } else {
                console.log(`[SPAWN FAIL] ${role} error: ${result}`);
            }
        }
        return false;
    };

// EMERGENCY MODE - FIXED for RCL 2 transition
if (emergencyMode) {
    console.log(`[EMERGENCY] NO MINERS! Harvesters: ${harvesterCount}, RCL: ${rcl}`);
    
    // PHASE 1: Ensure we have at least 1 harvester per source
    for (let i = 0; i < sources.length; i++) {
        let harvestersAtSource = _.filter(creeps, c => c.memory.role === 'harvester' && c.memory.sIdx === i).length;
        if (harvestersAtSource < 1) { // Only need 1 per source in emergency
            console.log(`[EMERGENCY] Need harvester for source ${i}`);
            if (trySpawn('harvester', { role: 'harvester', sIdx: i })) {
                return getStats();
            }
        }
    }
    
    // PHASE 2: Try to spawn a miner with current available energy
    // Miners don't need 550 energy - they can spawn with smaller bodies!
    let minerBody = getBestBody('miner', room);
    let minerCost = _.sum(minerBody, p => BODYPART_COST[p]);
    
    if (room.energyAvailable >= minerCost) {
        console.log(`[EMERGENCY] Attempting to spawn miner (cost: ${minerCost})`);
        for (let i = 0; i < sources.length; i++) {
            if (trySpawn('miner', { role: 'miner', sIdx: i })) {
                return getStats();
            }
        }
    } else {
        console.log(`[EMERGENCY] Need ${minerCost} energy for miner, have ${room.energyAvailable}`);
    }
    
    return getStats();
}

    // RCL 1
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

    // NORMAL MODE - RCL 2+
    
    // STEP 1: MINERS
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

    // STEP 2: HAULERS
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

    // STEP 3: BUILDERS, UPGRADERS, REPAIRERS
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

    // STEP 4: FIGHTERS (after all other support roles)
    if (minersFull && haulersFull && 
        builderCount >= targetBuilders && 
        upgraderCount >= targetUpgraders && 
        repairerCount >= targetRepairers) {
        
        if (rcl >= 3 && fighterCount < targetFighters) {
            if (trySpawn('fighter', { role: 'fighter', patrolling: true, sIdx: 0 })) return null;
        }
    }

    // STEP 5: MINERAL HAULERS (RCL 6+)
    if (rcl >= 6 && mineral) {
        // Check if extractor exists
        let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, {
            filter: { structureType: STRUCTURE_EXTRACTOR }
        })[0];
        
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

// ==========================================
// 5. ROLES
// ==========================================
const ROLES = {
    harvester: (creep, roomMem) => {
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
            if (creep.memory.sIdx !== undefined) {
                src = creep.room.find(FIND_SOURCES)[creep.memory.sIdx];
            }
            if (!src) {
                src = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            }
            
            if (src) {
                if (creep.harvest(src) === ERR_NOT_IN_RANGE) smartMove(creep, src, '#ffaa00');
                announce(creep, '🌾');
            }
        } else {
            let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                              s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
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
                                let x = spawn.pos.x + dx;
                                let y = spawn.pos.y + dy;
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
                            if (creep.store[RESOURCE_ENERGY] === 0) {
                                creep.memory.dropTile = null;
                            }
                        } else {
                            smartMove(creep, pos, '#888888');
                            announce(creep, '🚶 Drop');
                        }
                    }
                }
            }
        }
    },

    miner: (creep, roomMem) => {
        let src = creep.room.find(FIND_SOURCES)[creep.memory.sIdx || 0];
        if (!src) {
            console.log(`[MINER] ${creep.name} ERROR: No source found for index ${creep.memory.sIdx}`);
            return;
        }
        
        if (!creep.memory.miningPos) {
            let terrain = src.room.getTerrain();
            let spawn = Game.spawns['Spawn1'];
            
            let allSpots = [];
            
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    let x = src.pos.x + dx;
                    let y = src.pos.y + dy;
                    
                    if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    
                    let structures = src.room.lookForAt(LOOK_STRUCTURES, x, y);
                    let hasStorage = structures.some(s => s.structureType === STRUCTURE_STORAGE);
                    let hasContainer = structures.some(s => s.structureType === STRUCTURE_CONTAINER);
                    let hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                    let hasOtherStructure = structures.length > 0 && !hasStorage && !hasContainer && !hasRoad;
                    
                    if (hasOtherStructure) continue;
                    
                    let distToSpawn = Math.abs(x - spawn.pos.x) + Math.abs(y - spawn.pos.y);
                    
                    allSpots.push({
                        x, y,
                        hasStorage,
                        hasContainer,
                        hasRoad,
                        distToSpawn,
                        dx, dy,
                        score: (hasStorage ? 2000 : 0) + 
                               (hasContainer ? 1000 : 0) + 
                               (100 - distToSpawn) + 
                               (hasRoad ? 10 : 0)
                    });
                }
            }
            
            if (allSpots.length === 0) {
                console.log(`[MINER] ${creep.name} CRITICAL: No adjacent spots found for source ${creep.memory.sIdx}!`);
                return;
            }
            
            allSpots.sort((a, b) => b.score - a.score);
            
            let takenSpots = [];
            _.filter(Game.creeps, c => 
                c.memory.role === 'miner' && 
                c.memory.sIdx === creep.memory.sIdx &&
                c.memory.miningPos
            ).forEach(otherMiner => {
                if (otherMiner.id !== creep.id) {
                    takenSpots.push(`${otherMiner.memory.miningPos.x},${otherMiner.memory.miningPos.y}`);
                }
            });
            
            let selectedSpot = null;
            for (let spot of allSpots) {
                if (!takenSpots.includes(`${spot.x},${spot.y}`)) {
                    selectedSpot = spot;
                    break;
                }
            }
            
            if (selectedSpot) {
                creep.memory.miningPos = { x: selectedSpot.x, y: selectedSpot.y };
                creep.memory.standingOnStorage = selectedSpot.hasStorage;
                creep.memory.standingOnContainer = selectedSpot.hasContainer;
                
                let spotType = selectedSpot.hasStorage ? 'STORAGE' : 
                              (selectedSpot.hasContainer ? 'CONTAINER' : 
                              (selectedSpot.hasRoad ? 'ROAD' : 'EMPTY'));
                if (Game.time % 100 === 0) {
                    console.log(`[MINER] ${creep.name} assigned to ${spotType} spot (${selectedSpot.x},${selectedSpot.y}) for source ${creep.memory.sIdx}`);
                }
            } else {
                console.log(`[MINER] ${creep.name} CRITICAL: ALL ${allSpots.length} spots taken!`);
                if (allSpots.length > 0) {
                    creep.memory.miningPos = { x: allSpots[0].x, y: allSpots[0].y };
                }
            }
        }
        
        if (creep.memory.miningPos) {
            let targetPos = new RoomPosition(
                creep.memory.miningPos.x, 
                creep.memory.miningPos.y, 
                creep.room.name
            );
            
            if (!creep.pos.isEqualTo(targetPos)) {
                if (Game.time % 20 === 0) {
                    console.log(`[MINER] ${creep.name} moving to spot (${targetPos.x},${targetPos.y})`);
                }
                
                creep.moveTo(targetPos, { 
                    visualizePathStyle: { stroke: '#00ff00' },
                    reusePath: 20,
                    maxRooms: 1,
                    range: 0
                });
                announce(creep, '🚶');
                return;
            } else {
                if (!creep.memory.arrivedAtSpot) {
                    console.log(`[MINER] ${creep.name} ARRIVED at spot for source ${creep.memory.sIdx}`);
                    creep.memory.arrivedAtSpot = true;
                }
            }
        }
        
        if (creep.harvest(src) === OK) {
            announce(creep, '⛏️');
        }
    },

    hauler: (creep, roomMem) => {
        if (!creep.memory.task) creep.memory.task = 'COLLECT';
        let task = creep.memory.task;
        let miner = Game.creeps[creep.memory.minerId];
        
        if (!creep.memory.parkPos && miner) {
            let sourcePos = miner.pos;
            let terrain = creep.room.getTerrain();
            let bestParkSpot = null;
            let bestDist = Infinity;
            
            for (let dx = -4; dx <= 4; dx++) {
                for (let dy = -4; dy <= 4; dy++) {
                    let chebyshevDist = Math.max(Math.abs(dx), Math.abs(dy));
                    if (chebyshevDist !== 4) continue;
                    
                    let x = sourcePos.x + dx;
                    let y = sourcePos.y + dy;
                    
                    if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    
                    let structures = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
                    if (structures.length > 0) continue;
                    
                    let otherHauler = _.find(Game.creeps, c => 
                        c.memory.role === 'hauler' && 
                        c.memory.parkPos && 
                        c.memory.parkPos.x === x && 
                        c.memory.parkPos.y === y
                    );
                    
                    if (otherHauler && otherHauler.id !== creep.id) continue;
                    
                    let spawn = Game.spawns['Spawn1'];
                    let distToSpawn = Math.abs(x - spawn.pos.x) + Math.abs(y - spawn.pos.y);
                    
                    if (distToSpawn < bestDist) {
                        bestDist = distToSpawn;
                        bestParkSpot = { x, y };
                    }
                }
            }
            
            if (bestParkSpot) {
                creep.memory.parkPos = bestParkSpot;
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
                // Check container at miner first
                let container = miner.pos.findInRange(FIND_STRUCTURES, 3, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
                })[0];
                
                if (container && container.store[RESOURCE_ENERGY] > 0) {
                    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        smartMove(creep, container, '#ffff00');
                    }
                    announce(creep, '📦 Take');
                    return;
                }
                
                // Then check dropped energy near miner
                let dropped = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, { 
                    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50 
                });
                if (dropped.length) {
                    let target = creep.pos.findClosestByPath(dropped);
                    if (target && creep.pickup(target) === ERR_NOT_IN_RANGE) {
                        smartMove(creep, target, '#ffff00');
                    }
                    announce(creep, '⬆️');
                    return;
                }
                
                // Nothing to collect - go to parking spot
                if (creep.memory.parkPos) {
                    let pos = new RoomPosition(creep.memory.parkPos.x, creep.memory.parkPos.y, creep.room.name);
                    if (!creep.pos.isEqualTo(pos)) {
                        smartMove(creep, pos, '#888888');
                        announce(creep, '🅿️');
                    } else {
                        announce(creep, '⏳ Wait');
                    }
                }
            } else {
                // Miner died - pick up any dropped energy
                let dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { 
                    filter: r => r.resourceType === RESOURCE_ENERGY 
                });
                if (dropped && creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                    smartMove(creep, dropped, '#ffff00');
                }
            }
        } else { // DELIVER state - NEW PRIORITY ORDER
            // PRIORITY 1: Fill Spawn and Extensions (critical for spawning)
            let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            
            if (dest) {
                if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    smartMove(creep, dest, '#aaff00');
                }
                announce(creep, '🚚 Spawn/Ext');
                return;
            }
            
            // PRIORITY 2: Fill Towers (defense is important!)
            let tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER &&
                            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            
            if (tower) {
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    smartMove(creep, tower, '#ff8800');
                }
                announce(creep, '🗼 Tower');
                return;
            }
            
            // PRIORITY 3: Feed workers (upgraders/builders/repairers)
            let worker = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                filter: c => (c.memory.role === 'upgrader' || c.memory.role === 'builder' || c.memory.role === 'repairer') &&
                            c.store.getFreeCapacity() > 0
            });
            if (worker) {
                if (creep.transfer(worker, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    smartMove(creep, worker, '#aaff00');
                }
                announce(creep, '🤝 Feed');
                return;
            }
            
            // PRIORITY 4: Drop at central drop point (for workers to pick up)
            if (roomMem.dropPos) {
                let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
                if (creep.pos.isEqualTo(pos)) {
                    creep.drop(RESOURCE_ENERGY);
                    announce(creep, '📦 Drop');
                } else {
                    smartMove(creep, pos, '#aaff00');
                    announce(creep, '🚶 Drop');
                }
            }
        }
    },

    upgrader: (creep, roomMem) => {
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
    },

    builder: (creep, roomMem) => {
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
                ROLES.upgrader(creep, roomMem);
            }
        } else if (task === 'UPGRADE') {
            ROLES.upgrader(creep, roomMem);
        } else {
            acquireEnergy(creep, roomMem);
        }
    },

    repairer: (creep, roomMem) => {
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
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
            });
            if (target) {
                if (creep.repair(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ff0000');
                announce(creep, '🔧');
            } else {
                ROLES.builder(creep, roomMem);
            }
        } else {
            acquireEnergy(creep, roomMem);
        }
    },

fighter: (creep, roomMem) => {
    // Check for enemies in the CURRENT room - EVERY TICK
    let enemies = creep.room.find(FIND_HOSTILE_CREEPS);
    
    if (enemies.length > 0) {
        // PRIORITY 1: KILL INVADERS - AGGRESSIVE MODE
        let target = creep.pos.findClosestByRange(enemies);
        
        if (target) {
            // Calculate distance to target
            let range = creep.pos.getRangeTo(target);
            
            // If in attack range, attack
            if (range <= 1) {
                creep.attack(target);
                announce(creep, '⚔️ KILL');
            } else {
                // Move toward enemy
                smartMove(creep, target, '#ff0000');
                announce(creep, '⚔️ CHARGE');
            }
            
            // Log combat activity
            if (Game.time % 5 === 0) {
                console.log(`[FIGHTER] ${creep.name} attacking ${target.owner.username} at range ${range}`);
            }
            return;
        }
    }
    
    // No enemies - patrol mode AROUND SPAWN ONLY
    if (!creep.memory.patrolIndex) creep.memory.patrolIndex = 0;
    
    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    
    // Define patrol points in a tight circle around spawn (radius 5-8)
    let patrolPoints = [
        new RoomPosition(spawn.pos.x + 5, spawn.pos.y, spawn.room.name),
        new RoomPosition(spawn.pos.x, spawn.pos.y + 5, spawn.room.name),
        new RoomPosition(spawn.pos.x - 5, spawn.pos.y, spawn.room.name),
        new RoomPosition(spawn.pos.x, spawn.pos.y - 5, spawn.room.name),
        new RoomPosition(spawn.pos.x + 3, spawn.pos.y + 3, spawn.room.name),
        new RoomPosition(spawn.pos.x - 3, spawn.pos.y + 3, spawn.room.name),
        new RoomPosition(spawn.pos.x - 3, spawn.pos.y - 3, spawn.room.name),
        new RoomPosition(spawn.pos.x + 3, spawn.pos.y - 3, spawn.room.name)
    ];
    
    let target = patrolPoints[creep.memory.patrolIndex % patrolPoints.length];
    
    // Check if we're at the target
    if (creep.pos.getRangeTo(target) <= 2) {
        creep.memory.patrolIndex = (creep.memory.patrolIndex + 1) % patrolPoints.length;
    }
    
    // Move to next patrol point
    smartMove(creep, target, '#ff00ff');
    announce(creep, '🚶 Patrol');
    
    // Force field: If fighter leaves spawn room, immediately return
    if (creep.room.name !== spawn.room.name) {
        console.log(`[FIGHTER] ${creep.name} wandered to ${creep.room.name}! FORCING RETURN!`);
        creep.moveTo(spawn);
    }
},

    mineralHauler: (creep, roomMem) => {
        // New role for hauling minerals from extractor to storage/labs
        let mineral = creep.room.find(FIND_MINERALS)[0];
        if (!mineral) return;
        
        if (!creep.memory.task) creep.memory.task = 'COLLECT_MINERAL';
        let task = creep.memory.task;
        
        if (task === 'COLLECT_MINERAL' && creep.store.getFreeCapacity() === 0) {
            creep.memory.task = 'DELIVER_MINERAL';
            task = 'DELIVER_MINERAL';
        } else if (task === 'DELIVER_MINERAL' && creep.store[RESOURCE_ENERGY] === 0 && 
                   _.sum(creep.store) === 0) {
            creep.memory.task = 'COLLECT_MINERAL';
            task = 'COLLECT_MINERAL';
        }
        
        if (task === 'COLLECT_MINERAL') {
            // Check if mineral has any amount
            if (mineral.mineralAmount > 0) {
                // Check for extractor
                let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, {
                    filter: { structureType: STRUCTURE_EXTRACTOR }
                })[0];
                
                if (extractor) {
                    if (creep.harvest(mineral) === ERR_NOT_IN_RANGE) {
                        smartMove(creep, mineral, '#aa00ff');
                    }
                    announce(creep, '⛏️ Mineral');
                } else {
                    // No extractor, look for dropped minerals
                    let dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                        filter: r => r.resourceType !== RESOURCE_ENERGY
                    });
                    if (dropped && creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                        smartMove(creep, dropped, '#aa00ff');
                    }
                }
            }
        } else { // DELIVER_MINERAL
            // Try to deliver to lab first, then storage
            let labs = creep.room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LAB && 
                             s.store.getFreeCapacity(creep.store.getResourceTypes()[0]) > 0
            });
            
            if (labs.length > 0) {
                let lab = labs[0];
                let resourceType = creep.store.getResourceTypes()[0];
                if (resourceType && creep.transfer(lab, resourceType) === ERR_NOT_IN_RANGE) {
                    smartMove(creep, lab, '#ffff00');
                }
                announce(creep, '🧪 Lab');
            } else {
                // No labs need minerals, store in terminal or storage
                let terminal = creep.room.terminal;
                let storage = creep.room.storage;
                
                if (terminal && terminal.store.getFreeCapacity() > 0) {
                    let resourceType = creep.store.getResourceTypes()[0];
                    if (resourceType && creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                        smartMove(creep, terminal, '#ffff00');
                    }
                    announce(creep, '📦 Terminal');
                } else if (storage && storage.store.getFreeCapacity() > 0) {
                    let resourceType = creep.store.getResourceTypes()[0];
                    if (resourceType && creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) {
                        smartMove(creep, storage, '#ffff00');
                    }
                    announce(creep, '🏚️ Storage');
                }
            }
        }
    }
};

// ==========================================
// 6. MAIN LOOP - FIXED
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
    
    // EMERGENCY DEFENSE - If enemies detected and we have no towers/fighters
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
        if (ROLES[creep.memory.role]) ROLES[creep.memory.role](creep, roomMem);
    }

    // Periodic status report - ENHANCED with creep levels and energy stats
    if (Game.time % 50 === 0) {
        console.log(`\n🔷🔷🔷 COLONY STATUS REPORT (Tick ${Game.time}) 🔷🔷🔷`);
        console.log(`🏛️  RCL ${room.controller.level} | ⚡ Energy: ${room.energyAvailable}/${room.energyCapacityAvailable} (${Math.floor(room.energyAvailable / room.energyCapacityAvailable * 100)}%)`);
        
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
                roleSummary[role] = {
                    count: 0,
                    levels: [],
                    totalLevel: 0
                };
            }
            
            roleSummary[role].count++;
            roleSummary[role].levels.push(level);
            roleSummary[role].totalLevel += level;
            
            creepList.push({
                name: c.name,
                role: role,
                level: level,
                source: sourceInfo,
                health: health,
                energy: c.store[RESOURCE_ENERGY] || 0
            });
        }
        
        // Sort roles by priority
        let roleOrder = ['miner', 'hauler', 'fighter', 'upgrader', 'builder', 'repairer', 'harvester', 'mineralHauler'];
        
        for (let role of roleOrder) {
            if (roleSummary[role]) {
                let avgLevel = Math.round(roleSummary[role].totalLevel / roleSummary[role].count);
                let levelRange = '';
                if (roleSummary[role].levels.length > 1) {
                    let min = Math.min(...roleSummary[role].levels);
                    let max = Math.max(...roleSummary[role].levels);
                    levelRange = ` (${min}-${max})`;
                }
                console.log(`  ${role.padEnd(12)}: ${roleSummary[role].count.toString().padStart(2)}  |  Avg Lvl: ${avgLevel}${levelRange}`);
            }
        }
        
        // Detailed creep list (miners first, then by role)
        console.log(`\n📋 DETAILED CREEP LIST:`);
        
        // Sort miners first, then by role
        creepList.sort((a, b) => {
            if (a.role === 'miner' && b.role !== 'miner') return -1;
            if (a.role !== 'miner' && b.role === 'miner') return 1;
            return a.role.localeCompare(b.role);
        });
        
        for (let c of creepList) {
            let healthBar = '';
            let barLength = 10;
            let filledBars = Math.floor(c.health / (100 / barLength));
            for (let i = 0; i < barLength; i++) {
                healthBar += i < filledBars ? '█' : '░';
            }
            
            console.log(`  ${c.name.padEnd(20)} | ${c.role.padEnd(12)} | Lvl: ${c.level.toString().padStart(2)} | ${c.source.padEnd(3)} | ❤️ ${c.health}% ${healthBar} | ⚡ ${c.energy}`);
        }
        
        // Mineral info
        let mineral = room.find(FIND_MINERALS)[0];
        if (mineral) {
            let mineralPercent = mineral.mineralCapacity > 0 
                ? Math.floor(mineral.mineralAmount / mineral.mineralCapacity * 100) 
                : 0;
            console.log(`\n⛏️  MINERAL: ${mineral.mineralType} | ${Math.floor(mineral.mineralAmount)}/${mineral.mineralCapacity} (${mineralPercent}%)`);
            
            // Check extractor
            let extractor = mineral.pos.findInRange(FIND_STRUCTURES, 0, {
                filter: { structureType: STRUCTURE_EXTRACTOR }
            })[0];
            if (extractor) {
                console.log(`   Extractor: ACTIVE at (${extractor.pos.x},${extractor.pos.y})`);
            }
        }
        
        // Tower status
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        if (towers.length > 0) {
            console.log(`\n🗼 TOWERS: ${towers.length}`);
            for (let tower of towers) {
                let energyPercent = tower.store.getCapacity() > 0 
                    ? Math.floor(tower.store[RESOURCE_ENERGY] / tower.store.getCapacity() * 100) 
                    : 0;
                console.log(`   Tower at (${tower.pos.x},${tower.pos.y}): ⚡ ${energyPercent}% (${tower.store[RESOURCE_ENERGY]}/${tower.store.getCapacity()})`);
            }
        }
        
        // Construction sites
        let sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            console.log(`\n🏗️  CONSTRUCTION: ${sites.length} sites`);
            let byType = _.groupBy(sites, 'structureType');
            for (let type in byType) {
                console.log(`   ${type}: ${byType[type].length}`);
            }
        }
        
        console.log(`🔷🔷🔷 END REPORT (CPU: ${Game.cpu.getUsed().toFixed(2)}) 🔷🔷🔷\n`);
    }
};