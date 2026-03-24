const { smartMove, announce } = require('../helpers');

module.exports = (creep, roomMem) => {
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
                else announce(creep, '⏳ Wait');
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
        if (roomMem.dropPos) {
            let pos = new RoomPosition(roomMem.dropPos.x, roomMem.dropPos.y, creep.room.name);
            if (creep.pos.isEqualTo(pos)) { creep.drop(RESOURCE_ENERGY); announce(creep, '📦 Drop'); }
            else { smartMove(creep, pos, '#aaff00'); announce(creep, '🚶 Drop'); }
        }
    }
};