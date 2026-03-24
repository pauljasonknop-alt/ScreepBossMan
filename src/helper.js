const { CONFIG } = require('config');

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
    if (role === 'fighter') maxUnits = Math.min(maxUnits, 2);
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

module.exports = { getBestBody, smartMove, announce, acquireEnergy, getDropPoint };