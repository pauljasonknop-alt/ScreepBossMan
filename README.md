# ScreepBossMan

A from-scratch Screeps bot built around colonies, managers and data-driven
spawning. It's plain JavaScript with no build step, and it runs on the official
server or a private one.

## Quick start

```powershell
.\deploy.ps1                # copy src/ to the local server (127.0.0.1:21025)
.\test\run.ps1 20000        # simulate 20k ticks offline before deploying
```

The Screeps client watches its script folder and uploads changes on its own.
Pass `-Server screeps.com` (or another folder name under
`%LOCALAPPDATA%\Screeps\scripts`) to deploy somewhere else.

## How a tick runs (`main.js`)

1. **Housekeeping.** Dead creep memory is cleared. One `Colony` per owned room
   is refreshed, and each creep is assigned to its colony (`memory.home`).
2. **Defense, towers, links.** These always run.
3. **Planner.** Places construction sites every 50 ticks and right after an
   RCL change. Skipped when the CPU bucket is low.
4. **Spawning.** Every role says what it needs, and the most important request
   is spawned.
5. **Creeps.** Run in role-priority order. Upgraders and builders give up their
   turn when CPU is tight.
6. **HUD.** A room overlay, plus a console summary every 100 ticks.

Every step runs inside its own `try/catch`, so one broken room or creep can't
stop the rest.

## Files

The Screeps module system has no folders, so prefixes group the files.

| File | Purpose |
|------|---------|
| `core.config.js` | **All tunables.** Start here. |
| `core.cache.js` | Per-tick and heap caches (structures by type/position) |
| `core.move.js` | `travelTo`: PathFinder with cached paths and cost matrices, stuck detection, avoids hostile rooms |
| `core.energy.js` | Pickup and delivery with claims, so creeps don't chase the same target |
| `core.body.js` | Body builder (`build(pattern, energy, {prefix, maxRepeat})`) |
| `core.log.js` | Logging, error throttling, `safe()` wrapper |
| `colony.js` | Owned-room wrapper: sources, planned containers/links, creep counts, income, threats |
| `mgr.spawn.js` | Collects `want()` requests from roles and spawns by priority |
| `mgr.planner.js` | Base layout and construction sites |
| `mgr.tower.js` | Focus fire, then heal, then repair (keeps an energy reserve) |
| `mgr.link.js` | Source links → controller link / storage link |
| `mgr.defense.js` | Safe mode when spawn/towers/storage are in danger |
| `mgr.expansion.js` | Flag-driven claiming |
| `mgr.hud.js` | Overlay and console report |
| `roles.js` | Role registry (also the execution order) |
| `role.*.js` | `miner`, `hauler`, `filler`, `upgrader`, `builder`, `worker`, `defender`, `claimer` |

### Economy

- **Miners** sit on the source container: 5 WORK, plus 1 CARRY once a source
  link exists.
- **Haulers** are sized by maths, not fixed counts: carry parts =
  income × round trip × 1.2.
- **Before storage:** haulers fill spawns and extensions, then the controller
  container. Builders and upgraders may use spare spawn energy when nothing is
  queued.
- **Once storage exists:** a **filler** keeps spawns, extensions and towers
  full, haulers bank energy in storage, and upgraders scale with income plus
  any surplus above the storage reserve.
- **From RCL 5:** links carry source energy to the controller and storage, and
  haulers fade out.

### Base plan

The planner anchors on your first spawn and lays out a checkerboard:
structures on one tile parity, roads on the other. Structure slots are
discovered outward from the spawn, so everything is road-connected and the
most important buildings get the closest slots. It then plans roads from
storage to each source, the controller and the mineral, with containers and
links at the ends.

Buildings that already exist are kept and counted toward RCL limits; nothing
is ever destroyed.

To re-plan a room: `delete Memory.rooms.W1N1.plan`. To see the plan, set
`visuals.plan: true` in config.

## Expanding to a new room

Place a flag named `claim` (or `claim2`, `claimFoo`, …) in the target room.
The nearest colony at RCL ≥ 3 sends a claimer, then pioneer workers that build
the new spawn. The flag removes itself when the spawn is done. You need a free
GCL slot.

## Adding a role

1. Create `role.foo.js` exporting `run(creep, colony)`, and optionally
   `want(colony)`, which returns spawn requests
   (`{role, priority, body: (energy) => parts, memory, emergency}`).
2. Add it to `roles.js`.

## Offline simulator

`test/sim.js` is a small mock of the game engine. It's not exact (no fatigue,
one room), but it catches crashes, Memory serialization bugs and economic
stalls.

```powershell
.\test\run.ps1 40000                                      # RCL 1 -> 4
.\test\run.ps1 60000 --fast 25                            # through RCL 7 (faster controller progress)
.\test\run.ps1 15000 --reset-every 500 --invader-at 9000 --legacy
.\test\run.ps1 plan                                       # ASCII base plan
```

Set `$env:DUMP=15000` before running to print every creep's state at that tick.

## Roadmap

- Remote mining in neighbouring rooms (reservers, remote miners and haulers)
- Ramparts around the core, and wall repair by builders
- Labs, boosts and mineral mining (extractor and container are already planned)
- Terminal energy balancing and market
- Automatic expansion target scoring
