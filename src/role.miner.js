const roleMiner = {

  /** @param {Creep} creep **/
  run: function (creep) {
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      // Find container near source
      const containers = source.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER });
      // Find construction site for container near source
      const containerSites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: s => s.structureType == STRUCTURE_CONTAINER });
      let targetPos = source.pos;
      if (containers.length > 0) {
        targetPos = containers[0].pos;
      } else if (containerSites.length > 0) {
        targetPos = containerSites[0].pos;
      }
      if (creep.pos.isEqualTo(targetPos)) {
        creep.harvest(source);
      } else {
        creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 10 }); // yellow
      }
    }
    // Miners drop energy automatically at their position
  }
};

module.exports = roleMiner;