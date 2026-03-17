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

module.exports = roleHauler;