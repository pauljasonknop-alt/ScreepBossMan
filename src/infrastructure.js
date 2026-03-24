const { CONFIG } = require('./config');
const { getDropPoint } = require('./helpers');

function runTowers(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    
    if (towers.length === 0) return;
    
    // Find ALL enemies in the room
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    let myCreeps = room.find(FIND_MY_CREEPS);
    
    // Log enemies for debugging
    if (enemies.length > 0 && Game.time % 10 === 0) {
        console.log(`[ALERT] ${enemies.length} enemies detected in ${room.name}!`);
        for (let enemy of enemies) {
            console.log(`   - ${enemy.owner.username} at (${enemy.pos.x},${enemy.pos.y}) - Health: ${enemy.hits}/${enemy.hitsMax}`);
        }
    }
    
    for (let tower of towers) {
        // ==========================================
        // PRIORITY 1: ATTACK ENEMIES - THIS RUNS EVERY TICK
        // ==========================================
        if (enemies.length > 0) {
            // Find the most threatening enemy
            let target = null;
            let bestScore = -Infinity;
            
            for (let enemy of enemies) {
                let score = 0;
                let range = tower.pos.getRangeTo(enemy);
                
                // Closer enemies are higher priority
                score += (20 - range) * 10;
                
                // Lower health enemies are higher priority (finish them off)
                score += (enemy.hitsMax - enemy.hits) / enemy.hitsMax * 50;
                
                // Attack type enemies (with ATTACK parts) are higher priority
                if (enemy.body.some(p => p.type === ATTACK)) score += 100;
                
                // Ranged attack enemies are also high priority
                if (enemy.body.some(p => p.type === RANGED_ATTACK)) score += 80;
                
                // Healers are high priority (take them out first)
                if (enemy.body.some(p => p.type === HEAL)) score += 150;
                
                if (score > bestScore) {
                    bestScore = score;
                    target = enemy;
                }
            }
            
            if (target) {
                let result = tower.attack(target);
                if (result === OK) {
                    console.log(`[TOWER] 🔥 ATTACKING ${target.owner.username} (${target.pos.x},${target.pos.y}) - Health: ${target.hits}/${target.hitsMax}`);
                } else if (result === ERR_NOT_IN_RANGE) {
                    console.log(`[TOWER] ⚠️ Enemy at (${target.pos.x},${target.pos.y}) out of range!`);
                }
                continue; // Skip healing/repairing while attacking
            }
        }
        
        // ==========================================
        // PRIORITY 2: HEAL DAMAGED FRIENDLY CREEPS
        // ==========================================
        let damagedCreeps = _.filter(myCreeps, c => c.hits < c.hitsMax);
        
        if (damagedCreeps.length > 0 && tower.store[RESOURCE_ENERGY] > 300) {
            // Sort by lowest health first
            damagedCreeps.sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax);
            
            // Prioritize creeps with low health
            let target = damagedCreeps[0];
            let result = tower.heal(target);
            
            if (result === OK) {
                if (Game.time % 10 === 0) {
                    console.log(`[TOWER] 💚 Healing ${target.name} - Health: ${target.hits}/${target.hitsMax}`);
                }
                continue;
            } else if (result === ERR_NOT_IN_RANGE) {
                // Move closer to heal if needed (towers don't move, but we can log)
                if (Game.time % 20 === 0) {
                    console.log(`[TOWER] ⚠️ ${target.name} out of heal range at (${target.pos.x},${target.pos.y})`);
                }
            }
        }
        
        // ==========================================
        // PRIORITY 3: REPAIR STRUCTURES
        // ==========================================
        // Only repair if we have excess energy (keep at least 300 for defense)
        if (tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve + 300) {
            
            // Define repair priority with thresholds
            let repairPriority = [
                { type: STRUCTURE_RAMPART, threshold: 0.8, desc: '🛡️ Rampart' },      // Keep ramparts at 80%+
                { type: STRUCTURE_TOWER, threshold: 0.7, desc: '🗼 Tower' },           // Keep towers at 70%+
                { type: STRUCTURE_SPAWN, threshold: 0.7, desc: '🏭 Spawn' },           // Keep spawn at 70%+
                { type: STRUCTURE_EXTENSION, threshold: 0.6, desc: '🔌 Extension' },   // Keep extensions at 60%+
                { type: STRUCTURE_CONTAINER, threshold: 0.5, desc: '📦 Container' },   // Keep containers at 50%+
                { type: STRUCTURE_ROAD, threshold: 0.4, desc: '🛣️ Road' },             // Keep roads at 40%+
                { type: STRUCTURE_WALL, threshold: 0.3, desc: '🧱 Wall' },             // Keep walls at 30%+ (they have high HP)
                { type: STRUCTURE_STORAGE, threshold: 0.5, desc: '🏚️ Storage' },       // Keep storage at 50%+
                { type: STRUCTURE_LAB, threshold: 0.7, desc: '🧪 Lab' }                // Keep labs at 70%+
            ];
            
            let targetStructure = null;
            let targetType = null;
            
            for (let priority of repairPriority) {
                // Find the closest structure of this type that needs repair
                let structures = room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType === priority.type && 
                                 s.hits < s.hitsMax * priority.threshold
                });
                
                if (structures.length > 0) {
                    // For walls, prioritize the ones with lowest health
                    if (priority.type === STRUCTURE_WALL) {
                        structures.sort((a, b) => a.hits - b.hits);
                    }
                    // For others, find the closest to tower
                    targetStructure = tower.pos.findClosestByPath(structures);
                    if (targetStructure) {
                        targetType = priority;
                        break;
                    }
                }
            }
            
            // Also check for any critically damaged structures (below 30%)
            if (!targetStructure) {
                let criticallyDamaged = room.find(FIND_STRUCTURES, {
                    filter: s => s.hits < s.hitsMax * 0.3 && 
                                 s.structureType !== STRUCTURE_WALL && 
                                 s.structureType !== STRUCTURE_RAMPART
                });
                if (criticallyDamaged.length > 0) {
                    targetStructure = tower.pos.findClosestByPath(criticallyDamaged);
                    if (targetStructure) {
                        console.log(`[TOWER] 🔴 CRITICAL: ${targetStructure.structureType} at ${Math.floor(targetStructure.hits / targetStructure.hitsMax * 100)}%`);
                    }
                }
            }
            
            if (targetStructure) {
                let result = tower.repair(targetStructure);
                if (result === OK) {
                    let repairPercent = Math.floor(targetStructure.hits / targetStructure.hitsMax * 100);
                    if (Game.time % 20 === 0) {
                        let typeDesc = targetType ? targetType.desc : targetStructure.structureType;
                        console.log(`[TOWER] 🔧 Repairing ${typeDesc} at (${targetStructure.pos.x},${targetStructure.pos.y}) - ${repairPercent}%`);
                    }
                } else if (result === ERR_NOT_IN_RANGE) {
                    if (Game.time % 30 === 0) {
                        console.log(`[TOWER] ⚠️ Structure at (${targetStructure.pos.x},${targetStructure.pos.y}) out of repair range!`);
                    }
                }
                continue;
            }
        }
        
        // ==========================================
        // PRIORITY 4: BOOST NEARBY CREEPS (if we have extra energy)
        // ==========================================
        // Note: Towers cannot boost, but this is a placeholder for future enhancement
        // If you have power creeps or boost structures, add logic here
        
        // ==========================================
        // PRIORITY 5: IDLE - Do nothing (save energy)
        // ==========================================
        // Tower is idle when no enemies, no damaged creeps, no structures to repair
        if (Game.time % 100 === 0 && tower.store[RESOURCE_ENERGY] > 500) {
            // Log idle status occasionally
            console.log(`[TOWER] ⏳ Idle at (${tower.pos.x},${tower.pos.y}) - Energy: ${tower.store[RESOURCE_ENERGY]}/${tower.store.getCapacity()}`);
        }
    }
}

// ==========================================
// TOWER HEALTH MONITOR - Called from main loop
// ==========================================
function monitorTowerHealth(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    
    if (towers.length === 0) return;
    
    for (let tower of towers) {
        let energyPercent = Math.floor(tower.store[RESOURCE_ENERGY] / tower.store.getCapacity() * 100);
        let healthPercent = Math.floor(tower.hits / tower.hitsMax * 100);
        
        // Visual display above tower
        room.visual.text(
            `🗼 ${energyPercent}% | ❤️ ${healthPercent}%`,
            tower.pos.x,
            tower.pos.y - 0.8,
            { color: energyPercent > 50 ? '#00ff00' : (energyPercent > 25 ? '#ffff00' : '#ff0000'), font: 0.5 }
        );
        
        // Alert if tower is low on energy
        if (energyPercent < 25 && Game.time % 50 === 0) {
            console.log(`[TOWER] ⚠️ Tower at (${tower.pos.x},${tower.pos.y}) is low on energy! ${energyPercent}%`);
        }
        
        // Alert if tower is damaged
        if (healthPercent < 50 && Game.time % 50 === 0) {
            console.log(`[TOWER] ⚠️ Tower at (${tower.pos.x},${tower.pos.y}) is damaged! ${healthPercent}%`);
        }
    }
}

// ==========================================
// EMERGENCY TOWER DEFENSE - For when enemies are near
// ==========================================
function emergencyTowerDefense(room, spawn) {
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    
    if (enemies.length === 0 || towers.length === 0) return;
    
    // Check if any enemy is within 10 tiles of spawn
    let spawnEnemy = _.find(enemies, e => e.pos.getRangeTo(spawn) <= 10);
    
    if (spawnEnemy && Game.time % 10 === 0) {
        console.log(`[EMERGENCY] ⚠️ Enemy ${spawnEnemy.owner.username} is near spawn!`);
        
        // Check if we need to allocate more energy to towers
        for (let tower of towers) {
            if (tower.store[RESOURCE_ENERGY] < 500) {
                // Find a hauler to prioritize this tower
                let haulers = room.find(FIND_MY_CREEPS, {
                    filter: c => c.memory.role === 'hauler' && c.store[RESOURCE_ENERGY] > 0
                });
                
                if (haulers.length > 0) {
                    // Tell the nearest hauler to deliver to this tower
                    let nearestHauler = spawnEnemy.pos.findClosestByPath(haulers);
                    if (nearestHauler && nearestHauler.memory.emergencyTower !== tower.id) {
                        nearestHauler.memory.emergencyTower = tower.id;
                        console.log(`[EMERGENCY] 🚚 Alerting hauler ${nearestHauler.name} to supply tower at (${tower.pos.x},${tower.pos.y})`);
                    }
                }
            }
        }
    }
}

module.exports = { runTowers, autoBuild, monitorTowerHealth, emergencyTowerDefense };