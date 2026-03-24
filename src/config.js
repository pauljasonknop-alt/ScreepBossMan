// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
    rcl: {
        1: { harvesters: 2, miners: 0, haulers: 0, builders: 1, upgraders: 1, repairers: 0, fighters: 0, mineralHaulers: 0 },
        2: { harvesters: 0, miners: 2, haulers: 2, builders: 2, upgraders: 2, repairers: 1, fighters: 0, mineralHaulers: 0 },
        3: { harvesters: 0, miners: 2, haulers: 2, builders: 2, upgraders: 2, repairers: 1, fighters: 2, mineralHaulers: 0 },
        4: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 2, repairers: 1, fighters: 2, mineralHaulers: 1 },
        5: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 3, repairers: 2, fighters: 2, mineralHaulers: 1 },
        6: { harvesters: 0, miners: 2, haulers: 3, builders: 3, upgraders: 3, repairers: 2, fighters: 2, mineralHaulers: 2 },
        7: { harvesters: 0, miners: 2, haulers: 4, builders: 4, upgraders: 4, repairers: 2, fighters: 2, mineralHaulers: 2 },
        8: { harvesters: 0, miners: 2, haulers: 4, builders: 4, upgraders: 4, repairers: 3, fighters: 2, mineralHaulers: 2 }
    },
    ratios: {
        worker: [WORK, CARRY, MOVE],
        hauler: [CARRY, CARRY, MOVE],
        miner:  [WORK, WORK, MOVE],
        fighter: [TOUGH, MOVE, ATTACK, MOVE, ATTACK],
        mineralHauler: [CARRY, CARRY, MOVE, CARRY, MOVE]
    },
    tower: { 
        repairThreshold: 0.5, 
        energyReserve: 200,
        attackRange: 20
    },
    energyReserve: { 1: 0, 2: 0, 3: 300, 4: 300, 5: 300, 6: 300, 7: 300, 8: 300 },
    
    expansionMinRCL: 3
};

// ==========================================
// EXPANSION SETTINGS
// ==========================================
const EXPANSION = {
    grid: [
        [ 0, 0, 0 ],
        [ 1, 0, 0 ],
        [ 0, 0, 0 ]
    ],
    roomNameTemplate: 'W{sectorX}N{sectorY}',
    minersPerSource: 1,
    haulersPerMiner: 1,
    minEnergyForExpansion: 500
};

module.exports = { CONFIG, EXPANSION };