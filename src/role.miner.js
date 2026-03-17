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

module.exports = roleMiner;