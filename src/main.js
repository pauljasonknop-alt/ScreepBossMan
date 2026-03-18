/**
 * SCREEPS AUTO-BOT v4.0 - COMPLETE EDITION
 * Full-featured bot with RCL progression, auto-scaling, and defense
 */

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const CONFIG = {
    // RCL-specific configurations
    rcl: {
        1: { miners: 2, haulers: 0, builders: 2, upgraders: 1, transitionAt: 0.3 },
        2: { miners: 2, haulers: 2, builders: 2, upgraders: 2, transitionAt: 0.3 },
        3: { miners: 2, haulers: 2, builders: 3, upgraders: 2 },
        4: { miners: 3, haulers: 3, builders: 3, upgraders: 3 },
        5: { miners: 3, haulers: 3, builders: 4, upgraders: 3 },
        6: { miners: 4, haulers: 4, builders: 4, upgraders: 4 },
        7: { miners: 4, haulers: 4, builders: 5, upgraders: 4 },
        8: { miners: 5, haulers: 5, builders: 5, upgraders: 5 }
    },
    
    // Body part templates
    bodyParts: {
        harvester: [WORK, CARRY, MOVE],
        miner: [WORK, WORK, WORK, WORK, WORK, MOVE], // 550 energy
        hauler: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], // 400 energy
        builder: [WORK, CARRY, CARRY, MOVE, MOVE], // 400 energy
        upgrader: [WORK, WORK, CARRY, CARRY, MOVE, MOVE], // 500 energy
        fighter: [TOUGH, TOUGH, MOVE, MOVE, ATTACK, ATTACK] // 260 energy
    },
    
    // Minimum energy for advanced bodies
    minEnergyForAdvanced: 500,
    
    // Patrol positions (relative to spawn)
    patrolPoints: [
        { x: 5, y: 5 },
        { x: -5, y: 5 },
        { x: -5, y: -5 },
        { x: 5, y: -5 }
    ],
    
    // Stall detection
    stallThreshold: 4,
    
    // Construction limits per RCL
    maxExtensions: {
        1: 0,
        2: 5,
        3: 10,
        4: 20,
        5: 30,
        6: 40,
        7: 50,
        8: 60
    },
    
    // Tower settings
    tower: {
        healThreshold: 5000,
        repairThreshold: 0.5,
        attackRange: 20
    }
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Get optimal body parts based on available energy
function getOptimalBody(role, room) {
    let available = room.energyCapacityAvailable;
    let baseParts = CONFIG.bodyParts[role];
    
    // If below threshold, use basic parts
    if (available < CONFIG.minEnergyForAdvanced) {
        return baseParts;
    }
    
    // Scale up based on available energy
    let body = [];
    let cost = 0;
    let partCost = _.sum(baseParts, p => BODYPART_COST[p]);
    
    while (cost + partCost <= available && body.length < 50) {
        body.push(...baseParts);
        cost += partCost;
    }
    
    return body;
}

// Get dump position (near spawn)
function getDumpPos(spawn) {
    return new RoomPosition(
        spawn.pos.x + 1,
        spawn.pos.y + 1,
        spawn.room.name
    );
}

// Check if position is inside base perimeter
function isInBase(pos, spawn) {
    let range = 10;
    return Math.abs(pos.x - spawn.pos.x) <= range && 
           Math.abs(pos.y - spawn.pos.y) <= range;
}

// Stall detection
function checkStall(creep) {
    if (creep.memory.role === 'miner' || creep.memory.role === 'fighter') return;
    
    if (!creep.memory.lastPos) {
        creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y };
        creep.memory.stuckTicks = 0;
        return;
    }
    
    if (creep.pos.x === creep.memory.lastPos.x && 
        creep.pos.y === creep.memory.lastPos.y) {
        creep.memory.stuckTicks = (creep.memory.stuckTicks || 0) + 1;
        
        if (creep.memory.stuckTicks >= CONFIG.stallThreshold) {
            console.log(`[STALL] ${creep.name} stuck at (${creep.pos.x},${creep.pos.y}) for ${creep.memory.stuckTicks} ticks`);
            creep.say('STALLED!');
            
            // Try to move randomly to unstuck
            let dir = Math.floor(Math.random() * 8) + 1;
            creep.move(dir);
        }
    } else {
        creep.memory.lastPos = { x: creep.pos.x, y: creep.pos.y };
        creep.memory.stuckTicks = 0;
    }
}

// Find open mining spot
function findOpenMiningSpot(source, miners) {
    let spots = [];
    let terrain = source.room.getTerrain();
    
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            let x = source.pos.x + dx;
            let y = source.pos.y + dy;
            
            // Check if position is valid and not a wall
            if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                let occupied = miners.some(m => m.pos.x === x && m.pos.y === y);
                if (!occupied) {
                    spots.push(new RoomPosition(x, y, source.room.name));
                }
            }
        }
    }
    
    // Sort by distance to spawn
    let spawn = Game.spawns['Spawn1'];
    return spots.sort((a, b) => 
        spawn.pos.getRangeTo(a) - spawn.pos.getRangeTo(b)
    )[0];
}

// Build extensions gradually
function manageConstruction(room) {
    if (Game.time % 20 !== 0) return;
    
    let sites = room.find(FIND_CONSTRUCTION_SITES);
    let maxExt = CONFIG.maxExtensions[room.controller.level] || 0;
    let extensions = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION
    });
    
    // If we haven't reached max and no sites, build new extension
    if (extensions.length < maxExt && sites.length === 0) {
        let spawn = Game.spawns['Spawn1'];
        let positions = [
            { x: spawn.pos.x + 2, y: spawn.pos.y },
            { x: spawn.pos.x - 2, y: spawn.pos.y },
            { x: spawn.pos.x, y: spawn.pos.y + 2 },
            { x: spawn.pos.x, y: spawn.pos.y - 2 }
        ];
        
        for (let pos of positions) {
            let buildPos = new RoomPosition(pos.x, pos.y, room.name);
            if (buildPos.lookFor(LOOK_STRUCTURES).length === 0 && 
                buildPos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                room.createConstructionSite(buildPos, STRUCTURE_EXTENSION);
                console.log(`[CONSTRUCT] Building new extension at ${pos.x},${pos.y}`);
                break;
            }
        }
    }
}

// Tower logic
function runTowers(room) {
    let towers = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_TOWER
    });
    
    for (let tower of towers) {
        // Scan for enemies every 10 ticks
        if (Game.time % 10 === 0) {
            let enemies = room.find(FIND_HOSTILE_CREEPS);
            if (enemies.length > 0) {
                // Attack closest enemy
                let target = tower.pos.findClosestByRange(enemies);
                tower.attack(target);
                console.log(`[TOWER] Attacking enemy at ${target.pos.x},${target.pos.y}`);
                continue;
            }
        }
        
        // Heal damaged creeps
        let damagedCreep = room.find(FIND_MY_CREEPS, {
            filter: c => c.hits < c.hitsMax * CONFIG.tower.healThreshold / 10000
        })[0];
        
        if (damagedCreep) {
            tower.heal(damagedCreep);
            continue;
        }
        
        // Repair structures below threshold
        let damagedStructure = room.find(FIND_STRUCTURES, {
            filter: s => s.hits < s.hitsMax * CONFIG.tower.repairThreshold && 
                        s.structureType !== STRUCTURE_WALL && 
                        s.structureType !== STRUCTURE_RAMPART
        })[0];
        
        if (damagedStructure) {
            tower.repair(damagedStructure);
        }
    }
}

// ==========================================
// 3. ROLE LOGIC
// ==========================================

const roles = {
    harvester: function(creep, spawn) {
        if (creep.store.getFreeCapacity() > 0) {
            creep.memory.intent = "Harvesting";
            let source = creep.pos.findClosestByPath(FIND_SOURCES);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            }
        } else {
            creep.memory.intent = "Depositing";
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || 
                             s.structureType === STRUCTURE_EXTENSION) && 
                            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                // Drop near controller if nowhere else
                let dumpPos = getDumpPos(spawn);
                if (creep.pos.isEqualTo(dumpPos)) {
                    creep.drop(RESOURCE_ENERGY);
                } else {
                    creep.moveTo(dumpPos, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            }
        }
    },
    
    miner: function(creep, spawn) {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        
        // Build container if not present
        let container = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        })[0];
        
        if (!container) {
            let site = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            })[0];
            
            if (!site && creep.pos.isNearTo(source)) {
                creep.memory.intent = "Building Container";
                creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
                creep.say('Build Box');
            }
        }
        
        // Move to optimal position
        if (!creep.memory.miningPos) {
            let miners = _.filter(Game.creeps, c => 
                c.memory.role === 'miner' && c.memory.sourceId === source.id
            );
            let spot = findOpenMiningSpot(source, miners);
            if (spot) {
                creep.memory.miningPos = { x: spot.x, y: spot.y };
            }
        }
        
        if (creep.memory.miningPos) {
            let targetPos = new RoomPosition(
                creep.memory.miningPos.x,
                creep.memory.miningPos.y,
                creep.room.name
            );
            
            if (!creep.pos.isEqualTo(targetPos)) {
                creep.memory.intent = "Moving to mining spot";
                creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#00ff00' } });
            } else {
                creep.memory.intent = "Mining";
                creep.harvest(source);
            }
        } else {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#00ff00' } });
            }
        }
    },
    
    hauler: function(creep, spawn) {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        
        if (creep.store.getFreeCapacity() > 0) {
            creep.memory.intent = "Collecting energy";
            let container = source.pos.findInRange(FIND_STRUCTURES, 2, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && 
                            s.store[RESOURCE_ENERGY] > 0
            })[0];
            
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, { visualizePathStyle: { stroke: '#00aaff' } });
                }
            } else {
                // Pick up dropped energy
                let dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 5, {
                    filter: r => r.amount > 50
                })[0];
                
                if (dropped) {
                    if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(dropped, { visualizePathStyle: { stroke: '#00aaff' } });
                    }
                }
            }
        } else {
            creep.memory.intent = "Distributing energy";
            
            // Priority 1: Fill spawn/extensions
            let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || 
                             s.structureType === STRUCTURE_EXTENSION) && 
                            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#aaff00' } });
                }
                return;
            }
            
            // Priority 2: Feed builders/upgraders
            let worker = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
                filter: c => (c.memory.role === 'builder' || c.memory.role === 'upgrader') &&
                            c.store.getFreeCapacity() > 0
            });
            
            if (worker) {
                if (creep.transfer(worker, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(worker, { visualizePathStyle: { stroke: '#aaff00' } });
                }
                return;
            }
            
            // Priority 3: Drop near controller
            creep.memory.intent = "Dumping near controller";
            let dumpPos = new RoomPosition(
                spawn.room.controller.pos.x + 2,
                spawn.room.controller.pos.y + 2,
                spawn.room.name
            );
            
            if (creep.pos.isEqualTo(dumpPos)) {
                creep.drop(RESOURCE_ENERGY);
            } else {
                creep.moveTo(dumpPos, { visualizePathStyle: { stroke: '#aaff00' } });
            }
        }
    },
    
    builder: function(creep, spawn) {
        if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.intent = "Getting energy";
            
            // Check dropped energy first
            let dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                filter: r => r.amount > 50
            });
            
            if (dropped) {
                if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(dropped, { visualizePathStyle: { stroke: '#ffff00' } });
                }
                return;
            }
            
            // Check containers
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && 
                            s.store[RESOURCE_ENERGY] > 0
            });
            
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, { visualizePathStyle: { stroke: '#ffff00' } });
                }
            }
        } else {
            let sites = creep.room.find(FIND_CONSTRUCTION_SITES);
            
            if (sites.length > 0) {
                creep.memory.intent = "Building";
                let target = creep.pos.findClosestByPath(sites);
                if (target) {
                    if (creep.build(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                }
            } else {
                creep.memory.intent = "Upgrading (no sites)";
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, { 
                        visualizePathStyle: { stroke: '#ffffff' } 
                    });
                }
            }
        }
    },
    
    upgrader: function(creep, spawn) {
        if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.intent = "Getting energy";
            
            // Check dropped energy near controller
            let dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50
            });
            
            if (dropped) {
                if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(dropped, { visualizePathStyle: { stroke: '#00ffff' } });
                }
                return;
            }
            
            // Check containers
            let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && 
                            s.store[RESOURCE_ENERGY] > 0
            });
            
            if (container) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, { visualizePathStyle: { stroke: '#00ffff' } });
                }
            }
        } else {
            creep.memory.intent = "Upgrading";
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { 
                    visualizePathStyle: { stroke: '#ffffff' } 
                });
            }
        }
    },
    
    fighter: function(creep, spawn) {
        // Scan for enemies every 10 ticks
        if (Game.time % 10 === 0) {
            let enemies = creep.room.find(FIND_HOSTILE_CREEPS);
            
            if (enemies.length > 0) {
                creep.memory.patrolling = false;
                creep.memory.intent = "ATTACKING!";
                
                let target = creep.pos.findClosestByRange(enemies);
                if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { 
                        visualizePathStyle: { stroke: '#ff0000' } 
                    });
                }
                return;
            } else {
                creep.memory.patrolling = true;
            }
        }
        
        // Patrol mode
        if (creep.memory.patrolling) {
            if (!creep.memory.patrolIndex) {
                creep.memory.patrolIndex = 0;
            }
            
            creep.memory.intent = "Patrolling";
            let patrolPoint = CONFIG.patrolPoints[creep.memory.patrolIndex];
            let targetPos = new RoomPosition(
                spawn.pos.x + patrolPoint.x,
                spawn.pos.y + patrolPoint.y,
                spawn.room.name
            );
            
            if (creep.pos.isNearTo(targetPos)) {
                creep.memory.patrolIndex = (creep.memory.patrolIndex + 1) % CONFIG.patrolPoints.length;
            }
            
            creep.moveTo(targetPos, { 
                visualizePathStyle: { stroke: '#ff00ff' } 
            });
        }
    }
};

// ==========================================
// 4. POPULATION MANAGEMENT
// ==========================================

function managePopulation(spawn, room) {
    let rcl = room.controller.level;
    let sources = room.find(FIND_SOURCES);
    let progress = room.controller.progress / room.controller.progressTotal;
    
    // Get current config based on RCL
    let config = CONFIG.rcl[rcl] || CONFIG.rcl[1];
    
    // Special handling for RCL 1-2 transition
    if (rcl === 1 && progress >= config.transitionAt) {
        config = CONFIG.rcl[2]; // Switch to RCL 2 config
    }
    
    // Count creeps by role
    let counts = {
        harvester: _.filter(Game.creeps, c => c.memory.role === 'harvester').length,
        miner: _.filter(Game.creeps, c => c.memory.role === 'miner').length,
        hauler: _.filter(Game.creeps, c => c.memory.role === 'hauler').length,
        builder: _.filter(Game.creeps, c => c.memory.role === 'builder').length,
        upgrader: _.filter(Game.creeps, c => c.memory.role === 'upgrader').length,
        fighter: _.filter(Game.creeps, c => c.memory.role === 'fighter').length
    };
    
    // Phase 1: RCL 1 - Use harvesters
    if (rcl === 1 || (rcl === 2 && progress < 0.3 && counts.miner === 0)) {
        // Spawn harvesters per source
        sources.forEach((source, i) => {
            let harvestersAtSource = _.filter(Game.creeps, c => 
                c.memory.role === 'harvester' && 
                c.memory.sourceId === source.id
            ).length;
            
            if (harvestersAtSource < 2 && !spawn.spawning) {
                let name = `Harv${i}_${Game.time}`;
                spawn.spawnCreep(
                    [WORK, CARRY, MOVE],
                    name,
                    { memory: { role: 'harvester', sourceId: source.id } }
                );
                console.log(`[SPAWN] Harvester ${name} for source ${i}`);
            }
        });
        
        // Spawn builders and upgraders
        if (counts.builder < config.builders && !spawn.spawning) {
            let name = `Builder_${Game.time}`;
            spawn.spawnCreep(
                [WORK, CARRY, MOVE],
                name,
                { memory: { role: 'builder' } }
            );
            console.log(`[SPAWN] Builder ${name}`);
        }
        
        if (counts.upgrader < config.upgraders && !spawn.spawning) {
            let name = `Upgrader_${Game.time}`;
            spawn.spawnCreep(
                [WORK, CARRY, MOVE],
                name,
                { memory: { role: 'upgrader' } }
            );
            console.log(`[SPAWN] Upgrader ${name}`);
        }
    }
    
    // Phase 2: RCL 2+ - Use miners and haulers
    else {
        // Spawn miners
        sources.forEach((source, i) => {
            let minersAtSource = _.filter(Game.creeps, c => 
                c.memory.role === 'miner' && 
                c.memory.sourceId === source.id
            ).length;
            
            if (minersAtSource < config.miners && !spawn.spawning) {
                let body = getOptimalBody('miner', room);
                let name = `Miner${i}_${Game.time}`;
                spawn.spawnCreep(
                    body,
                    name,
                    { memory: { role: 'miner', sourceId: source.id } }
                );
                console.log(`[SPAWN] Miner ${name} with ${body.length} parts`);
            }
        });
        
        // Spawn haulers
        sources.forEach((source, i) => {
            let haulersAtSource = _.filter(Game.creeps, c => 
                c.memory.role === 'hauler' && 
                c.memory.sourceId === source.id
            ).length;
            
            if (haulersAtSource < config.haulers && !spawn.spawning) {
                let body = getOptimalBody('hauler', room);
                let name = `Hauler${i}_${Game.time}`;
                spawn.spawnCreep(
                    body,
                    name,
                    { memory: { role: 'hauler', sourceId: source.id } }
                );
                console.log(`[SPAWN] Hauler ${name} with ${body.length} parts`);
            }
        });
        
        // Spawn builders
        if (counts.builder < config.builders && !spawn.spawning) {
            let body = getOptimalBody('builder', room);
            let name = `Builder_${Game.time}`;
            spawn.spawnCreep(
                body,
                name,
                { memory: { role: 'builder' } }
            );
            console.log(`[SPAWN] Builder ${name} with ${body.length} parts`);
        }
        
        // Spawn upgraders
        if (counts.upgrader < config.upgraders && !spawn.spawning) {
            let body = getOptimalBody('upgrader', room);
            let name = `Upgrader_${Game.time}`;
            spawn.spawnCreep(
                body,
                name,
                { memory: { role: 'upgrader' } }
            );
            console.log(`[SPAWN] Upgrader ${name} with ${body.length} parts`);
        }
        
        // Spawn fighters if tower exists
        let tower = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        })[0];
        
        if (tower && counts.fighter < 2 && !spawn.spawning) {
            let name = `Fighter_${Game.time}`;
            spawn.spawnCreep(
                CONFIG.bodyParts.fighter,
                name,
                { memory: { role: 'fighter', patrolling: true } }
            );
            console.log(`[SPAWN] Fighter ${name}`);
        }
    }
    
    // Auto-upgrade: Replace low-level creeps when base is full
    if (room.energyAvailable === room.energyCapacityAvailable && 
        room.energyCapacityAvailable >= CONFIG.minEnergyForAdvanced) {
        
        let lowLevelCreep = _.find(Game.creeps, c => 
            (c.memory.role === 'hauler' || c.memory.role === 'builder' || 
             c.memory.role === 'upgrader') &&
            c.body.length < getOptimalBody(c.memory.role, room).length
        );
        
        if (lowLevelCreep) {
            console.log(`[PURGE] Suiciding ${lowLevelCreep.name} for upgrade`);
            lowLevelCreep.suicide();
        }
    }
}

// ==========================================
// 5. MAIN LOOP
// ==========================================

module.exports.loop = function() {
    // Clean up dead creeps
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            console.log(`[CLEANUP] Removing memory of dead creep: ${name}`);
            delete Memory.creeps[name];
        }
    }
    
    let spawn = Game.spawns['Spawn1'];
    if (!spawn) {
        console.log('No spawn found!');
        return;
    }
    
    let room = spawn.room;
    
    // Manage population
    managePopulation(spawn, room);
    
    // Manage construction
    manageConstruction(room);
    
    // Run towers
    runTowers(room);
    
    // Run all creeps
    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        
        // Check for stall
        checkStall(creep);
        
        // Run role-specific logic
        if (roles[creep.memory.role]) {
            roles[creep.memory.role](creep, spawn);
        }
        
        // Add stall warning to creep if stuck
        if (creep.memory.stuckTicks >= CONFIG.stallThreshold) {
            creep.say('⚠️');
        }
    }
    
    // Console reporting every 20 ticks
    if (Game.time % 20 === 0) {
        let rcl = room.controller.level;
        let progress = Math.round((room.controller.progress / room.controller.progressTotal) * 100);
        let energyPercent = Math.round((room.energyAvailable / room.energyCapacityAvailable) * 100);
        
        console.log('\n' + '='.repeat(60));
        console.log(`📊 ROOM REPORT - Tick ${Game.time}`);
        console.log('='.repeat(60));
        
        console.log(`\n🏛️  CONTROLLER: Level ${rcl} | ${progress}% to next level`);
        console.log(`⚡ ENERGY: ${room.energyAvailable}/${room.energyCapacityAvailable} (${energyPercent}%)`);
        
        // Count creeps by role
        let roles = ['harvester', 'miner', 'hauler', 'builder', 'upgrader', 'fighter'];
        console.log('\n👥 CREEP POPULATION:');
        roles.forEach(role => {
            let creeps = _.filter(Game.creeps, c => c.memory.role === role);
            if (creeps.length > 0) {
                let avgLevel = Math.round(_.sum(creeps, c => c.body.length) / creeps.length);
                console.log(`  ${role.toUpperCase()}: ${creeps.length} (avg L${avgLevel})`);
            }
        });
        
        // Node status
        console.log('\n⛏️  NODE STATUS:');
        let sources = room.find(FIND_SOURCES);
        sources.forEach((source, i) => {
            let container = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            })[0];
            
            let miners = _.filter(Game.creeps, c => 
                c.memory.role === 'miner' && c.memory.sourceId === source.id
            ).length;
            
            let energy = container ? container.store[RESOURCE_ENERGY] : 0;
            console.log(`  Node ${i}: ${miners} miners | ${energy} stored`);
        });
        
        // Construction status
        let sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            console.log('\n🏗️  CONSTRUCTION SITES:');
            let byType = _.groupBy(sites, 'structureType');
            for (let type in byType) {
                console.log(`  ${type}: ${byType[type].length}`);
            }
        }
        
        // Enemy status
        let enemies = room.find(FIND_HOSTILE_CREEPS);
        if (enemies.length > 0) {
            console.log('\n⚠️  ENEMIES DETECTED!');
            enemies.forEach(e => {
                console.log(`  ${e.owner.username} at (${e.pos.x},${e.pos.y})`);
            });
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
    }
    
    // Global stats every 100 ticks
    if (Game.time % 100 === 0) {
        console.log(`\n🌍 GLOBAL: GCL ${Game.gcl.level} | CPU ${Game.cpu.getUsed().toFixed(2)}/${Game.cpu.limit}`);
    }
};