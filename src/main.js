// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
    rcl: {
        1: { harvesters: 2, miners: 0, haulers: 0, builders: 1, upgraders: 1, repairers: 0, fighters: 0 },
        2: { harvesters: 0, miners: 2, haulers: 2, builders: 2, upgraders: 2, repairers: 1, fighters: 0 },
        3: { harvesters: 0, miners: 2, haulers: 2, builders: 2, upgraders: 2, repairers: 1, fighters: 2 },
        4: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 2, repairers: 1, fighters: 2 },
        5: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 3, repairers: 2, fighters: 2 }
    },
    ratios: {
        worker: [WORK, CARRY, MOVE],
        hauler: [CARRY, CARRY, MOVE],
        miner:  [WORK, WORK, MOVE],
        fighter: [TOUGH, MOVE, ATTACK]
    },
    tower: { repairThreshold: 0.5, energyReserve: 200 },
    energyReserve: { 1: 0, 2: 0, 3: 300, 4: 300, 5: 300 }
};

// ==========================================
// 2. HELPERS & UTILITIES
// ==========================================
function getBestBody(role, room) {
    // Use capacity for max sizing, but respect energy reserve
    let reserve = CONFIG.energyReserve[room.controller.level] || 0;
    let availableForSpawning = Math.max(0, room.energyAvailable - reserve);
    let energy = Math.min(room.energyCapacityAvailable, availableForSpawning);
    
    // Emergency fallback for first creeps
    let creepCount = _.filter(Game.creeps, c => c.room.name === room.name).length;
    if (creepCount < 2) energy = Math.min(room.energyAvailable, 300);

    let template = CONFIG.ratios.worker;
    if (role === 'hauler') template = CONFIG.ratios.hauler;
    if (role === 'miner') template = CONFIG.ratios.miner;
    if (role === 'fighter') template = CONFIG.ratios.fighter;

    let unitCost = _.sum(template, p => BODYPART_COST[p]);
    let maxUnits = Math.floor(energy / unitCost);
    
    if (role === 'miner') maxUnits = Math.min(maxUnits, 3);
    maxUnits = Math.min(maxUnits, Math.floor(50 / template.length));

    let body = [];
    for (let i = 0; i < maxUnits; i++) body.push(...template);
    return body.length ? body : [WORK, CARRY, MOVE];
}

function smartMove(creep, target, color) {
    if (!target) return;
    return creep.moveTo(target, { visualizePathStyle: { stroke: color, opacity: 0.5 }, reusePath: 10 });
}

function announce(creep, msg) {
    if (creep.memory.lastMsg !== msg) { creep.say(msg); creep.memory.lastMsg = msg; }
}

// Universal energy retrieval with priority: ANY dropped energy → sources → drop point → near controller → containers → spawn/ext
function acquireEnergy(creep, roomMem) {
    // 1. ANY dropped energy anywhere in the room (highest priority)
    let anyDropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    });
    if (anyDropped) {
        if (creep.pickup(anyDropped) === ERR_NOT_IN_RANGE) smartMove(creep, anyDropped, '#ffff00');
        return;
    }

    // 2. Sources (if nothing on ground)
    let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, '#ffaa00');
        return;
    }

    // 3. Central drop point
    if (roomMem.dropPos) {
        let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
        let dropped = pos.lookFor(LOOK_ENERGY);
        if (dropped.length) {
            if (creep.pickup(dropped[0]) === ERR_NOT_IN_RANGE) smartMove(creep, pos, '#ffff00');
            return;
        }
        
        // Also check the 4x4 grid around drop point
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

    // 4. Dropped near controller (for upgraders)
    let controller = creep.room.controller;
    if (controller) {
        let nearCtrl = controller.pos.findInRange(FIND_DROPPED_RESOURCES, 5, { filter: r => r.resourceType === RESOURCE_ENERGY })[0];
        if (nearCtrl) {
            if (creep.pickup(nearCtrl) === ERR_NOT_IN_RANGE) smartMove(creep, nearCtrl, '#ffff00');
            return;
        }
    }

    // 5. Containers
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
        return;
    }

    // 6. Spawn/Extensions (only if they have surplus)
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
    for (let tower of towers) {
        let enemy = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemy) { tower.attack(enemy); continue; }

        if (tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve) {
            let damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: s => s.hits < s.hitsMax * CONFIG.tower.repairThreshold && s.structureType !== STRUCTURE_WALL
            });
            if (damaged) tower.repair(damaged);
        }
    }
}

function autoBuild(room) {
    if (Game.time % 100 !== 0) return;
    let spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    let rcl = room.controller.level;
    let progressPercent = room.controller.progress / room.controller.progressTotal * 100;

    // NO ROADS AT RCL 1 - wait until RCL 2 with 50% progress
    if (rcl === 1) {
        return;
    }
    
    // CONTAINER PLACEMENT - ABSOLUTE TOP PRIORITY AT RCL 2+
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
    
    // RCL 2: Only start building roads at 50% progress
    if (rcl === 2) {
        if (progressPercent >= 50) {
            room.find(FIND_SOURCES).forEach(src => {
                let path = spawn.pos.findPathTo(src, { ignoreCreeps: true });
                for (let i = 0; i < path.length - 1; i++) {
                    room.createConstructionSite(path[i].x, path[i].y, STRUCTURE_ROAD);
                }
            });
        }
    }

    // RCL 3+ : Build comprehensive road network (always)
    else if (rcl >= 3) {
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

    // EXTENSIONS - Two rings around spawn (RCL 2+)
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
    
    // TOWER PLACEMENT - RCL 3+
    if (rcl >= 3) {
        let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        let towerSites = room.find(FIND_CONSTRUCTION_SITES, { filter: { structureType: STRUCTURE_TOWER } });
        
        if (towers.length === 0 && towerSites.length === 0) {
            let towerSpots = [
                [-2, -2], [2, -2], [-2, 2], [2, 2],
                [-3, 0], [3, 0], [0, -3], [0, 3],
                [-4, -4], [4, -4], [-4, 4], [4, 4]
            ];
            
            for (let spot of towerSpots) {
                let x = spawn.pos.x + spot[0], y = spawn.pos.y + spot[1];
                if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                    if (room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                        let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                        let sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
                        if (structures.length === 0 && sites.length === 0) {
                            let result = room.createConstructionSite(x, y, STRUCTURE_TOWER);
                            if (result === OK) {
                                console.log(`[BUILD] Placing tower at (${x},${y})`);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 4. POPULATION MANAGER - FIXED SPAWN ORDER
// ==========================================
function managePopulation(spawn) {
    let room = spawn.room;
    let rcl = room.controller.level;
    let config = CONFIG.rcl[rcl] || CONFIG.rcl[1];
    let sources = room.find(FIND_SOURCES);
    let creeps = _.filter(Game.creeps, c => c.room.name === room.name);
    
    // Count current creeps by role
    let minerCount = _.filter(creeps, c => c.memory.role === 'miner').length;
    let haulerCount = _.filter(creeps, c => c.memory.role === 'hauler').length;
    let harvesterCount = _.filter(creeps, c => c.memory.role === 'harvester').length;
    let upgraderCount = _.filter(creeps, c => c.memory.role === 'upgrader').length;
    let builderCount = _.filter(creeps, c => c.memory.role === 'builder').length;
    let repairerCount = _.filter(creeps, c => c.memory.role === 'repairer').length;
    let fighterCount = _.filter(creeps, c => c.memory.role === 'fighter').length;

    // Calculate target counts
    let targetMiners = config.miners * sources.length;
    let targetHaulers = config.haulers * sources.length;
    let targetHarvesters = config.harvesters * sources.length;
    let targetUpgraders = config.upgraders;
    let targetBuilders = config.builders;
    let targetRepairers = config.repairers;
    let targetFighters = config.fighters;

    // EMERGENCY DETECTION - If miners or haulers are critically low
    let emergencyMode = (rcl >= 2 && (minerCount < 1 || haulerCount < 1));
    
    // Stagnation detection
    Memory.energyFullTicks = (room.energyAvailable >= room.energyCapacityAvailable) ? (Memory.energyFullTicks || 0) + 1 : 0;
    
    if (spawn.spawning) return;

    let trySpawn = (role, memory) => {
        let body = getBestBody(role, room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        let reserve = CONFIG.energyReserve[room.controller.level] || 0;
        let availableForSpawning = room.energyAvailable - reserve;
        
        if (availableForSpawning >= cost) {
            let level = body.length;
            let rolePrefix = role.slice(0,3).toUpperCase();
            let sourceInfo = memory.sIdx !== undefined ? `S${memory.sIdx}` : 'S?';
            let name = `${rolePrefix}_L${level}_${sourceInfo}_${Game.time % 1000}`;
            
            let result = spawn.spawnCreep(body, name, { memory });
            if (result === OK) {
                console.log(`[SPAWN] ${name} (${role}) with ${level} parts`);
                return true;
            }
        }
        return false;
    };

    // EMERGENCY MODE - Only spawn miners and haulers
    if (emergencyMode) {
        console.log(`[EMERGENCY] Critical: Miners ${minerCount}/${targetMiners}, Haulers ${haulerCount}/${targetHaulers}`);
        
        // First, ensure each source has a miner
        for (let i = 0; i < sources.length; i++) {
            let minersAtSource = _.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length;
            if (minersAtSource < 1) {
                if (trySpawn('miner', { role: 'miner', sIdx: i })) return;
            }
        }
        
        // Then ensure each miner has a hauler
        let miners = _.filter(creeps, c => c.memory.role === 'miner');
        for (let miner of miners) {
            let haulersForMiner = _.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length;
            if (haulersForMiner < 1) {
                if (trySpawn('hauler', { role: 'hauler', minerId: miner.name, sIdx: miner.memory.sIdx })) return;
            }
        }
        
        return;
    }

    // RCL 1 - Simple harvesters
    if (rcl === 1) {
        if (harvesterCount < targetHarvesters) {
            let srcCounts = sources.map((s, idx) => _.filter(creeps, c => c.memory.sIdx === idx).length);
            let bestSrcIdx = srcCounts.indexOf(Math.min(...srcCounts));
            if (trySpawn('harvester', { role: 'harvester', sIdx: bestSrcIdx })) return;
        }
        if (upgraderCount < targetUpgraders) {
            if (trySpawn('upgrader', { role: 'upgrader', sIdx: 0 })) return;
        }
        if (builderCount < targetBuilders) {
            if (trySpawn('builder', { role: 'builder', sIdx: 0 })) return;
        }
        return;
    }

    // RCL 2+ - Strict priority order
    
    // PRIORITY 1: Ensure each source has its required miners
    for (let i = 0; i < sources.length; i++) {
        let minersAtSource = _.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length;
        if (minersAtSource < config.miners) {
            if (trySpawn('miner', { role: 'miner', sIdx: i })) return;
        }
    }

    // PRIORITY 2: Ensure each miner has a hauler
    let miners = _.filter(creeps, c => c.memory.role === 'miner');
    for (let miner of miners) {
        let haulersForMiner = _.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length;
        if (haulersForMiner < 1) {
            if (trySpawn('hauler', { role: 'hauler', minerId: miner.name, sIdx: miner.memory.sIdx })) return;
        }
    }

    // Check if we have full miner/hauler coverage
    let minersFull = true;
    for (let i = 0; i < sources.length; i++) {
        if (_.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length < config.miners) {
            minersFull = false;
            break;
        }
    }
    
    let haulersFull = true;
    for (let miner of miners) {
        if (_.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length < 1) {
            haulersFull = false;
            break;
        }
    }

    // If miners or haulers are not full, stop here
    if (!minersFull || !haulersFull) {
        if (!minersFull) console.log(`[SPAWN] Need more miners (${minerCount}/${targetMiners})`);
        if (!haulersFull) console.log(`[SPAWN] Need more haulers (${haulerCount}/${targetHaulers})`);
        return;
    }

    // PRIORITY 3: Builders (only after miners/haulers are full)
    if (builderCount < targetBuilders) {
        if (trySpawn('builder', { role: 'builder', sIdx: 0 })) return;
    }

    // PRIORITY 4: Upgraders
    if (upgraderCount < targetUpgraders) {
        if (trySpawn('upgrader', { role: 'upgrader', sIdx: 0 })) return;
    }

    // PRIORITY 5: Repairers
    if (repairerCount < targetRepairers) {
        if (trySpawn('repairer', { role: 'repairer', sIdx: 0 })) return;
    }

    // PRIORITY 6: Fighters (only at RCL 3+)
    if (rcl >= 3 && fighterCount < targetFighters) {
        if (trySpawn('fighter', { role: 'fighter', patrolling: true, sIdx: 0 })) return;
    }

    // Auto-upgrade weak creeps when energy is full
    if (Memory.energyFullTicks >= 50 && !emergencyMode) {
        if (creeps.length > 0) {
            let weakest = _.min(creeps, c => c.body.length);
            if (weakest && weakest.body.length < getBestBody(weakest.memory.role, room).length) {
                console.log(`[UPGRADE] Suiciding ${weakest.name} for better body`);
                weakest.suicide();
                Memory.energyFullTicks = 0;
                return;
            }
        }
    }
}

// ==========================================
// 5. ROLES (State Machines)
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
            // Get assigned source or fallback to any source
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
        } else { // TRANSFER
            // First priority: Fill spawn and extensions
            let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                              s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            
            if (dest) {
                if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#ffffff');
                announce(creep, '🚚');
            } else {
                // Drop energy near spawn
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
                console.log(`[MINER] ${creep.name} assigned to ${spotType} spot (${selectedSpot.x},${selectedSpot.y}) for source ${creep.memory.sIdx}`);
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
                if (Game.time % 10 === 0) {
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
                console.log(`[HAULER] ${creep.name} parked at (${bestParkSpot.x},${bestParkSpot.y})`);
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
                let dropped = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, { filter: r => r.resourceType === RESOURCE_ENERGY });
                if (dropped.length) {
                    let target = creep.pos.findClosestByPath(dropped);
                    if (target && creep.pickup(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ffff00');
                    announce(creep, '⬆️');
                } else if (creep.memory.parkPos) {
                    let pos = new RoomPosition(creep.memory.parkPos.x, creep.memory.parkPos.y, creep.room.name);
                    if (!creep.pos.isEqualTo(pos)) {
                        smartMove(creep, pos, '#888888');
                        announce(creep, '🅿️');
                    }
                }
            }
        } else { // DELIVER
            let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                              s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (dest) {
                if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#aaff00');
                announce(creep, '🚚');
            } else {
                let worker = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                    filter: c => (c.memory.role === 'upgrader' || c.memory.role === 'builder' || c.memory.role === 'repairer') &&
                                 c.store.getFreeCapacity() > 0
                });
                if (worker) {
                    if (creep.transfer(worker, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, worker, '#aaff00');
                    announce(creep, '🤝');
                } else if (roomMem.dropPos) {
                    let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
                    if (creep.pos.isEqualTo(pos)) {
                        creep.drop(RESOURCE_ENERGY);
                        announce(creep, '📦');
                    } else {
                        smartMove(creep, pos, '#aaff00');
                        announce(creep, '🚶 Drop');
                    }
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
        let enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemy) {
            if (creep.attack(enemy) === ERR_NOT_IN_RANGE) smartMove(creep, enemy, '#ff0000');
            announce(creep, '⚔️');
        } else {
            if (!creep.memory.patrolIndex) creep.memory.patrolIndex = 0;
            let spawn = Game.spawns['Spawn1'];
            let points = [
                new RoomPosition(spawn.pos.x + 5, spawn.pos.y + 5, spawn.room.name),
                new RoomPosition(spawn.pos.x - 5, spawn.pos.y + 5, spawn.room.name),
                new RoomPosition(spawn.pos.x - 5, spawn.pos.y - 5, spawn.room.name),
                new RoomPosition(spawn.pos.x + 5, spawn.pos.y - 5, spawn.room.name)
            ];
            let target = points[creep.memory.patrolIndex];
            if (creep.pos.isNearTo(target)) {
                creep.memory.patrolIndex = (creep.memory.patrolIndex + 1) % points.length;
            }
            smartMove(creep, target, '#ff00ff');
            announce(creep, '🚶');
        }
    }
};

// ==========================================
// 6. MAIN LOOP
// ==========================================
module.exports.loop = function () {
    for (let name in Memory.creeps) if (!Game.creeps[name]) delete Memory.creeps[name];

    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;

    let room = spawn.room;

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

    // Emergency harvesters - only if no miners and no harvesters
    if (room.controller.level >= 2 &&
        _.filter(Game.creeps, c => c.memory.role === 'miner').length === 0 &&
        _.filter(Game.creeps, c => c.memory.role === 'harvester').length === 0 &&
        room.energyAvailable >= 200) {
        
        // Spawn TWO emergency harvesters for different sources
        for (let i = 0; i < Math.min(2, room.find(FIND_SOURCES).length); i++) {
            let name = `HarvEm${i}_${Game.time}`;
            spawn.spawnCreep([WORK, CARRY, MOVE], name, { memory: { role: 'harvester', sIdx: i } });
            console.log(`[EMERGENCY] Spawned harvester ${name} for source ${i}`);
        }
    }

    autoBuild(room);
    runTowers(room);
    managePopulation(spawn);

    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        if (ROLES[creep.memory.role]) ROLES[creep.memory.role](creep, roomMem);
    }

    if (Game.time % 20 === 0) {
        console.log(`\n--- 📋 COLONY STATUS (Tick ${Game.time}) ---`);
        console.log(`RCL ${room.controller.level} | Energy ${room.energyAvailable}/${room.energyCapacityAvailable}`);
        let roles = ['harvester','miner','hauler','upgrader','builder','repairer','fighter'];
        roles.forEach(r => {
            let count = _.filter(Game.creeps, c => c.memory.role === r).length;
            console.log(` ${r}: ${count}`);
        });
        for (let name in Game.creeps) {
            let c = Game.creeps[name];
            console.log(` >> [${c.name}] ${c.memory.role} | Src:${c.memory.sIdx} | Energy:${c.store[RESOURCE_ENERGY]}/${c.store.getCapacity()}`);
        }
        console.log(`-------------------------------------------`);
    }
};