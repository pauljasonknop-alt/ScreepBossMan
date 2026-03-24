const { smartMove, announce } = require('helpers');

module.exports = (creep, roomMem) => {
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
        if (!src) src = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        
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