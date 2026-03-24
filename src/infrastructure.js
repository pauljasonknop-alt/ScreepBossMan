const { CONFIG } = require('./config');
const { getDropPoint } = require('./helpers');

function runTowers(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    
    if (towers.length === 0) return;
    
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    
    if (enemies.length > 0 && Game.time % 10 === 0) {
        console.log(`[ALERT] ${enemies.length} enemies detected in ${room.name}!`);
    }
    
    for (let tower of towers) {
        if (enemies.length > 0) {
            let target = tower.pos.findClosestByRange(enemies);
            
            if (target) {
                let result = tower.attack(target);
                if (result === OK) {
                    console.log(`[TOWER] 🔥 ATTACKING ${target.owner.username} (${target.pos.x},${target.pos.y}) - Health: ${target.hits}/${target.hitsMax}`);
                }
                continue;
            }
        }
        
        let damagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
            filter: c => c.hits < c.hitsMax
        });
        if (damagedCreep && tower.store[RESOURCE_ENERGY] > 500) {
            tower.heal(damagedCreep);
            continue;
        }

        if (tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve + 200) {
            let priority = [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER];
            let damagedStructure = null;
            
            for (let type of priority) {
                damagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: s => s.structureType === type && s.hits < s.hitsMax * 0.5
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

    if (rcl === 1) return;
    
    if (rcl >= 2) {
        room.find(FIND_SOURCES).forEach(src => {
            let adj = [[-1,0],[1,0],[0,-1],[0,1]];
            let containerPlaced = false;
            
            for (let d of adj) {
                let x = src.pos.x + d[0], y = src.pos.y + d[1];
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
                
                let structures = src.pos.findInRange(FIND_STRUCTURES, 2, { filter: { structureType: STRUCTURE_CONTAINER } });
                if (structures.length > 0) { containerPlaced = true; break; }
                
                let sites = src.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: { structureType: STRUCTURE_CONTAINER } });
                if (sites.length > 0) { containerPlaced = true; break; }
                
                let result = room.createConstructionSite(x, y, STRUCTURE_CONTAINER);
                if (result === OK) {
                    console.log(`[BUILD] Placing container at (${x},${y}) for source`);
                    containerPlaced = true;
                    break;
                }
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
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestSpot = pos;
                    }
                }
            }
            
            if (bestSpot) {
                let result = room.createConstructionSite(bestSpot.x, bestSpot.y, STRUCTURE_TOWER);
                if (result === OK) console.log(`[BUILD] Placing tower at (${bestSpot.x},${bestSpot.y})`);
            }
        }
    }
    
    if (rcl >= 6) {
        let labs = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LAB } });
        if (labs.length < 3) {
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
    
    let mineral = room.find(FIND_MINERALS)[0];
    if (rcl >= 6 && mineral) {
        let extractors = mineral.pos.findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_EXTRACTOR } });
        if (extractors.length === 0) {
            let result = room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
            if (result === OK) console.log(`[BUILD] Placing extractor at mineral`);
        }
    }
}

module.exports = { runTowers, autoBuild };