// ==========================================
// STABLE TOOANGEL-STYLE BOT
// Reliable from RCL 1 to RCL 8
// ==========================================

'use strict';

// ------------------------------
// CONFIGURATION
// ------------------------------
const CONFIG = {
    rcl: {
        1: { miners: 0, haulers: 0, universals: 1, upgraders: 0, builders: 0, repairers: 0, fighters: 0 },
        2: { miners: 1, haulers: 1, universals: 1, upgraders: 1, builders: 1, repairers: 1, fighters: 0 },
        3: { miners: 1, haulers: 1, universals: 1, upgraders: 2, builders: 2, repairers: 1, fighters: 2 },
        4: { miners: 1, haulers: 2, universals: 1, upgraders: 2, builders: 2, repairers: 1, fighters: 2 },
        5: { miners: 1, haulers: 2, universals: 2, upgraders: 3, builders: 3, repairers: 2, fighters: 2 },
        6: { miners: 1, haulers: 3, universals: 2, upgraders: 3, builders: 3, repairers: 2, fighters: 2 },
        7: { miners: 1, haulers: 3, universals: 3, upgraders: 4, builders: 4, repairers: 2, fighters: 2 },
        8: { miners: 1, haulers: 4, universals: 3, upgraders: 4, builders: 4, repairers: 3, fighters: 2 }
    },
    energyReserve: { 1: 0, 2: 0, 3: 300, 4: 300, 5: 300, 6: 300, 7: 300, 8: 300 },
    path: { plainCost: 2, swampCost: 10 },
    layout: { borderAvoid: 40, sourceAvoid: 60 },
    tower: { healMyCreeps: true, repairStructures: true, energyReserve: 200 },
    expansion: { enabled: true, minRCL: 3, minEnergy: 500, scoutCooldown: 100 },
    market: { minAmountToSell: 50000, minSellPrice: 0.6, sendEnergyToMyRooms: true },
    trapped: { enabled: true, minimumGCL: 3, stagnationThreshold: 50000, checkInterval: 1500 }
};

global.data = global.data || { rooms: {}, creeps: {} };
global.costMatrices = {};

function announce(creep, msg) { if (creep.memory.lastMsg !== msg) { creep.say(msg); creep.memory.lastMsg = msg; } }

// ------------------------------
// PATHFINDING (cost matrix)
// ------------------------------
function updateCostMatrix(room) {
    if (room.controller.level < 3) return;
    let cm = new PathFinder.CostMatrix();
    let terrain = room.getTerrain();
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            let tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) { cm.set(x, y, 0xff); continue; }
            let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
            let hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
            if (hasRoad) cm.set(x, y, 1);
            else if (tile === TERRAIN_MASK_SWAMP) cm.set(x, y, CONFIG.path.swampCost);
            else cm.set(x, y, CONFIG.path.plainCost);
        }
    }
    room.find(FIND_SOURCES).forEach(src => {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                let x = src.pos.x + dx, y = src.pos.y + dy;
                if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                    let val = cm.get(x, y);
                    if (val < 0xff) cm.set(x, y, val + CONFIG.layout.sourceAvoid);
                }
            }
        }
    });
    for (let i = 0; i < 50; i++) {
        for (let j = 0; j < 4; j++) {
            if (i < 50) {
                cm.set(i, j, Math.max(cm.get(i, j), CONFIG.layout.borderAvoid));
                cm.set(i, 49 - j, Math.max(cm.get(i, 49 - j), CONFIG.layout.borderAvoid));
                cm.set(j, i, Math.max(cm.get(j, i), CONFIG.layout.borderAvoid));
                cm.set(49 - j, i, Math.max(cm.get(49 - j, i), CONFIG.layout.borderAvoid));
            }
        }
    }
    global.costMatrices[room.name] = { matrix: cm.serialize(), time: Game.time };
    return cm;
}

function getCostMatrix(room) {
    let entry = global.costMatrices[room.name];
    if (!entry || Game.time - entry.time > 500) return updateCostMatrix(room);
    return PathFinder.CostMatrix.deserialize(entry.matrix);
}

function smartMove(creep, target, color) {
    if (!target) return false;
    let opts = { visualizePathStyle: { stroke: color, opacity: 0.5 }, reusePath: 10, maxRooms: 1 };
    if (creep.room.controller && creep.room.controller.level >= 3) {
        let cm = getCostMatrix(creep.room);
        opts.costCallback = () => cm;
    }
    return creep.moveTo(target, opts);
}

// ------------------------------
// ROOM MEMORY & DROP POINT
// ------------------------------
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

function initRoomMemory(room) {
    if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
    let mem = Memory.rooms[room.name];
    if (!mem.dropPos) {
        let drop = getDropPoint(room);
        if (drop) mem.dropPos = { x: drop.x, y: drop.y };
    }
    if (!mem.sourceIds) {
        mem.sourceIds = room.find(FIND_SOURCES).map(s => s.id);
        mem.sourceIndices = mem.sourceIds.reduce((acc, id, i) => { acc[id] = i; return acc; }, {});
    }
    global.data.rooms[room.name] = global.data.rooms[room.name] || {};
}

// ------------------------------
// DYNAMIC BODY SCALING
// ------------------------------
function getBestBody(role, room) {
    let maxEnergy = room.energyCapacityAvailable;
    let availableEnergy = room.energyAvailable;
    let reserve = (role !== 'miner' || room.controller.level < 2) ? (CONFIG.energyReserve[room.controller.level] || 0) : 0;
    let targetEnergy = Math.max(200, availableEnergy - reserve);
    let creepCount = _.filter(Game.creeps, c => c.room.name === room.name).length;
    if (creepCount < 3) targetEnergy = Math.min(targetEnergy, 300);
    
    const templates = {
        miner: [WORK, WORK, MOVE],
        hauler: [CARRY, CARRY, MOVE],
        universal: [WORK, CARRY, MOVE],
        builder: [WORK, CARRY, MOVE],
        upgrader: [WORK, CARRY, MOVE],
        repairer: [WORK, CARRY, MOVE],
        fighter: [TOUGH, MOVE, ATTACK, MOVE, ATTACK]
    };
    let template = templates[role] || templates.universal;
    
    if (role === 'miner') {
        let workParts = template.filter(p => p === WORK).length;
        let maxWork = 5;
        let maxUnits = Math.min(Math.floor(targetEnergy / _.sum(template, p => BODYPART_COST[p])), Math.floor(maxWork / workParts));
        if (maxUnits < 1 && targetEnergy >= _.sum(template, p => BODYPART_COST[p])) maxUnits = 1;
        let body = [];
        for (let i = 0; i < maxUnits; i++) body.push(...template);
        return body;
    }
    
    let unitCost = _.sum(template, p => BODYPART_COST[p]);
    let maxUnits = Math.floor(targetEnergy / unitCost);
    if (role === 'fighter') maxUnits = Math.min(maxUnits, 2);
    maxUnits = Math.min(maxUnits, Math.floor(50 / template.length));
    if (maxUnits < 1 && targetEnergy >= unitCost) maxUnits = 1;
    
    let body = [];
    if (maxUnits >= 1) {
        for (let i = 0; i < maxUnits; i++) body.push(...template);
    } else {
        if (role === 'miner') return [WORK, MOVE];
        if (role === 'hauler') return [CARRY, MOVE];
        if (role === 'fighter') return [ATTACK, MOVE, ATTACK, MOVE];
        return [WORK, CARRY, MOVE];
    }
    return body;
}

// ------------------------------
// TOWER & DEFENSE
// ------------------------------
function runTowers(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    if (towers.length === 0) return;
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    
    for (let tower of towers) {
        if (enemies.length > 0) {
            let target = tower.pos.findClosestByRange(enemies);
            if (target) tower.attack(target);
            continue;
        }
        if (CONFIG.tower.healMyCreeps && tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve + 200) {
            let damagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });
            if (damagedCreep) { tower.heal(damagedCreep); continue; }
        }
        if (CONFIG.tower.repairStructures && tower.store[RESOURCE_ENERGY] > CONFIG.tower.energyReserve + 200) {
            let priority = [STRUCTURE_RAMPART, STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL];
            let damagedStructure = null;
            for (let type of priority) {
                damagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: s => s.structureType === type && s.hits < s.hitsMax * (type === STRUCTURE_WALL ? 0.3 : 0.7)
                });
                if (damagedStructure) break;
            }
            if (damagedStructure) tower.repair(damagedStructure);
        }
    }
}

// ------------------------------
// AUTO-BUILD
// ------------------------------
function autoBuild(room) {
    if (Game.time % 100 !== 0) return;
    let spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    let rcl = room.controller.level;
    if (rcl === 1) return;
    
    // Containers at sources
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
                break;
            }
        });
    }
    
    // Basic roads
    if (rcl >= 2) {
        let sources = room.find(FIND_SOURCES);
        let controller = room.controller;
        sources.forEach(src => {
            let path = spawn.pos.findPathTo(src, { ignoreCreeps: true });
            for (let i = 0; i < path.length - 1; i++) {
                room.createConstructionSite(path[i].x, path[i].y, STRUCTURE_ROAD);
            }
        });
        let pathToCtrl = spawn.pos.findPathTo(controller, { ignoreCreeps: true });
        for (let i = 0; i < pathToCtrl.length - 1; i++) {
            room.createConstructionSite(pathToCtrl[i].x, pathToCtrl[i].y, STRUCTURE_ROAD);
        }
    }
    
    // Extensions – rings
    if (rcl >= 2) {
        let rings = [];
        if (rcl >= 2) rings.push([[-2,-2],[-2,0],[-2,2],[0,-2],[0,2],[2,-2],[2,0],[2,2]]);
        if (rcl >= 3) rings.push([[-3,-3],[-3,-1],[-3,1],[-3,3],[-1,-3],[-1,3],[1,-3],[1,3],[3,-3],[3,-1],[3,1],[3,3]]);
        if (rcl >= 4) rings.push([[-4,-4],[-4,-2],[-4,0],[-4,2],[-4,4],[-2,-4],[-2,4],[0,-4],[0,4],[2,-4],[2,4],[4,-4],[4,-2],[4,0],[4,2],[4,4]]);
        if (rcl >= 5) rings.push([[-5,-5],[-5,-3],[-5,-1],[-5,1],[-5,3],[-5,5],[-3,-5],[-3,5],[-1,-5],[-1,5],[1,-5],[1,5],[3,-5],[3,5],[5,-5],[5,-3],[5,-1],[5,1],[5,3],[5,5]]);
        if (rcl >= 6) rings.push([[-6,-6],[-6,-4],[-6,-2],[-6,0],[-6,2],[-6,4],[-6,6],[-4,-6],[-4,6],[-2,-6],[-2,6],[0,-6],[0,6],[2,-6],[2,6],[4,-6],[4,6],[6,-6],[6,-4],[6,-2],[6,0],[6,2],[6,4],[6,6]]);
        
        for (let ring of rings) {
            ring.forEach(p => {
                let x = spawn.pos.x + p[0], y = spawn.pos.y + p[1];
                if (x >= 0 && x < 50 && y >= 0 && y < 50 && room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                    room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
                }
            });
        }
    }
    
    // Towers
    if (rcl >= 3) {
        let existingTowers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length;
        let towerSites = room.find(FIND_CONSTRUCTION_SITES, { filter: { structureType: STRUCTURE_TOWER } }).length;
        let maxTowers = (rcl >= 5) ? 3 : 1;
        if (existingTowers + towerSites < maxTowers) {
            let spots = [[-3,-2], [3,-2], [-3,2], [3,2], [0,4], [0,-4]];
            for (let spot of spots) {
                let x = spawn.pos.x + spot[0], y = spawn.pos.y + spot[1];
                if (x >= 0 && x < 50 && y >= 0 && y < 50 && room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                    if (!room.lookForAt(LOOK_STRUCTURES, x, y).length && !room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) {
                        room.createConstructionSite(x, y, STRUCTURE_TOWER);
                        break;
                    }
                }
            }
        }
    }
    
    // Storage
    if (rcl >= 4) {
        let storagePos = new RoomPosition(spawn.pos.x, spawn.pos.y + 1, room.name);
        let storage = room.lookForAt(LOOK_STRUCTURES, storagePos.x, storagePos.y).find(s => s.structureType === STRUCTURE_STORAGE);
        if (!storage && room.createConstructionSite(storagePos.x, storagePos.y, STRUCTURE_STORAGE) === OK) {
            console.log(`[BUILD] Storage at (${storagePos.x},${storagePos.y})`);
        }
    }
    
    // Ramparts around spawn
    if (rcl >= 3) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                let x = spawn.pos.x + dx, y = spawn.pos.y + dy;
                if (x >= 0 && x < 50 && y >= 0 && y < 50 && room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                    let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                    let hasRampart = structures.some(s => s.structureType === STRUCTURE_RAMPART);
                    if (!hasRampart) room.createConstructionSite(x, y, STRUCTURE_RAMPART);
                }
            }
        }
    }
}

function runLinks(room) {
    let links = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LINK } });
    if (links.length < 2) return;
    let sourceLink = null, targetLink = null;
    for (let l of links) {
        if (l.store[RESOURCE_ENERGY] > 0 && (!sourceLink || l.store[RESOURCE_ENERGY] > sourceLink.store[RESOURCE_ENERGY])) sourceLink = l;
        else if (l.store[RESOURCE_ENERGY] === 0 && !targetLink) targetLink = l;
    }
    if (sourceLink && targetLink && sourceLink.cooldown === 0) sourceLink.transferEnergy(targetLink);
}

// ------------------------------
// ENERGY ACQUISITION
// ------------------------------
function acquireEnergy(creep, roomMem) {
    // 1. Storage
    let storage = creep.room.storage;
    if (storage && storage.store[RESOURCE_ENERGY] > 0 && creep.room.name === creep.memory.base) {
        if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, storage, '#ffff00');
        return true;
    }
    // 2. Dropped
    let anyDropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50 });
    if (anyDropped) {
        if (creep.pickup(anyDropped) === ERR_NOT_IN_RANGE) smartMove(creep, anyDropped, '#ffff00');
        return true;
    }
    // 3. Ruins
    let ruin = creep.pos.findClosestByPath(FIND_RUINS, { filter: r => r.store[RESOURCE_ENERGY] > 0 });
    if (ruin) {
        if (creep.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, ruin, '#ffff00');
        return true;
    }
    // 4. Container
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 50
    });
    if (container) {
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
        return true;
    }
    // 5. Source (fallback)
    let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, '#ffaa00');
        return true;
    }
    return false;
}

// ------------------------------
// STUCK DETECTION
// ------------------------------
function isStuck(creep) {
    if (!creep.memory.lastPositions) creep.memory.lastPositions = [];
    let pos = creep.pos;
    creep.memory.lastPositions.unshift({ x: pos.x, y: pos.y, room: pos.roomName });
    creep.memory.lastPositions = creep.memory.lastPositions.slice(0, 5);
    let sameCount = 0;
    for (let p of creep.memory.lastPositions) {
        if (p.x === pos.x && p.y === pos.y && p.room === pos.roomName) sameCount++;
    }
    return sameCount >= 4;
}

function moveRandom(creep) {
    let direction = Math.floor(Math.random() * 8) + 1;
    creep.move(direction);
}

// ------------------------------
// CREEP ROLES
// ------------------------------
function miner(creep, roomMem) {
    let srcIdx = creep.memory.sIdx;
    let source = creep.room.find(FIND_SOURCES)[srcIdx];
    if (!source) return;
    
    if (!creep.memory.miningPos) {
        let terrain = creep.room.getTerrain();
        let bestSpot = null;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                let x = source.pos.x + dx, y = source.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                bestSpot = { x, y };
                break;
            }
            if (bestSpot) break;
        }
        if (bestSpot) creep.memory.miningPos = bestSpot;
    }
    
    let pos = new RoomPosition(creep.memory.miningPos.x, creep.memory.miningPos.y, creep.room.name);
    if (!creep.pos.isEqualTo(pos)) {
        smartMove(creep, pos, '#00ff00');
        announce(creep, '🚶');
        return;
    }
    
    if (creep.harvest(source) === OK) announce(creep, '⛏️');
    
    // Build container if missing
    let container = source.pos.findInRange(FIND_STRUCTURES, 1, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
    if (!container) {
        let cs = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
        if (!cs) source.pos.createConstructionSite(STRUCTURE_CONTAINER);
    }
}

function hauler(creep, roomMem) {
    let miner = Game.creeps[creep.memory.minerId];
    if (!miner) { creep.suicide(); return; }
    
    if (!creep.memory.parkPos && miner) {
        let terrain = creep.room.getTerrain();
        let bestSpot = null, bestScore = -Infinity;
        for (let dx = -4; dx <= 4; dx++) {
            for (let dy = -4; dy <= 4; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== 4) continue;
                let x = miner.pos.x + dx, y = miner.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (creep.room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
                let otherHauler = _.find(Game.creeps, c => c.memory.role === 'hauler' && c.memory.parkPos && c.memory.parkPos.x === x && c.memory.parkPos.y === y);
                if (otherHauler && otherHauler.id !== creep.id) continue;
                let score = 100 - (Math.abs(x - miner.pos.x) + Math.abs(y - miner.pos.y));
                if (score > bestScore) { bestScore = score; bestSpot = { x, y }; }
            }
        }
        if (bestSpot) creep.memory.parkPos = bestSpot;
    }
    
    if (!creep.memory.state) creep.memory.state = 'COLLECT';
    if (creep.store.getFreeCapacity() === 0) creep.memory.state = 'DELIVER';
    if (creep.store[RESOURCE_ENERGY] === 0 && creep.memory.state === 'DELIVER') creep.memory.state = 'COLLECT';
    
    if (creep.memory.state === 'COLLECT') {
        // 1. Try to get from miner directly (critical fallback)
        if (miner.store[RESOURCE_ENERGY] > 0 && creep.pos.isNearTo(miner)) {
            if (creep.withdraw(miner, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, miner, '#ffff00');
            announce(creep, '🤝');
            return;
        }
        // 2. Try container
        let container = miner.pos.findInRange(FIND_STRUCTURES, 3, { filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0 })[0];
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
            announce(creep, '📦');
            return;
        }
        // 3. Try dropped
        let dropped = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, { filter: r => r.resourceType === RESOURCE_ENERGY })[0];
        if (dropped) {
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) smartMove(creep, dropped, '#ffff00');
            announce(creep, '⬆️');
            return;
        }
        // 4. Go to parking spot
        if (creep.memory.parkPos) {
            let pos = new RoomPosition(creep.memory.parkPos.x, creep.memory.parkPos.y, creep.room.name);
            if (!creep.pos.isEqualTo(pos)) smartMove(creep, pos, '#888888');
            announce(creep, '🅿️');
        }
    } else {
        // DELIVER priority: spawn/extensions → tower → storage → drop point
        let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (dest) {
            if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#aaff00');
            announce(creep, '🚚');
            if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.state = 'COLLECT';
            return;
        }
        let tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (tower) {
            if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, tower, '#ff8800');
            announce(creep, '🗼');
            if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.state = 'COLLECT';
            return;
        }
        let storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, storage, '#ffff00');
            announce(creep, '🏚️');
            if (creep.store[RESOURCE_ENERGY] === 0) creep.memory.state = 'COLLECT';
            return;
        }
        if (roomMem && roomMem.dropPos) {
            let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
            if (creep.pos.isEqualTo(pos)) creep.drop(RESOURCE_ENERGY);
            else smartMove(creep, pos, '#aaff00');
            announce(creep, '📦');
            creep.memory.state = 'COLLECT';
        }
    }
}

function universal(creep, roomMem) {
    if (isStuck(creep)) { moveRandom(creep); creep.memory.lastPositions = []; return; }
    
    // Find a spawn/extension needing energy
    let structure = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (structure) {
        if (creep.store[RESOURCE_ENERGY] === 0) {
            let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, '#ffaa00');
                announce(creep, '🌾');
                return;
            }
        } else {
            if (creep.transfer(structure, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, structure, '#aaff00');
            announce(creep, '⚡');
            return;
        }
    } else {
        // No structure needs energy – if we have energy, upgrade
        if (creep.store[RESOURCE_ENERGY] > 0) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) smartMove(creep, creep.room.controller, '#8a2be2');
            announce(creep, '⚡');
            return;
        } else {
            // Get energy from source
            let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, '#ffaa00');
                announce(creep, '🌾');
                return;
            }
        }
    }
    
    // Fallback: build something
    let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
    if (site) {
        if (creep.store[RESOURCE_ENERGY] === 0) acquireEnergy(creep, roomMem);
        else if (creep.build(site) === ERR_NOT_IN_RANGE) smartMove(creep, site, '#0000ff');
        announce(creep, '🔨');
        return;
    }
}

function builder(creep, roomMem) {
    let site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
    if (site) {
        if (creep.store[RESOURCE_ENERGY] === 0) acquireEnergy(creep, roomMem);
        else if (creep.build(site) === ERR_NOT_IN_RANGE) smartMove(creep, site, '#0000ff');
        announce(creep, '🔨');
        return;
    }
    universal(creep, roomMem);
}

function upgrader(creep, roomMem) {
    if (isStuck(creep)) { moveRandom(creep); creep.memory.lastPositions = []; return; }
    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) smartMove(creep, creep.room.controller, '#8a2be2');
    announce(creep, '⚡');
    if (creep.store[RESOURCE_ENERGY] === 0) acquireEnergy(creep, roomMem);
}

function repairer(creep, roomMem) {
    let priority = [STRUCTURE_RAMPART, STRUCTURE_TOWER, STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_EXTENSION, STRUCTURE_SPAWN];
    let target = null;
    for (let type of priority) {
        target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s => s.structureType === type && s.hits < s.hitsMax && (type !== STRUCTURE_WALL ? s.hits < s.hitsMax * 0.8 : s.hits < s.hitsMax * 0.5)
        });
        if (target) break;
    }
    if (target) {
        if (creep.store[RESOURCE_ENERGY] === 0) acquireEnergy(creep, roomMem);
        else if (creep.repair(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ff0000');
        announce(creep, target.structureType === STRUCTURE_WALL ? '🧱' : '🔧');
    } else builder(creep, roomMem);
}

function fighter(creep, roomMem) {
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
    let spawn = Object.values(Game.spawns)[0];
    if (spawn && !creep.pos.inRangeTo(spawn, 12)) smartMove(creep, spawn, '#ff00ff');
    announce(creep, '🚶');
}

// ------------------------------
// SPAWN LOGIC (prioritize miners and haulers)
// ------------------------------
function runSpawnForRoom(spawn) {
    let room = spawn.room;
    let rcl = room.controller.level;
    if (spawn.spawning) return;
    
    let creeps = _.filter(Game.creeps, c => c.room.name === room.name);
    let counts = {
        miner: _.filter(creeps, c => c.memory.role === 'miner').length,
        hauler: _.filter(creeps, c => c.memory.role === 'hauler').length,
        universal: _.filter(creeps, c => c.memory.role === 'universal').length,
        builder: _.filter(creeps, c => c.memory.role === 'builder').length,
        upgrader: _.filter(creeps, c => c.memory.role === 'upgrader').length,
        repairer: _.filter(creeps, c => c.memory.role === 'repairer').length,
        fighter: _.filter(creeps, c => c.memory.role === 'fighter').length
    };
    
    let config = CONFIG.rcl[rcl] || CONFIG.rcl[1];
    let sources = room.find(FIND_SOURCES);
    
    // 1. Miners (one per source)
    if (rcl >= 2) {
        for (let i = 0; i < sources.length; i++) {
            let minersAtSource = _.filter(creeps, c => c.memory.role === 'miner' && c.memory.sIdx === i).length;
            if (minersAtSource < config.miners) {
                let body = getBestBody('miner', room);
                let cost = _.sum(body, p => BODYPART_COST[p]);
                if (room.energyAvailable >= cost) {
                    let name = `MINER_S${i}_${Game.time}`;
                    spawn.spawnCreep(body, name, { memory: { role: 'miner', sIdx: i, base: room.name } });
                    console.log(`[${room.name}] Spawned miner for source ${i}`);
                    return;
                }
            }
        }
    }
    
    // 2. Haulers (one per miner)
    if (rcl >= 2) {
        let miners = _.filter(creeps, c => c.memory.role === 'miner');
        for (let miner of miners) {
            let haulersForMiner = _.filter(creeps, c => c.memory.role === 'hauler' && c.memory.minerId === miner.name).length;
            if (haulersForMiner < config.haulers) {
                let body = getBestBody('hauler', room);
                let cost = _.sum(body, p => BODYPART_COST[p]);
                if (room.energyAvailable >= cost) {
                    let name = `HAULER_${miner.name}_${Game.time}`;
                    spawn.spawnCreep(body, name, { memory: { role: 'hauler', minerId: miner.name, base: room.name } });
                    console.log(`[${room.name}] Spawned hauler for miner ${miner.name}`);
                    return;
                }
            }
        }
    }
    
    // 3. Upgraders (simple count)
    if (counts.upgrader < config.upgraders) {
        let body = getBestBody('upgrader', room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        if (room.energyAvailable >= cost) {
            let name = `UPGRADER_${Game.time}`;
            spawn.spawnCreep(body, name, { memory: { role: 'upgrader', base: room.name } });
            console.log(`[${room.name}] Spawned upgrader`);
            return;
        }
    }
    
    // 4. Builders
    if (counts.builder < config.builders) {
        let body = getBestBody('builder', room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        if (room.energyAvailable >= cost) {
            let name = `BUILDER_${Game.time}`;
            spawn.spawnCreep(body, name, { memory: { role: 'builder', base: room.name } });
            console.log(`[${room.name}] Spawned builder`);
            return;
        }
    }
    
    // 5. Repairers
    if (counts.repairer < config.repairers) {
        let body = getBestBody('repairer', room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        if (room.energyAvailable >= cost) {
            let name = `REPAIRER_${Game.time}`;
            spawn.spawnCreep(body, name, { memory: { role: 'repairer', base: room.name } });
            console.log(`[${room.name}] Spawned repairer`);
            return;
        }
    }
    
    // 6. Fighters if enemies
    let enemies = room.find(FIND_HOSTILE_CREEPS);
    if (rcl >= 3 && enemies.length > 0 && counts.fighter < config.fighters) {
        let body = getBestBody('fighter', room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        if (room.energyAvailable >= cost) {
            let name = `FIGHTER_${Game.time}`;
            spawn.spawnCreep(body, name, { memory: { role: 'fighter', base: room.name } });
            console.log(`[${room.name}] Spawned fighter`);
            return;
        }
    }
    
    // 7. Universal (fallback)
    if (counts.universal < config.universals) {
        let body = getBestBody('universal', room);
        let cost = _.sum(body, p => BODYPART_COST[p]);
        if (room.energyAvailable >= cost) {
            let name = `UNIV_${Game.time}`;
            spawn.spawnCreep(body, name, { memory: { role: 'universal', base: room.name } });
            console.log(`[${room.name}] Spawned universal`);
            return;
        }
    }
}

// ------------------------------
// EXPANSION (simple)
// ------------------------------
function getAdjacentRoom(mainRoomName, directionConst) {
    let exits = Game.map.describeExits(mainRoomName);
    if (!exits) return null;
    return exits[directionConst] || null;
}

function evaluateRoom(roomName) {
    let room = Game.rooms[roomName];
    if (!room) return null;
    let sources = room.find(FIND_SOURCES).length;
    if (sources < 2) return null;
    if (room.controller && room.controller.owner && room.controller.owner.username !== Memory.username) return null;
    return { score: sources, sources };
}

function manageExpansion(mainSpawn) {
    let mainRoom = mainSpawn.room;
    if (!CONFIG.expansion.enabled) return;
    if (mainRoom.controller.level < CONFIG.expansion.minRCL) return;
    if (mainRoom.energyAvailable < CONFIG.expansion.minEnergy) return;
    
    if (!Memory.autoExpansion) Memory.autoExpansion = {};
    let expData = Memory.autoExpansion;
    
    const directions = {
        north: FIND_EXIT_TOP,
        south: FIND_EXIT_BOTTOM,
        east:  FIND_EXIT_RIGHT,
        west:  FIND_EXIT_LEFT
    };
    
    let adjacentRooms = {};
    for (let [dir, constDir] of Object.entries(directions)) {
        let roomName = getAdjacentRoom(mainRoom.name, constDir);
        if (roomName) adjacentRooms[dir] = roomName;
    }
    
    for (let dir of Object.keys(adjacentRooms)) {
        if (!expData[dir]) {
            expData[dir] = {
                status: 'pending',
                roomName: adjacentRooms[dir],
                lastScout: 0,
                evaluation: null,
                claimed: false,
                bootstrapSent: false
            };
        }
        expData[dir].roomName = adjacentRooms[dir];
    }
    
    for (let dir of ['north', 'south', 'east', 'west']) {
        let data = expData[dir];
        if (!data) continue;
        let roomName = data.roomName;
        
        if (Memory.myRooms && Memory.myRooms.includes(roomName)) {
            data.status = 'active';
            continue;
        }
        
        if (data.status === 'claimed' && !data.bootstrapSent) {
            let roomObj = Game.rooms[roomName];
            if (roomObj && roomObj.controller && roomObj.controller.my) {
                let body = getBestBody('nextroomer', mainRoom);
                let cost = _.sum(body, p => BODYPART_COST[p]);
                if (mainRoom.energyAvailable >= cost && !mainSpawn.spawning) {
                    let name = `NEXTROOMER_${roomName}_${Game.time}`;
                    mainSpawn.spawnCreep(body, name, { memory: { role: 'nextroomer', targetRoom: roomName, base: mainRoom.name } });
                    data.bootstrapSent = true;
                    console.log(`[EXPAND] Sent nextroomer to ${roomName}`);
                }
                data.status = 'active';
            }
            continue;
        }
        
        if (data.status === 'scouted' && data.evaluation && data.evaluation.score > 0) {
            let roomObj = Game.rooms[roomName];
            if (roomObj && roomObj.controller && roomObj.controller.owner && roomObj.controller.owner.username !== Memory.username) {
                data.status = 'failed';
                continue;
            }
            let existingClaimer = _.find(Game.creeps, c => c.memory.role === 'expansionClaimer' && c.memory.targetRoom === roomName);
            if (!existingClaimer && !mainSpawn.spawning) {
                let body = [CLAIM, MOVE];
                let cost = _.sum(body, p => BODYPART_COST[p]);
                if (mainRoom.energyAvailable >= cost) {
                    let name = `CLAIMER_${roomName}_${Game.time}`;
                    mainSpawn.spawnCreep(body, name, { memory: { role: 'expansionClaimer', targetRoom: roomName } });
                    data.status = 'claiming';
                    console.log(`[EXPAND] Sending claimer to ${roomName}`);
                }
            }
            continue;
        }
        
        if (data.status === 'pending' || (data.status === 'scouting' && Game.time - data.lastScout > CONFIG.expansion.scoutCooldown)) {
            let existingScout = _.find(Game.creeps, c => c.memory.role === 'expansionScout' && c.memory.targetRoom === roomName);
            if (!existingScout && !mainSpawn.spawning) {
                let body = [MOVE];
                let cost = _.sum(body, p => BODYPART_COST[p]);
                if (mainRoom.energyAvailable >= cost) {
                    let name = `SCOUT_${roomName}_${Game.time}`;
                    mainSpawn.spawnCreep(body, name, { 
                        memory: { 
                            role: 'expansionScout', 
                            targetRoom: roomName, 
                            base: mainRoom.name 
                        } 
                    });
                    data.status = 'scouting';
                    data.lastScout = Game.time;
                    console.log(`[EXPAND] Sending scout to ${roomName} (${dir})`);
                }
            }
        }
    }
}

function expansionScout(creep) {
    let targetRoom = creep.memory.targetRoom;
    let expData = Memory.autoExpansion || {};
    let dirEntry = null;
    for (let dir of ['north', 'south', 'east', 'west']) {
        if (expData[dir] && expData[dir].roomName === targetRoom) {
            dirEntry = expData[dir];
            break;
        }
    }
    if (!dirEntry) return;

    let exitDir = creep.room.findExitTo(targetRoom);
    if (!exitDir) { creep.suicide(); return; }
    let exits = creep.room.find(exitDir);
    if (exits.length === 0) { creep.suicide(); return; }
    let exit = exits[Math.floor(exits.length / 2)];
    
    if (creep.room.name === targetRoom) {
        let evaluation = evaluateRoom(targetRoom);
        dirEntry.status = 'scouted';
        dirEntry.evaluation = evaluation;
        console.log(`[EXPAND] Scout ${creep.name} evaluated ${targetRoom}: sources=${evaluation ? evaluation.sources : 0}`);
        creep.suicide();
        return;
    }
    
    let moveResult = creep.moveTo(exit, { visualizePathStyle: { stroke: '#88ff88' } });
    if (moveResult === ERR_NO_PATH) {
        let direction = Math.floor(Math.random() * 8) + 1;
        creep.move(direction);
    }
}

function expansionClaimer(creep) {
    let targetRoom = creep.memory.targetRoom;
    if (creep.room.name !== targetRoom) {
        let exitDir = creep.room.findExitTo(targetRoom);
        if (exitDir) {
            let exit = creep.pos.findClosestByPath(exitDir);
            if (exit) smartMove(creep, exit, '#ffff88');
        }
        return;
    }
    let controller = creep.room.controller;
    if (controller) {
        let result = creep.claimController(controller);
        if (result === OK) {
            console.log(`[EXPAND] ${creep.name} claimed controller in ${targetRoom}!`);
            for (let dir of ['north', 'south', 'east', 'west']) {
                if (Memory.autoExpansion[dir] && Memory.autoExpansion[dir].roomName === targetRoom) {
                    Memory.autoExpansion[dir].status = 'claimed';
                    break;
                }
            }
            creep.suicide();
        } else if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller);
        } else {
            console.log(`[EXPAND] Failed to claim ${targetRoom}: ${result}`);
            creep.suicide();
        }
    } else {
        console.log(`[EXPAND] No controller in ${targetRoom}!`);
        creep.suicide();
    }
}

function nextroomer(creep, roomMem) {
    if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
        let targetRoom = creep.memory.targetRoom;
        let exitDir = creep.room.findExitTo(targetRoom);
        if (exitDir) {
            let exit = creep.pos.findClosestByPath(exitDir);
            if (exit) {
                let moveResult = creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
                if (moveResult === ERR_NO_PATH) moveRandom(creep);
            }
        }
        return;
    }
    let spawns = creep.room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) {
        let controller = creep.room.controller;
        if (controller) {
            let spots = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    let x = controller.pos.x + dx, y = controller.pos.y + dy;
                    if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                        if (creep.room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL) {
                            let structures = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
                            let cs = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
                            if (structures.length === 0 && cs.length === 0) {
                                spots.push(new RoomPosition(x, y, creep.room.name));
                            }
                        }
                    }
                }
            }
            if (spots.length > 0) {
                let spawnPos = spots[0];
                if (creep.pos.isNearTo(spawnPos)) {
                    creep.build(spawnPos, STRUCTURE_SPAWN);
                    announce(creep, '🏗️');
                } else {
                    creep.moveTo(spawnPos, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
                return;
            }
        }
    }
    universal(creep, roomMem);
}

// ------------------------------
// MARKET & LABS
// ------------------------------
function manageMarket(room) {
    if (!room.terminal || room.terminal.cooldown) return;
    for (let resource in room.terminal.store) {
        if (resource === RESOURCE_ENERGY) continue;
        let amount = room.terminal.store[resource];
        if (amount > CONFIG.market.minAmountToSell) {
            let sellAmount = amount - CONFIG.market.minAmountToSell;
            let orders = Game.market.getAllOrders({ type: ORDER_BUY, resourceType: resource });
            if (orders.length) {
                let bestOrder = _.max(orders, 'price');
                let cost = Game.market.calcTransactionCost(sellAmount, room.name, bestOrder.roomName);
                if (room.terminal.store[RESOURCE_ENERGY] > cost) {
                    Game.market.deal(bestOrder.id, sellAmount, room.name);
                    console.log(`[MARKET] Sold ${sellAmount} ${resource} at ${bestOrder.price}`);
                }
            }
        }
    }
    if (CONFIG.market.sendEnergyToMyRooms && Memory.myRooms && Memory.myRooms.length > 1) {
        let needEnergy = _.filter(Memory.myRooms, r => {
            let rObj = Game.rooms[r];
            return rObj && rObj.terminal && rObj.terminal.store[RESOURCE_ENERGY] < CONFIG.market.minAmountToSell * 2;
        });
        if (needEnergy.length && room.terminal.store[RESOURCE_ENERGY] > CONFIG.market.minAmountToSell * 5) {
            let target = needEnergy[0];
            let amount = Math.min(10000, room.terminal.store[RESOURCE_ENERGY] - CONFIG.market.minAmountToSell);
            let cost = Game.market.calcTransactionCost(amount, room.name, target);
            if (room.terminal.store[RESOURCE_ENERGY] > cost) {
                room.terminal.send(RESOURCE_ENERGY, amount, target, 'energy transfer');
                console.log(`[MARKET] Sent ${amount} energy to ${target}`);
            }
        }
    }
}

function manageLabs(room) {
    if (room.controller.level < 6) return;
    let labs = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LAB } });
    if (labs.length < 3) return;
    let storage = room.storage;
    let terminal = room.terminal;
    if (!storage || !terminal) return;
    let hydrogen = terminal.store[RESOURCE_HYDROGEN] || storage.store[RESOURCE_HYDROGEN];
    let oxygen = terminal.store[RESOURCE_OXYGEN] || storage.store[RESOURCE_OXYGEN];
    if (hydrogen > 1000 && oxygen > 1000) {
        let freeLabs = labs.filter(l => l.mineralType === null);
        if (freeLabs.length >= 2) freeLabs[0].runReaction(freeLabs[1], freeLabs[2]);
    }
}

// ------------------------------
// TRAPPED DETECTION
// ------------------------------
function detectTrapped(room) {
    if (!CONFIG.trapped.enabled) return false;
    if (Memory.myRooms && Memory.myRooms.length > 1) {
        if (Memory.trapped) delete Memory.trapped;
        return false;
    }
    if (Game.gcl.level < CONFIG.trapped.minimumGCL) return false;
    if (!Memory.trapped) Memory.trapped = {};
    if (!Memory.trapped.stagnantSince) Memory.trapped.stagnantSince = Game.time;
    if (Game.time - Memory.trapped.stagnantSince < CONFIG.trapped.stagnationThreshold) return false;
    if (Game.time % CONFIG.trapped.checkInterval !== 0) return false;
    
    let exits = Game.map.describeExits(room.name);
    let blockedExits = 0;
    for (let dir in exits) {
        let exitRoom = exits[dir];
        let roomObj = Game.rooms[exitRoom];
        if (!roomObj || !roomObj.controller || roomObj.controller.my) continue;
        blockedExits++;
    }
    if (blockedExits >= Object.keys(exits).length - 1) {
        console.log(`[TRAPPED] All exits blocked, colony is trapped!`);
        Memory.trapped.isTrapped = true;
        return true;
    }
    return false;
}

// ------------------------------
// MAIN LOOP
// ------------------------------
module.exports.loop = function () {
    // Clean dead creeps
    for (let name in Memory.creeps) if (!Game.creeps[name]) delete Memory.creeps[name];
    if (Game.time % 100 === 0 && Memory.rooms) {
        for (let name in Memory.rooms) if (!Game.rooms[name]) delete Memory.rooms[name];
    }
    
    // Update list of my rooms
    let myRooms = [];
    for (let name in Game.rooms) {
        let room = Game.rooms[name];
        if (room.controller && room.controller.my) {
            myRooms.push(name);
            initRoomMemory(room);
        }
    }
    Memory.myRooms = myRooms;
    if (myRooms.length > 0) Memory.mainRoom = myRooms[0];
    
    // Infrastructure for each my room
    for (let name of myRooms) {
        let room = Game.rooms[name];
        autoBuild(room);
        runTowers(room);
        runLinks(room);
        manageMarket(room);
        manageLabs(room);
        detectTrapped(room);
    }
    
    // Spawn management: for each spawn in each my room, run spawn logic
    for (let spawn of Object.values(Game.spawns)) {
        runSpawnForRoom(spawn);
    }
    
    // Expansion: use the main spawn (first one)
    let mainSpawn = Object.values(Game.spawns)[0];
    if (mainSpawn) {
        manageExpansion(mainSpawn);
        // Emergency universal if no creeps at all
        if (Object.keys(Game.creeps).length === 0 && !mainSpawn.spawning && mainSpawn.room.energyAvailable >= 200) {
            let body = [WORK, CARRY, MOVE];
            let name = `EMERG_${Game.time}`;
            mainSpawn.spawnCreep(body, name, { memory: { role: 'universal', base: mainSpawn.room.name } });
            console.log(`[EMERGENCY] Spawned emergency universal`);
        }
    }
    
    // Run all creeps
    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        let role = creep.memory.role;
        let roomMem = Memory.rooms[creep.room.name] || {};
        if (role === 'miner') miner(creep, roomMem);
        else if (role === 'hauler') hauler(creep, roomMem);
        else if (role === 'universal') universal(creep, roomMem);
        else if (role === 'builder') builder(creep, roomMem);
        else if (role === 'upgrader') upgrader(creep, roomMem);
        else if (role === 'repairer') repairer(creep, roomMem);
        else if (role === 'fighter') fighter(creep, roomMem);
        else if (role === 'nextroomer') nextroomer(creep, roomMem);
        else if (role === 'expansionScout') expansionScout(creep);
        else if (role === 'expansionClaimer') expansionClaimer(creep);
        else {
            console.log(`[CLEANUP] Unknown role ${role} for ${creep.name}, recycling`);
            if (creep.room.storage && creep.room.storage.store.energy > 0) creep.suicide();
            else creep.memory.recycle = true;
        }
    }
    
    // Periodic report
    if (Game.time % 50 === 0 && myRooms.length) {
        let mainRoom = Game.rooms[myRooms[0]];
        console.log(`\n🔷🔷🔷 COLONY STATUS (Tick ${Game.time}) 🔷🔷🔷`);
        console.log(`🏛️ RCL ${mainRoom.controller.level} | ⚡ ${mainRoom.energyAvailable}/${mainRoom.energyCapacityAvailable} (${Math.floor(mainRoom.energyAvailable / mainRoom.energyCapacityAvailable * 100)}%) | Rooms: ${myRooms.length}`);
        let roles = ['miner', 'hauler', 'universal', 'builder', 'upgrader', 'repairer', 'fighter', 'nextroomer'];
        for (let r of roles) {
            let count = _.filter(Game.creeps, c => c.memory.role === r).length;
            if (count > 0) console.log(`  ${r.padEnd(14)}: ${count}`);
        }
        if (Memory.autoExpansion) {
            console.log(`  Expansion:`);
            for (let dir of ['north', 'south', 'east', 'west']) {
                let d = Memory.autoExpansion[dir];
                if (d) console.log(`    ${dir}: ${d.roomName} (${d.status})`);
            }
        }
        console.log(`🔷🔷🔷 END REPORT (CPU: ${Game.cpu.getUsed().toFixed(2)}) 🔷🔷🔷\n`);
    }
};