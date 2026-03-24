const { smartMove, announce } = require('../helpers');

module.exports = (creep, roomMem) => {
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
    
    if (creep.room.name !== spawn.room.name) {
        console.log(`[FIGHTER] ${creep.name} wandered! FORCING RETURN!`);
        creep.moveTo(spawn);
    }
};