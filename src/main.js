// this is the start of something wonderfull
// first commit on 17-03-2026 to screeps game

// Define roles
const roleMiner = require('role.miner');
const roleHauler = require('role.hauler');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');
const roleRepairer = require('role.repairer');
const roleHarvester = require('role.harvester');

module.exports.loop = function () {
  // Clean up memory
  for (let name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }

  const spawn = Game.spawns['Spawn1'];
  const controller = spawn.room.controller;
  const stage = controller.level;
  Memory.stage = stage; // Store stage in memory for respawn continuity
  const emergencyReserve = 200; // Energy reserve for emergency harvester spawn
  Memory.emergencyReserve = emergencyReserve;
  Memory.lastEnergyTick = Memory.lastEnergyTick || Game.time;

  const sources = spawn.room.find(FIND_SOURCES);

    // Auto build containers near sources at stage 2+
    if (stage >= 2) {
        sources.forEach(source => {
            const nearbyContainers = source.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER });
            const nearbySites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER });
            if (nearbyContainers.length == 0 && nearbySites.length == 0 && spawn.energy >= 250) {
                // Find a free adjacent position
                const adjacentPositions = [
                    { x: source.pos.x + 1, y: source.pos.y },
                    { x: source.pos.x - 1, y: source.pos.y },
                    { x: source.pos.x, y: source.pos.y + 1 },
                    { x: source.pos.x, y: source.pos.y - 1 }
                ];
                for (let pos of adjacentPositions) {
                    const terrain = source.room.getTerrain();
                    if (terrain.get(pos.x, pos.y) != TERRAIN_MASK_WALL) {
                        const result = source.room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
                        if (result == OK) break;
                    }
                }
            }
        });
    }
  const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');
  const haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
  const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
  const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
  const repairers = _.filter(Game.creeps, (creep) => creep.memory.role == 'repairer');

  // Desired counts based on stage
  // 1 miner per source, 1 hauler per source
  const desiredMiners = 1 * sources.length;
  const desiredHaulers = desiredMiners;  // 1 hauler per miner (1 per source)
  const desiredUpgraders = 2;
  const desiredBuilders = 3;
  const desiredRepairers = stage >= 2 ? 1 : 0;
  
  // Building priority: track primary target site
  Memory.primaryBuildSite = Memory.primaryBuildSite || null;
  const allSites = spawn.room.find(FIND_CONSTRUCTION_SITES);
  if (allSites.length > 0) {
    if (!Memory.primaryBuildSite || !Game.getObjectById(Memory.primaryBuildSite)) {
      // No current target, pick the closest one
      Memory.primaryBuildSite = allSites[0].id;
    }
  } else {
    Memory.primaryBuildSite = null;
  }

  // Helper: Find source with fewest assigned creeps of a given role
  const findLeastBusySourceForRole = (role) => {
    let minCount = Infinity;
    let targetSource = sources[0];
    sources.forEach(source => {
      const count = _.filter(Game.creeps, c => c.memory.role == role && c.memory.sourceId == source.id).length;
      if (count < minCount) {
        minCount = count;
        targetSource = source;
      }
    });
    return targetSource;
  };

// Emergency harvester - only if no miners available for energy production
  // Harvesters die out naturally once miners are spawned
  if (miners.length == 0 && spawn.energy >= 200) {
    const harvesters = _.filter(Game.creeps, c => c.memory.role == 'harvester');
    if (harvesters.length == 0) {
      const newName = 'EmergencyHarvester' + Game.time;
      spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'harvester', sourceIndex: 0 } });
    }
  }

  // Spawn miners - distribute to least busy source
  if (miners.length < desiredMiners) {
    const targetSource = findLeastBusySourceForRole('miner');
    const newName = 'Miner' + Game.time;
    spawn.spawnCreep([WORK, WORK, MOVE], newName, { memory: { role: 'miner', sourceId: targetSource.id } });
  }
  // Spawn haulers - one per miner (dedicated pairing)
  else if (haulers.length < desiredHaulers) {
    // Count haulers assigned to each miner
    const haulersPerMiner = {};
    miners.forEach(miner => {
      haulersPerMiner[miner.name] = 0;
    });
    haulers.forEach(hauler => {
      if (hauler.memory.minerId && haulersPerMiner[hauler.memory.minerId] !== undefined) {
        haulersPerMiner[hauler.memory.minerId]++;
      }
    });

    // Pick the miner with the fewest haulers
    const targetMiner = miners.reduce((best, miner) => {
      if (!best) return miner;
      if ((haulersPerMiner[miner.name] || 0) < (haulersPerMiner[best.name] || 0)) return miner;
      return best;
    }, null);

    if (targetMiner) {
      const newName = 'Hauler' + Game.time;
      spawn.spawnCreep([CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'hauler', minerId: targetMiner.name, sourceId: targetMiner.memory.sourceId } });
    }
  }
  // Spawn builders before upgraders and repairers (energy priority)
  else if (builders.length < desiredBuilders) {
    const newName = 'Builder' + Game.time;
    spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'builder' } });
  }
  // Spawn upgraders
  else if (upgraders.length < desiredUpgraders) {
    const newName = 'Upgrader' + Game.time;
    spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'upgrader' } });
  }
  // Spawn repairers
  else if (repairers.length < desiredRepairers) {
    const newName = 'Repairer' + Game.time;
    spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'repairer' } });
  }

  // Run creeps
  for (let name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.memory.role == 'miner') {
      roleMiner.run(creep);
    }
    if (creep.memory.role == 'hauler') {
      roleHauler.run(creep);
    }
    if (creep.memory.role == 'upgrader') {
      roleUpgrader.run(creep);
    }
    if (creep.memory.role == 'builder') {
      roleBuilder.run(creep);
    }
    if (creep.memory.role == 'repairer') {
      roleRepairer.run(creep);
    }
    if (creep.memory.role == 'harvester') {
      roleHarvester.run(creep);
    }
  }

  // Reports
  if (Game.time % 10 == 0) { // Every 10 ticks
    console.log('=== Game Report [Tick ' + Game.time + '] ===');
    console.log('Energy available:', spawn.room.energyAvailable + '/' + spawn.room.energyCapacityAvailable);
    console.log('Stage:', stage);
    console.log('Miners:', miners.length + '/' + desiredMiners);
    console.log('Haulers:', haulers.length + '/' + desiredHaulers);
    console.log('Upgraders:', upgraders.length + '/' + desiredUpgraders);
    console.log('Builders:', builders.length + '/' + desiredBuilders);
    console.log('Repairers:', repairers.length + '/' + desiredRepairers);
    console.log('Harvesters (Emergency):', _.filter(Game.creeps, c => c.memory.role == 'harvester').length);
    console.log('Total creeps:', Object.keys(Game.creeps).length);
    
    // Show distribution by source
    sources.forEach((source, idx) => {
      const minersOnSource = _.filter(miners, c => c.memory.sourceId == source.id).length;
      const haulersOnSource = _.filter(haulers, c => c.memory.sourceId == source.id).length;
      console.log('Source ' + idx + ': ' + minersOnSource + ' miners, ' + haulersOnSource + ' haulers');
    });
    
    // Show primary build target
    if (Memory.primaryBuildSite) {
      const primary = Game.getObjectById(Memory.primaryBuildSite);
      if (primary) {
        console.log('Building Target: ' + primary.structureType + ' at (' + primary.pos.x + ',' + primary.pos.y + ') - Progress: ' + primary.progress + '/' + primary.progressTotal);
      }
    } else {
      console.log('Building Target: None');
    }
    
    console.log('CPU used:', Game.cpu.getUsed());
    console.log('===================');
  }
};
