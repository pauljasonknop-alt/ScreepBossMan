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
      const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          return (structure.structureType == STRUCTURE_EXTENSION ||
            (structure.structureType == STRUCTURE_SPAWN && structure.store[RESOURCE_ENERGY] > 200)) &&
            structure.store[RESOURCE_ENERGY] > 0;
        }
      });
      if (targets.length > 0) {
        task = 'Withdrawing';
        pathColor = '#ffff00'; // yellow
        if (creep.withdraw(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], { visualizePathStyle: { stroke: pathColor }, reusePath: 10 });
        }
      } else {
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