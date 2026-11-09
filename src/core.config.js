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
    // Automatically claim rooms in the grid around the first room whenever
    // GCL allows (see mgr.expansion). Flags named `claim...` always work too.
    auto: true,
    gridRadius: 1, // 1 = 3x3 grid (8 neighbours), 2 = 5x5
    // A colony needs this RCL (and 650 energy capacity) to send claimers and
    // pioneers, and must be within this linear room distance of the target.
    minSupportRcl: 3,
    maxDistance: 10,
    pioneers: 3,
    scoutInterval: 3000, // re-scout grid rooms after this many ticks
    unreachableRetry: 20000, // re-check rooms a scout couldn't reach
    claimTimeout: 5000, // give up a target if not claimed in time
    maxClaimers: 3, // ...or after this many claimers failed to claim it
    failedRetry: 10000, // ...and try that room again after this long
  },
};
