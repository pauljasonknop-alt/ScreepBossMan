# Screeps AI Code Report - March 17, 2026

## Overview
This report documents the current state of the Screeps AI codebase in the `c:\ScreepsProjects` workspace. The AI is designed for a single-room base that automatically progresses through stages based on controller level, optimizing energy flow, creep roles, and infrastructure. The code is modular, with roles in separate files, and focuses on efficiency, no downtime, and scalability.

The main game code is in `src/`, which gets uploaded to Screeps. This report file is in the root directory and will not be pushed to the game, serving as a learning and tracking tool.

## Current Codebase Structure

## Current Codebase Structure

### main.js
**Location:** `src/main.js`  
**Purpose:** The main game loop that handles spawning, stage management, auto-infrastructure, emergency logic, and creep execution.  
**Key Features:**
- Cleans up dead creep memory.
- Determines stage based on controller level (stored in Memory for continuity).
- Auto-builds containers near sources at stage 2+ (adjacent positions, avoiding walls).
- Filters creeps by role.
- **Spawns creeps with balanced load distribution:**
  - Miners: 2 per source (WORK, WORK, MOVE) - Harvest into containers, distributed evenly.
  - Haulers: 1 per miner (CARRY, CARRY, MOVE, MOVE) - Transport energy from assigned source, no wasted waiting.
  - Builders: 3 (WORK, CARRY, MOVE) - Build structures one at a time.
  - Upgraders: 2 (WORK, CARRY, MOVE) - Upgrade controller.
  - Repairers: 1 at stage 2+ (WORK, CARRY, MOVE) - Repair structures.
- Tracks **primary build site** in Memory; all builders focus on one target until complete.
- Emergency harvester spawn if no miners/haulers and low energy income (checks time since last energy tick >50).
- Runs all creeps via their role modules.
- **Reports every 10 ticks:** Energy, stage, creep counts by role, distribution by source, current building target & progress, CPU usage.

**Recent Changes:** Updated to 2 miners per source with 1 hauler per miner; implemented primary build site targeting system; added Game.time to console reports; updated emergency harvester logic to spawn only when no miners exist and die out naturally once miners are available.

### role.miner.js
**Location:** `src/role.miner.js`  
**Purpose:** Controls miner creeps that harvest energy from sources efficiently.  
**Logic:**
- Assigned to a specific source via memory.sourceId (auto-assigned if missing).
- **Simply harvests directly at source** - no waiting for containers to appear.
- Moves to source if not in range, harvests when in range.
- Path visualization: Yellow, with reusePath.
- Auto-bootstraps to any source if sourceId is invalid.

**Recent Changes:** Removed unnecessary container/construction site lookups; miners now harvest immediately at source position.

### role.hauler.js
**Location:** `src/role.hauler.js`  
**Purpose:** Transports energy from sources to spawn and extensions efficiently.  
**Logic:**
- Assigned to a specific source via memory.sourceId (auto-assigned if missing).
- **Priority 1:** If dropped energy exists anywhere → pick up nearest one.
- **Priority 2:** If no dropped energy → commit to assigned source and wait for miners to drop energy (stays in 2-tile range).
- Once full, delivers to spawn/extensions.
- If spawn/extensions are full, delivers to needy creeps or parks.
- Path visualization: Yellow (picking up), Blue (moving to source), Black (delivering), Gray (parking).
- Prevents creeps from bouncing between sources; they commit to one source.

**Recent Changes:** Changed to commit to assigned source when no dropped energy exists; removed container lookup.

### role.upgrader.js
**Location:** `src/role.upgrader.js`  
**Purpose:** Upgrades the controller to increase room level.  
**Logic:**
- Withdraws energy from dropped > containers > extensions/spawn.
- Upgrades controller.
- Says "Upgrading".
- Path visualization: Purple, with reusePath.
- Parks at controller if idle.

**Recent Changes:** Prioritized energy sources.

### role.builder.js
**Location:** `src/role.builder.js`  
**Purpose:** Builds construction sites efficiently with focus on one target at a time.  
**Logic:**
- Uses `Memory.primaryBuildSite` to track which site all builders work on.
- Focuses all builder energy on the primary target until complete.
- Falls back to harvesting if no sites remain.
- Says "Building (Primary)" to indicate focused work.
- Path visualization: Blue, with reusePath.

**Recent Changes:** Implemented primary build site targeting to prevent wasted effort on multiple sites simultaneously.

### role.repairer.js
**Location:** `src/role.repairer.js`  
**Purpose:** Repairs damaged structures.  
**Logic:**
- Finds structures needing repair (walls/ramparts below 100k hits, others below max).
- Repairs if energy available; else withdraws from dropped > containers > extensions/spawn.
- Says "Repairing" or "Harvesting".
- Path visualization: Orange, with reusePath.
- Parks at spawn if idle.

**Recent Changes:** Prioritized energy sources.

### role.harvester.js
**Location:** `src/role.harvester.js`  
**Purpose:** Emergency harvesting (WORK, CARRY, MOVE).  
**Logic:**
- Harvests from assigned source.
- Transfers to spawn/extensions.
- Says "Harvesting".
- Path visualization: White, with reusePath.

**Notes:** Used only in emergencies when no miners/haulers.

## Tasks Completed
- **Basic AI Setup:** Initial harvesters, upgraders, builders.
- **Efficiency Upgrade:** Switched to miners (harvest-only) and haulers (transport-only) for faster energy flow.
- **Role Additions:** Repairers at controller level 2.
- **Staged Progression:** Automatic role counts based on controller level.
- **Path Optimizations:** Reuse paths, parking when idle, visualize paths with colors.
- **Emergency Logic:** Spawn harvesters if no income for 50 ticks.
- **Energy Priorities:** All roles now prioritize dropped energy > containers > spawn/extensions.
- **Auto-Infrastructure:** Containers auto-built near sources at level 2+.
- **Load Balancing:** Source-based distribution to eliminate congestion; miners/haulers assigned to specific sources.
- **Optimized Mining:** 2 miners per source, 1 hauler per miner for no-waste energy collection.
- **Focused Building:** Primary build site targeting so all builders work on one structure until complete.
- **Console Logging:** Detailed reports every 10 ticks with source distribution and current building target.

## Current Focus (What's Being Done)
- Fixed miners and haulers to work without containers (immediate harvesting and collection).
- Fixed haulers to commit to assigned sources when no dropped energy (prevents bouncing).
- Harvesters now die out naturally once miners are spawned (emergency only when miners=0).
- Console reports now show Game.time for tracking progression.

## Future Tasks (What Will Be Done)
- **Storage Usage:** At higher levels (e.g., 4+), use storage for energy instead of containers.
- **Defenders:** Add defenders at controller level 3 for room defense.
- **Remote Harvesting:** Expand to adjacent rooms for more energy.
- **Advanced Roles:** Scouts, claimers for expansion.
- **Optimization:** CPU/memory monitoring, dynamic creep counts based on energy income.
- **Error Handling:** Better checks for pathing failures, structure availability.
- **Learning Goals:** Understand Screeps API (Game, Memory, structures), pathfinding, energy management, modular coding.

## Key Concepts for Learning
- **Energy Flow:** Miners drop into containers → Haulers transport → Delivered to spawn/creeps.
- **Stages:** Controller level drives progression (roles, infrastructure).
- **Memory:** Persistent data for creeps, stages, tracking.
- **Pathfinding:** moveTo with options for reuse, visualization.
- **Priorities:** Always check energy sources in order: dropped > containers > structures.
- **Emergency Measures:** Prevent downtime with fallbacks.
- **Infrastructure:** Auto-build to prevent energy decay.

This report will be updated as the codebase evolves. Use it to track progress and learn Screeps mechanics!</content>
<parameter name="filePath">CODE_REPORT.md