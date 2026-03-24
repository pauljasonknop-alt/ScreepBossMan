const { smartMove, announce, acquireEnergy } = require('./helpers');

// ==========================================
// HARVESTER
// ==========================================
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
// MINER
// ==========================================
const miner = (creep, roomMem) => {
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
                let x = src.pos.x + dx, y = src.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                let structures = src.room.lookForAt(LOOK_STRUCTURES, x, y);
                let hasStorage = structures.some(s => s.structureType === STRUCTURE_STORAGE);
                let hasContainer = structures.some(s => s.structureType === STRUCTURE_CONTAINER);
                let hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                let hasOtherStructure = structures.length > 0 && !hasStorage && !hasContainer && !hasRoad;
                if (hasOtherStructure) continue;
                let distToSpawn = Math.abs(x - spawn.pos.x) + Math.abs(y - spawn.pos.y);
                allSpots.push({ x, y, hasStorage, hasContainer, hasRoad, distToSpawn,
                    score: (hasStorage ? 2000 : 0) + (hasContainer ? 1000 : 0) + (100 - distToSpawn) + (hasRoad ? 10 : 0) });
            }
        }
        
        if (allSpots.length === 0) {
            console.log(`[MINER] ${creep.name} CRITICAL: No adjacent spots found!`);
            return;
        }
        
        allSpots.sort((a, b) => b.score - a.score);
        
        let takenSpots = [];
        _.filter(Game.creeps, c => c.memory.role === 'miner' && c.memory.sIdx === creep.memory.sIdx && c.memory.miningPos)
            .forEach(otherMiner => {
                if (otherMiner.id !== creep.id) takenSpots.push(`${otherMiner.memory.miningPos.x},${otherMiner.memory.miningPos.y}`);
            });
        
        let selectedSpot = null;
        for (let spot of allSpots) {
            if (!takenSpots.includes(`${spot.x},${spot.y}`)) { selectedSpot = spot; break; }
        }
        
        if (selectedSpot) {
            creep.memory.miningPos = { x: selectedSpot.x, y: selectedSpot.y };
            creep.memory.standingOnStorage = selectedSpot.hasStorage;
            creep.memory.standingOnContainer = selectedSpot.hasContainer;
        } else if (allSpots.length > 0) {
            creep.memory.miningPos = { x: allSpots[0].x, y: allSpots[0].y };
        }
    }
    
    if (creep.memory.miningPos) {
        let targetPos = new RoomPosition(creep.memory.miningPos.x, creep.memory.miningPos.y, creep.room.name);
        if (!creep.pos.isEqualTo(targetPos)) {
            if (Game.time % 20 === 0) console.log(`[MINER] ${creep.name} moving to spot (${targetPos.x},${targetPos.y})`);
            creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 20, maxRooms: 1, range: 0 });
            announce(creep, '🚶');
            return;
        } else if (!creep.memory.arrivedAtSpot) {
            console.log(`[MINER] ${creep.name} ARRIVED at spot for source ${creep.memory.sIdx}`);
            creep.memory.arrivedAtSpot = true;
        }
    }
    
    if (creep.harvest(src) === OK) announce(creep, '⛏️');
};

// ==========================================
// HAULER
// ==========================================
const hauler = (creep, roomMem) => {
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
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== 4) continue;
                let x = sourcePos.x + dx, y = sourcePos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                let structures = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
                if (structures.length > 0) continue;
                let otherHauler = _.find(Game.creeps, c => c.memory.role === 'hauler' && c.memory.parkPos && c.memory.parkPos.x === x && c.memory.parkPos.y === y);
                if (otherHauler && otherHauler.id !== creep.id) continue;
                let spawn = Game.spawns['Spawn1'];
                let distToSpawn = Math.abs(x - spawn.pos.x) + Math.abs(y - spawn.pos.y);
                if (distToSpawn < bestDist) { bestDist = distToSpawn; bestParkSpot = { x, y }; }
            }
        }
        if (bestParkSpot) creep.memory.parkPos = bestParkSpot;
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
            if (container && container.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
                announce(creep, '📦 Take');
                return;
            }
            let dropped = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50 });
            if (dropped.length) {
                let target = creep.pos.findClosestByPath(dropped);
                if (target && creep.pickup(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ffff00');
                announce(creep, '⬆️');
                return;
            }
            if (creep.memory.parkPos) {
                let pos = new RoomPosition(creep.memory.parkPos.x, creep.memory.parkPos.y, creep.room.name);
                if (!creep.pos.isEqualTo(pos)) { smartMove(creep, pos, '#888888'); announce(creep, '🅿️'); }
            }
        }
    } else {
        let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (dest) {
            if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#aaff00');
            announce(creep, '🚚 Spawn/Ext');
            return;
        }
        let tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (tower) {
            if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, tower, '#ff8800');
            announce(creep, '🗼 Tower');
            return;
        }
        let worker = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: c => (c.memory.role === 'upgrader' || c.memory.role === 'builder' || c.memory.role === 'repairer') && c.store.getFreeCapacity() > 0
        });
        if (worker) {
            if (creep.transfer(worker, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, worker, '#aaff00');
            announce(creep, '🤝 Feed');
            return;
        }
        if (roomMem && roomMem.dropPos) {
            let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
            if (creep.pos.isEqualTo(pos)) { creep.drop(RESOURCE_ENERGY); announce(creep, '📦 Drop'); }
            else { smartMove(creep, pos, '#aaff00'); announce(creep, '🚶 Drop'); }
        }
    }
};

// ==========================================
// UPGRADER
// ==========================================
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
// BUILDER
// ==========================================
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
            upgrader(creep, roomMem);
        }
    } else if (task === 'UPGRADE') {
        upgrader(creep, roomMem);
    } else {
        acquireEnergy(creep, roomMem);
    }
};

// ==========================================
// REPAIRER
// ==========================================
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
        if (!target) {
            let walls = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_WALL && s.hits < s.hitsMax * 0.5 });
            if (walls.length > 0) { walls.sort((a, b) => a.hits - b.hits); target = walls[0]; }
        }
        if (target) {
            if (creep.repair(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, '#ff0000');
            let repairType = target.structureType === STRUCTURE_WALL ? '🧱 Wall' : (target.structureType === STRUCTURE_RAMPART ? '🛡️ Rampart' : '🔧 Repair');
            announce(creep, repairType);
        } else {
            builder(creep, roomMem);
        }
    } else {
        acquireEnergy(creep, roomMem);
    }
};

// ==========================================
// FIGHTER
// ==========================================
const fighter = (creep, roomMem) => {
    let enemies = creep.room.find(FIND_HOSTILE_CREEPS);
    if (enemies.length > 0) {
        let target = creep.pos.findClosestByRange(enemies);
        if (target) {
            if (creep.pos.getRangeTo(target) <= 1) {
                creep.attack(target);
                announce(creep, '⚔️ KILL');
            } else {
                smartMove(creep, target, '#ff0000');
                announce(creep, '⚔️ CHARGE');
            }
            return;
        }
    }
    if (!creep.memory.patrolIndex) creep.memory.patrolIndex = 0;
    let spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
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
    if (creep.pos.getRangeTo(target) <= 2) creep.memory.patrolIndex = (creep.memory.patrolIndex + 1) % patrolPoints.length;
    smartMove(creep, target, '#ff00ff');
    announce(creep, '🚶 Patrol');
    if (creep.room.name !== spawn.room.name) creep.moveTo(spawn);
};

// ==========================================
// MINERAL HAULER
// ==========================================
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
            if (extractor) {
                if (creep.harvest(mineral) === ERR_NOT_IN_RANGE) smartMove(creep, mineral, '#aa00ff');
                announce(creep, '⛏️ Mineral');
            }
        }
    } else {
        let labs = creep.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB && s.store.getFreeCapacity(creep.store.getResourceTypes()[0]) > 0
        });
        if (labs.length > 0) {
            let lab = labs[0];
            let resourceType = creep.store.getResourceTypes()[0];
            if (resourceType && creep.transfer(lab, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, lab, '#ffff00');
            announce(creep, '🧪 Lab');
        } else {
            let terminal = creep.room.terminal;
            let storage = creep.room.storage;
            if (terminal && terminal.store.getFreeCapacity() > 0) {
                let resourceType = creep.store.getResourceTypes()[0];
                if (resourceType && creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, terminal, '#ffff00');
                announce(creep, '📦 Terminal');
            } else if (storage && storage.store.getFreeCapacity() > 0) {
                let resourceType = creep.store.getResourceTypes()[0];
                if (resourceType && creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) smartMove(creep, storage, '#ffff00');
                announce(creep, '🏚️ Storage');
            }
        }
    }
};

module.exports = { harvester, miner, hauler, upgrader, builder, repairer, fighter, mineralHauler };