const { smartMove, announce } = require('../helpers');

module.exports = (creep, roomMem) => {
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
                allSpots.push({
                    x, y, hasStorage, hasContainer, hasRoad, distToSpawn,
                    score: (hasStorage ? 2000 : 0) + (hasContainer ? 1000 : 0) + (100 - distToSpawn) + (hasRoad ? 10 : 0)
                });
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
            if (!takenSpots.includes(`${spot.x},${spot.y}`)) {
                selectedSpot = spot;
                break;
            }
        }
        
        if (selectedSpot) {
            creep.memory.miningPos = { x: selectedSpot.x, y: selectedSpot.y };
            creep.memory.standingOnStorage = selectedSpot.hasStorage;
            creep.memory.standingOnContainer = selectedSpot.hasContainer;
            let spotType = selectedSpot.hasStorage ? 'STORAGE' : (selectedSpot.hasContainer ? 'CONTAINER' : (selectedSpot.hasRoad ? 'ROAD' : 'EMPTY'));
            if (Game.time % 100 === 0) console.log(`[MINER] ${creep.name} assigned to ${spotType} spot (${selectedSpot.x},${selectedSpot.y})`);
        } else {
            console.log(`[MINER] ${creep.name} CRITICAL: ALL spots taken!`);
            if (allSpots.length > 0) creep.memory.miningPos = { x: allSpots[0].x, y: allSpots[0].y };
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