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

  // Spawn creeps
  const miners = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');
  const haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
  const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
  const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
  const repairers = _.filter(Game.creeps, (creep) => creep.memory.role == 'repairer');

  const sources = spawn.room.find(FIND_SOURCES);

  // Desired counts based on stage
  const desiredMiners = Math.min(2, sources.length);
  const desiredHaulers = 4;
  const desiredUpgraders = 2;
  const desiredBuilders = 3;
  const desiredRepairers = stage >= 2 ? 1 : 0;

  // Emergency harvester if no miners or haulers
  if (miners.length == 0 && haulers.length == 0 && spawn.energy >= 200) {
    const newName = 'EmergencyHarvester' + Game.time;
    spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'harvester', sourceIndex: 0 } });
  }

  // Spawn miners
  if (miners.length < desiredMiners) {
    const sourceIndex = miners.length;
    const newName = 'Miner' + Game.time;
    spawn.spawnCreep([WORK, WORK, MOVE], newName, { memory: { role: 'miner', sourceId: sources[sourceIndex].id } });
  }
  // Spawn haulers
  else if (haulers.length < desiredHaulers) {
    const newName = 'Hauler' + Game.time;
    spawn.spawnCreep([CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'hauler' } });
  }
  // Spawn upgraders
  else if (upgraders.length < desiredUpgraders) {
    const newName = 'Upgrader' + Game.time;
    spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'upgrader' } });
  }
  // Spawn builders
  else if (builders.length < desiredBuilders) {
    const newName = 'Builder' + Game.time;
    spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'builder' } });
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
  if (Game.time % 50 == 0) { // Every 50 ticks
    console.log('=== Game Report ===');
    console.log('Energy available:', spawn.room.energyAvailable + '/' + spawn.room.energyCapacityAvailable);
    console.log('Stage:', stage);
    console.log('Miners:', miners.length + '/' + desiredMiners);
    console.log('Haulers:', haulers.length + '/' + desiredHaulers);
    console.log('Upgraders:', upgraders.length + '/' + desiredUpgraders);
    console.log('Builders:', builders.length + '/' + desiredBuilders);
    console.log('Repairers:', repairers.length + '/' + desiredRepairers);
    console.log('Total creeps:', Object.keys(Game.creeps).length);
    console.log('Controller level:', stage);
    console.log('CPU used:', Game.cpu.getUsed());
    console.log('Memory size:', RawMemory.get().length);
    console.log('===================');
  }
};
