// this is the start of something wonderfull
// first commit on 17-03-2026 to screeps game

// Define roles
const roleMiner = {
  /** @param {Creep} creep **/
  run: function (creep) {
    // Auto-assign source if not set
    if (!creep.memory.sourceId) {
      const sources = creep.room.find(FIND_SOURCES);
      if (sources.length > 0) {
        creep.memory.sourceId = sources[0].id;
      }
    }
    
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      // Just harvest at source position - no waiting for containers
      if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
      }
    } else {
      // Fallback: harvest from any source
      const sources = creep.room.find(FIND_SOURCES);
      if (sources.length > 0) {
        if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
          creep.moveTo(sources[0], { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 });
        }
      }
    }
  }
};

const roleHauler = {
  /** @param {Creep} creep **/
  run: function (creep) {
    const spawn = Game.spawns['Spawn1'];
    
    // Auto-assign source if not set
    if (!creep.memory.sourceId) {
      const sources = creep.room.find(FIND_SOURCES);
      if (sources.length > 0) {
        creep.memory.sourceId = sources[0].id;
      }
    }
    
    if (creep.store.getFreeCapacity() > 0) {
      // Prefer working with a dedicated miner
      const miner = creep.memory.minerId ? Game.creeps[creep.memory.minerId] : null;
      if (miner) {
        // Pickup dropped energy at the miner's position
        const droppedNearMiner = miner.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
          filter: (r) => r.resourceType == RESOURCE_ENERGY
        });
        if (droppedNearMiner.length > 0) {
          const closest = creep.pos.findClosestByPath(droppedNearMiner);
          if (closest) {
            if (creep.pickup(closest) == ERR_NOT_IN_RANGE) {
              creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
            }
          }
          return;
        }

        // No dropped energy at the miner: stay near the miner and wait
        if (!creep.pos.inRangeTo(miner, 2)) {
          creep.moveTo(miner, { visualizePathStyle: { stroke: '#0088ff' }, reusePath: 10 }); // blue - staying with miner
        }
        return;
      }

      // If we have no miner (or it's gone), fall back to assigned source or dropped energy
      const source = Game.getObjectById(creep.memory.sourceId);
      if (source) {
        const droppedNearSource = source.pos.findInRange(FIND_DROPPED_RESOURCES, 5, {
          filter: (r) => r.resourceType == RESOURCE_ENERGY
        });
        if (droppedNearSource.length > 0) {
          const closest = creep.pos.findClosestByPath(droppedNearSource);
          if (closest) {
            if (creep.pickup(closest) == ERR_NOT_IN_RANGE) {
              creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
            }
          }
          return;
        }

        if (!creep.pos.inRangeTo(source, 2)) {
          creep.moveTo(source, { visualizePathStyle: { stroke: '#0088ff' }, reusePath: 10 }); // blue - going to source
        }
        return;
      }

      const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType == RESOURCE_ENERGY
      });
      if (droppedEnergy.length > 0) {
        const closest = creep.pos.findClosestByPath(droppedEnergy);
        if (closest) {
          if (creep.pickup(closest) == ERR_NOT_IN_RANGE) {
            creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
          }
        }
        return;
      }
    } else {
      // Deliver to spawn/extensions
      const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        }
      });
      if (targets.length > 0) {
        if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#000000' }, reusePath: 10 }); // black
        }
      } else {
        // If spawn/extensions are full, deliver to needy creeps
        const needyCreeps = creep.room.find(FIND_MY_CREEPS, {
          filter: (c) => c.store.getFreeCapacity() > 0 && c.memory.role != 'miner' && c.memory.role != 'hauler'
        });
        if (needyCreeps.length > 0) {
          const closest = creep.pos.findClosestByPath(needyCreeps);
          if (closest) {
            if (creep.transfer(closest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(closest, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
            }
          }
        } else {
          // Park
          const parkingPos = { x: spawn.pos.x + 5, y: spawn.pos.y + 5 };
          if (!creep.pos.isEqualTo(parkingPos)) {
            creep.moveTo(parkingPos, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 }); // gray
          }
        }
      }
    }
  }
};

const roleUpgrader = {
  /** @param {Creep} creep **/
  run: function (creep) {
    const spawn = Game.spawns['Spawn1'];
    if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
      creep.memory.upgrading = false;
    }
    if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
      creep.memory.upgrading = true;
    }

    let task;
    let pathColor;
    if (creep.memory.upgrading) {
      task = 'Upgrading';
      pathColor = '#8a2be2'; // violet
      if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
      }
    } else {
      // Priority: dropped energy, then containers, then extensions/spawn
      let target = null;
      const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType == RESOURCE_ENERGY
      });
      if (droppedEnergy.length > 0) {
        target = creep.pos.findClosestByPath(droppedEnergy);
        if (target) {
          task = 'Picking Up';
          pathColor = '#ffff00'; // yellow
          if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
          }
        }
      }
      if (!target) {
        const containers = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => structure.structureType == STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0
        });
        if (containers.length > 0) {
          target = creep.pos.findClosestByPath(containers);
          if (target) {
            task = 'Withdrawing';
            pathColor = '#ffff00'; // yellow
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
          }
        }
      }
      if (!target) {
        const structures = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return (structure.structureType == STRUCTURE_EXTENSION ||
              (structure.structureType == STRUCTURE_SPAWN && structure.store[RESOURCE_ENERGY] > 200)) &&
              structure.store[RESOURCE_ENERGY] > 0;
          }
        });
        if (structures.length > 0) {
          target = creep.pos.findClosestByPath(structures);
          if (target) {
            task = 'Withdrawing';
            pathColor = '#ffff00'; // yellow
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
          }
        }
      }
      if (!target) {
        // Park
        task = 'Parking';
        pathColor = '#888888'; // gray
        const parkingPos = { x: spawn.pos.x + 1, y: spawn.pos.y + 5 };
        if (!creep.pos.isEqualTo(parkingPos)) {
          creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      }
    }
    if (creep.memory.lastTask != task) {
      creep.say(task);
      creep.memory.lastTask = task;
    }
  }
};

const roleBuilder = {
  /** @param {Creep} creep **/
  run: function (creep) {
    const spawn = Game.spawns['Spawn1'];
    if (creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
      creep.memory.building = false;
    }
    if (!creep.memory.building && creep.store.getFreeCapacity() == 0) {
      creep.memory.building = true;
    }

    let task;
    let pathColor;
    if (creep.memory.building) {
      // Focus on primary build site if it exists
      let target = Memory.primaryBuildSite ? Game.getObjectById(Memory.primaryBuildSite) : null;
      
      if (target) {
        task = 'Building (Primary)';
        pathColor = '#0000ff'; // bright blue
        if (creep.build(target) == ERR_NOT_IN_RANGE) {
          creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      } else {
        // No primary target, harvest instead
        task = 'Harvesting';
        pathColor = '#ffff00'; // yellow
        const sources = creep.room.find(FIND_SOURCES);
        if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
          creep.moveTo(sources[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      }
    } else {
      // Priority: dropped energy, then containers near sources, then extensions/spawn
      let target = null;
      const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType == RESOURCE_ENERGY
      });
      if (droppedEnergy.length > 0) {
        target = creep.pos.findClosestByPath(droppedEnergy);
        if (target) {
          task = 'Picking Up';
          pathColor = '#ffff00'; // yellow
          if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
          }
        }
      }
      if (!target) {
        const containers = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => structure.structureType == STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0
        });
        if (containers.length > 0) {
          target = creep.pos.findClosestByPath(containers);
          if (target) {
            task = 'Withdrawing';
            pathColor = '#ffff00'; // yellow
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
          }
        }
      }
      if (!target) {
        const structures = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return (structure.structureType == STRUCTURE_EXTENSION ||
              (structure.structureType == STRUCTURE_SPAWN && structure.store[RESOURCE_ENERGY] > 200)) &&
              structure.store[RESOURCE_ENERGY] > 0;
          }
        });
        if (structures.length > 0) {
          target = creep.pos.findClosestByPath(structures);
          if (target) {
            task = 'Withdrawing';
            pathColor = '#ffff00'; // yellow
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
          }
        }
      }
      if (!target) {
        // Park
        task = 'Parking';
        pathColor = '#888888'; // gray
        const parkingPos = { x: spawn.pos.x - 3, y: spawn.pos.y + 5 };
        if (!creep.pos.isEqualTo(parkingPos)) {
          creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      }
    }
    if (creep.memory.lastTask != task) {
      creep.say(task);
      creep.memory.lastTask = task;
    }
  }
};

const roleRepairer = {
  /** @param {Creep} creep **/
  run: function (creep) {
    const spawn = Game.spawns['Spawn1'];
    if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
      creep.memory.repairing = false;
    }
    if (!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
      creep.memory.repairing = true;
    }

    let task;
    let pathColor;
    if (creep.memory.repairing) {
      const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.hits < structure.hitsMax
      });
      if (targets.length) {
        task = 'Repairing';
        pathColor = '#ff0000'; // red
        if (creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      } else {
        // No structures to repair, harvest instead
        task = 'Harvesting';
        pathColor = '#ffff00'; // yellow
        const sources = creep.room.find(FIND_SOURCES);
        if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
          creep.moveTo(sources[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      }
    } else {
      // Priority: dropped energy, then containers near sources, then extensions/spawn
      let target = null;
      const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType == RESOURCE_ENERGY
      });
      if (droppedEnergy.length > 0) {
        target = creep.pos.findClosestByPath(droppedEnergy);
        if (target) {
          task = 'Picking Up';
          pathColor = '#ffff00'; // yellow
          if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
          }
        }
      }
      if (!target) {
        const containers = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => structure.structureType == STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0
        });
        if (containers.length > 0) {
          target = creep.pos.findClosestByPath(containers);
          if (target) {
            task = 'Withdrawing';
            pathColor = '#ffff00'; // yellow
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
          }
        }
      }
      if (!target) {
        const structures = creep.room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return (structure.structureType == STRUCTURE_EXTENSION ||
              (structure.structureType == STRUCTURE_SPAWN && structure.store[RESOURCE_ENERGY] > 200)) &&
              structure.store[RESOURCE_ENERGY] > 0;
          }
        });
        if (structures.length > 0) {
          target = creep.pos.findClosestByPath(structures);
          if (target) {
            task = 'Withdrawing';
            pathColor = '#ffff00'; // yellow
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
            }
          }
        }
      }
      if (!target) {
        // Park
        task = 'Parking';
        pathColor = '#888888'; // gray
        const parkingPos = { x: spawn.pos.x + 2, y: spawn.pos.y + 5 };
        if (!creep.pos.isEqualTo(parkingPos)) {
          creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      }
    }
    if (creep.memory.lastTask != task) {
      creep.say(task);
      creep.memory.lastTask = task;
    }
  }
};

const roleHarvester = {
  /** @param {Creep} creep **/
  run: function (creep) {
    const spawn = Game.spawns['Spawn1'];
    let task;
    let pathColor;
    if (creep.store.getFreeCapacity() > 0) {
      task = 'Harvesting';
      pathColor = '#ffff00'; // yellow
      const sources = creep.room.find(FIND_SOURCES);
      const sourceIndex = creep.memory.sourceIndex % sources.length;
      const source = sources[sourceIndex];
      if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
      }
    } else {
      const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        }
      });
      if (targets.length > 0) {
        task = 'Delivering';
        pathColor = '#000000'; // black
        if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      } else {
        // Park
        task = 'Parking';
        pathColor = '#888888'; // gray
        const parkingPos = { x: spawn.pos.x + (creep.memory.sourceIndex * 2) - 4, y: spawn.pos.y + 5 };
        if (!creep.pos.isEqualTo(parkingPos)) {
          creep.moveTo(parkingPos, { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      }
    }
    if (creep.memory.lastTask != task) {
      creep.say(task);
      creep.memory.lastTask = task;
    }
  }
};

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
