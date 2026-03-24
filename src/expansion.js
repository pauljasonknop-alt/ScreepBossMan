const { CONFIG, EXPANSION } = require('./config');
const { getBestBody, smartMove, announce } = require('./helpers');

function getExpansionRoomName(gridX, gridY) {
    let sectorX = gridX - 1;
    let sectorY = gridY - 1;
    if (sectorX === 0 && sectorY === 0) return null;
    return EXPANSION.roomNameTemplate.replace('{sectorX}', sectorX).replace('{sectorY}', sectorY);
}

function getEnabledExpansionRooms() {
    let rooms = [];
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            if (EXPANSION.grid[y] && EXPANSION.grid[y][x] === 1) {
                if (x === 1 && y === 1) continue;
                let roomName = getExpansionRoomName(x, y);
                if (roomName) {
                    rooms.push({
                        name: roomName,
                        gridX: x,
                        gridY: y,
                        direction: x === 0 ? 'West' : (x === 2 ? 'East' : (y === 0 ? 'North' : 'South'))
                    });
                }
            }
        }
    }
    return rooms;
}

function isRoomOwned(room) {
    if (!room || !room.controller) return false;
    return room.controller.my;
}

function getExpansionMemory(roomName) {
    if (!Memory.expansion) Memory.expansion = {};
    if (!Memory.expansion[roomName]) {
        Memory.expansion[roomName] = {
            sources: [],
            containers: {},
            storageBuilt: false,
            miners: [],
            haulers: [],
            dropPos: null,
            lastCheck: 0,
            status: 'pending'
        };
    }
    return Memory.expansion[roomName];
}

const scout = {
    run: (creep) => {
        let targetRoom = creep.memory.targetRoom;
        let expMem = getExpansionMemory(targetRoom);
        
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
            
            console.log(`[SCOUT] ${creep.name} reached ${targetRoom}!`);
            console.log(`   - Sources: ${sources.length}`);
            console.log(`   - Controller: ${owner}`);
            console.log(`   - Mineral: ${creep.room.find(FIND_MINERALS)[0]?.mineralType || 'none'}`);
            
            expMem.status = 'scouted';
            expMem.sources = sources.map(s => s.id);
            creep.suicide();
        }
    }
};

const claimer = {
    run: (creep) => {
        let targetRoom = creep.memory.targetRoom;
        let expMem = getExpansionMemory(targetRoom);
        
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
                    expMem.status = 'claimed';
                }
            }
        }
    }
};

const expansionMiner = {
    run: (creep, targetRoomName) => {
        if (creep.room.name !== targetRoomName) {
            let exitDir = creep.room.findExitTo(targetRoomName);
            if (exitDir) {
                let exit = creep.pos.findClosestByPath(exitDir);
                if (exit) smartMove(creep, exit, '#ffaa00');
                announce(creep, '🚶 To ' + targetRoomName.slice(-3));
            }
            return;
        }
        
        let src = creep.room.find(FIND_SOURCES)[creep.memory.sIdx || 0];
        if (!src) {
            console.log(`[EXPANSION] ${creep.name} ERROR: No source found in ${targetRoomName}`);
            return;
        }
        
        let expMem = getExpansionMemory(targetRoomName);
        if (!expMem.storageBuilt && creep.store.getCapacity() === 0) {
            let containers = creep.pos.findInRange(FIND_STRUCTURES, 0, { filter: s => s.structureType === STRUCTURE_CONTAINER });
            if (containers.length === 0) {
                let result = creep.room.createConstructionSite(creep.pos.x, creep.pos.y, STRUCTURE_CONTAINER);
                if (result === OK) {
                    console.log(`[EXPANSION] ${creep.name} building container at (${creep.pos.x},${creep.pos.y}) in ${targetRoomName}`);
                    expMem.storageBuilt = true;
                }
            } else {
                expMem.storageBuilt = true;
            }
        }
        
        if (!creep.memory.miningPos) {
            let terrain = src.room.getTerrain();
            let bestSpot = null;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    let x = src.pos.x + dx, y = src.pos.y + dy;
                    if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    let structures = src.room.lookForAt(LOOK_STRUCTURES, x, y);
                    let hasContainer = structures.some(s => s.structureType === STRUCTURE_CONTAINER);
                    if (hasContainer) { bestSpot = { x, y }; break; }
                    if (!bestSpot) bestSpot = { x, y };
                }
                if (bestSpot) break;
            }
            if (bestSpot) {
                creep.memory.miningPos = bestSpot;
                console.log(`[EXPANSION] ${creep.name} assigned to spot (${bestSpot.x},${bestSpot.y}) in ${targetRoomName}`);
            }
        }
        
        if (creep.memory.miningPos) {
            let targetPos = new RoomPosition(creep.memory.miningPos.x, creep.memory.miningPos.y, creep.room.name);
            if (!creep.pos.isEqualTo(targetPos)) {
                smartMove(creep, targetPos, '#00ff00');
                announce(creep, '🚶 Move');
                return;
            }
        }
        
        if (creep.harvest(src) === OK) announce(creep, '⛏️');
    }
};

const expansionHauler = {
    run: (creep, targetRoomName, mainRoomName) => {
        if (creep.room.name === targetRoomName) {
            let expMem = getExpansionMemory(targetRoomName);
            if (creep.store.getFreeCapacity() > 0) {
                let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
                });
                if (container) {
                    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, container, '#ffff00');
                    announce(creep, '📦 Take');
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
                    announce(creep, '🏠 Return');
                }
                return;
            }
            
            let dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (dest) {
                if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, dest, '#aaff00');
                announce(creep, '🚚 Spawn/Ext');
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.returning = false;
                    creep.memory.task = 'COLLECT';
                }
                return;
            }
            
            let tower = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            if (tower) {
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) smartMove(creep, tower, '#ff8800');
                announce(creep, '🗼 Tower');
                if (creep.store[RESOURCE_ENERGY] === 0) {
                    creep.memory.returning = false;
                    creep.memory.task = 'COLLECT';
                }
                return;
            }
            
            let roomMem = Memory.rooms[mainRoomName];
            if (roomMem && roomMem.dropPos) {
                let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, mainRoomName);
                if (creep.pos.isEqualTo(pos)) {
                    creep.drop(RESOURCE_ENERGY);
                    announce(creep, '📦 Drop');
                    creep.memory.returning = false;
                    creep.memory.task = 'COLLECT';
                } else {
                    smartMove(creep, pos, '#aaff00');
                    announce(creep, '🚶 Drop');
                }
            }
        }
    }
};

function manageExpansionPopulation(spawn) {
    let mainRoom = spawn.room;
    let mainRoomName = mainRoom.name;
    let mainRCL = mainRoom.controller.level;
    
    if (mainRCL < CONFIG.expansionMinRCL) {
        if (Game.time % 200 === 0) console.log(`[EXPANSION] Expansion starts at RCL ${CONFIG.expansionMinRCL} (currently RCL ${mainRCL})`);
        return;
    }
    
    let expansionRooms = getEnabledExpansionRooms();
    
    if (expansionRooms.length === 0) {
        if (Game.time % 200 === 0) console.log(`[EXPANSION] ⚠️ No expansion rooms configured! Set grid values to 1 in EXPANSION.grid`);
        return;
    }
    
    if (mainRoom.energyAvailable < EXPANSION.minEnergyForExpansion) {
        if (Game.time % 100 === 0) console.log(`[EXPANSION] Waiting for ${EXPANSION.minEnergyForExpansion} energy, have ${mainRoom.energyAvailable}`);
        return;
    }
    
    for (let expRoom of expansionRooms) {
        let expRoomName = expRoom.name;
        let expMem = getExpansionMemory(expRoomName);
        let expRoomObj = Game.rooms[expRoomName];
        
        if (!expRoomObj) {
            if (expMem.status === 'pending' || expMem.status === 'scouted') {
                let scout = _.find(Game.creeps, c => c.memory.role === 'scout' && c.memory.targetRoom === expRoomName);
                if (!scout && !spawn.spawning) {
                    console.log(`[EXPANSION] 📡 Sending scout to ${expRoomName} (${expRoom.direction})`);
                    let body = [MOVE];
                    let name = `Scout_${expRoomName}_${Game.time}`;
                    spawn.spawnCreep(body, name, { memory: { role: 'scout', targetRoom: expRoomName } });
                }
            }
            continue;
        }
        
        if (!isRoomOwned(expRoomObj)) {
            if (expMem.status !== 'claimed') {
                let claimer = _.find(Game.creeps, c => c.memory.role === 'claimer' && c.memory.targetRoom === expRoomName);
                if (!claimer && !spawn.spawning && expRoomObj.controller) {
                    console.log(`[EXPANSION] 🚩 Sending claimer to ${expRoomName}`);
                    let body = [CLAIM, MOVE];
                    let name = `Claimer_${expRoomName}_${Game.time}`;
                    spawn.spawnCreep(body, name, { memory: { role: 'claimer', targetRoom: expRoomName } });
                }
            }
            continue;
        }
        
        let sources = expRoomObj.find(FIND_SOURCES);
        if (expMem.sources.length === 0) {
            expMem.sources = sources.map(s => s.id);
            console.log(`[EXPANSION] 🌍 ${expRoomName} has ${sources.length} sources, starting development`);
            expMem.status = 'active';
        }
        
        let expansionMiners = _.filter(Game.creeps, c => c.memory.role === 'expansionMiner' && c.memory.targetRoom === expRoomName).length;
        let targetMiners = sources.length * EXPANSION.minersPerSource;
        
        if (expansionMiners < targetMiners && !spawn.spawning) {
            console.log(`[EXPANSION] ⛏️ Need ${targetMiners - expansionMiners} more miners in ${expRoomName}`);
            let body = getBestBody('miner', mainRoom);
            let name = `ExpMin_${expRoomName}_${Game.time}`;
            let result = spawn.spawnCreep(body, name, { memory: { role: 'expansionMiner', targetRoom: expRoomName, sIdx: expansionMiners % sources.length } });
            if (result === OK) console.log(`[SPAWN] Expansion miner ${name} for ${expRoomName}`);
            return;
        }
        
        let expansionHaulers = _.filter(Game.creeps, c => c.memory.role === 'expansionHauler' && c.memory.targetRoom === expRoomName).length;
        let targetHaulers = expansionMiners * EXPANSION.haulersPerMiner;
        
        if (expansionHaulers < targetHaulers && !spawn.spawning) {
            console.log(`[EXPANSION] 🚚 Need ${targetHaulers - expansionHaulers} more haulers in ${expRoomName}`);
            let body = getBestBody('hauler', mainRoom);
            let name = `ExpHaul_${expRoomName}_${Game.time}`;
            let result = spawn.spawnCreep(body, name, { memory: { role: 'expansionHauler', targetRoom: expRoomName, mainRoom: mainRoomName, returning: false, task: 'COLLECT' } });
            if (result === OK) console.log(`[SPAWN] Expansion hauler ${name} for ${expRoomName}`);
            return;
        }
        
        if (Game.time % 100 === 0 && expansionMiners > 0) {
            console.log(`[EXPANSION] 📊 ${expRoomName} (${expRoom.direction}): ${expansionMiners}/${targetMiners} miners, ${expansionHaulers}/${targetHaulers} haulers`);
        }
    }
}

module.exports = { getEnabledExpansionRooms, isRoomOwned, getExpansionMemory, scout, claimer, expansionMiner, expansionHauler, manageExpansionPopulation };