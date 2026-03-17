const roleHauler = {

  /** @param {Creep} creep **/
  run: function (creep) {
    const spawn = Game.spawns['Spawn1'];
    const source = Game.getObjectById(creep.memory.sourceId);
    
    if (creep.store.getFreeCapacity() > 0) {
      // Priority 1: Dropped energy near assigned source
      const droppedNearSource = source ? creep.pos.findInRange(FIND_DROPPED_RESOURCES, 10, {
        filter: (r) => r.resourceType == RESOURCE_ENERGY && r.pos.inRangeTo(source, 5)
      }) : [];
      
      // Priority 2: Energy in containers near assigned source
      const containersNearSource = source ? source.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      }) : [];
      
      // Priority 3: Dropped energy anywhere
      const droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (r) => r.resourceType == RESOURCE_ENERGY
      });
      
      let target = droppedNearSource.length > 0 ? droppedNearSource[0] : null;
      if (!target && containersNearSource.length > 0) {
        const closest = creep.pos.findClosestByPath(containersNearSource);
        if (closest) {
          if (creep.withdraw(closest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(closest, { visualizePathStyle: { stroke: '#0088ff' }, reusePath: 10 }); // blue
            return;
          }
        }
      }
      if (!target && droppedEnergy.length > 0) {
        const closest = creep.pos.findClosestByPath(droppedEnergy);
        target = closest;
      }
      
      if (target) {
        if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
          creep.moveTo(target, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
        }
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