// this is the start of something wonderfull
// first commit on 17-03-2026 to screeps game

// Define roles
const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');

module.exports.loop = function () {
    // Clean up memory
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Spawn creeps
    const harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
    const builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');

    const spawn = Game.spawns['Spawn1'];

    // Desired counts
    const desiredHarvesters = 4;
    const desiredUpgraders = 2;
    const desiredBuilders = 3;

    // Spawn harvesters
    if (harvesters.length < desiredHarvesters) {
        const newName = 'Harvester' + Game.time;
        spawn.spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'harvester', sourceIndex: harvesters.length } });
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

    // Run creeps
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.memory.role == 'harvester') {
            roleHarvester.run(creep);
        }
        if (creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
        }
        if (creep.memory.role == 'builder') {
            roleBuilder.run(creep);
        }
    }

    // Reports
    if (Game.time % 10 == 0) { // Every 10 ticks
        console.log('=== Game Report ===');
        console.log('Energy available:', Game.spawns['Spawn1'].room.energyAvailable + '/' + Game.spawns['Spawn1'].room.energyCapacityAvailable);
        console.log('Harvesters:', harvesters.length + '/' + desiredHarvesters);
        console.log('Upgraders:', upgraders.length + '/' + desiredUpgraders);
        console.log('Builders:', builders.length + '/' + desiredBuilders);
        console.log('Total creeps:', Object.keys(Game.creeps).length);
        console.log('Controller level:', Game.spawns['Spawn1'].room.controller.level);
        console.log('===================');
    }
};
