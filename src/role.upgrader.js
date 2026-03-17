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

module.exports = roleUpgrader;