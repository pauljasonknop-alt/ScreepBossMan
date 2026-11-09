'use strict';

/**
 * All tunables live here. Nothing else should hard-code numbers that you may
 * want to tweak while watching the bot play.
 */
module.exports = {
  // Player names never treated as hostile (towers/defenders ignore them).
  allies: [],

  // Controller sign. Set to '' to disable signing.
  signText: '',

  log: {
    reportInterval: 100, // console summary per colony every N ticks (0 = off)
    errorThrottle: 50, // the same error is printed at most once per N ticks
  },

  visuals: {
    hud: true, // per-room overlay with RCL, energy, creep counts
    plan: false, // draw the base plan (handy when tuning the planner)
    paths: false, // draw creep travel paths
  },

  cpu: {
    // Below this bucket, low-priority creeps (builders/upgraders) skip a turn
    // when the tick is already over budget.
    lowBucket: 2000,
    // Planner/construction is skipped while bucket is below this.
    plannerMinBucket: 1000,
  },

  movement: {
    plainCost: 2,
    swampCost: 10,
    roadCost: 1,
    stuckRepath: 2, // ticks without progress before repathing around creeps
    matrixTtl: 50, // ticks a cached room cost matrix stays valid
  },

  planner: {
    interval: 50, // ticks between construction-site checks
    maxSitesPerRoom: 4, // keep builders focused instead of spreading out
    minRclForRoads: 3,
    minRclForContainers: 2,
  },

  economy: {
    // Storage energy held back for defense/emergencies before upgraders scale.
    storageReserve: 30000,
    // Each extra WORK part on upgraders requires this much stored energy.
    storagePerUpgradeWork: 5000,
    maxUpgradeWork: 40, // RCL < 8 (RCL 8 is capped by the game at 15)
    // Share of source income (energy/tick) turned into upgrader WORK parts.
    // Halved while construction sites exist (builders need the energy).
    upgradeShare: 0.7,
  },

  tower: {
    repairMinEnergy: 0.5, // only repair while tower is above this fill ratio
    repairBelow: 0.6, // repair roads/containers below this hits ratio
    // Ramparts/walls are topped up to this many hits per RCL by towers.
    wallHitsPerRcl: 10000,
  },

  defense: {
    safeMode: true,
  },

  expansion: {
    // Flags named `claim...` mark rooms to claim. The nearest colony with at
    // least this RCL and within this linear distance supports it.
    minSupportRcl: 3,
    maxDistance: 10,
    pioneers: 3,
  },
};
