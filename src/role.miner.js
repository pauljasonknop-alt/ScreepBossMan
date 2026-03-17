const roleMiner = {

  /** @param {Creep} creep **/
  run: function (creep) {
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
      }
    }
    // Miners drop energy automatically
  }
};

module.exports = roleMiner;