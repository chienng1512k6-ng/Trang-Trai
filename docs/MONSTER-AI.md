# FDS-010 — Green Slime AI

## Modules and authority

- `src/core/monster.ts`: immutable FSM/state, config, seeded randomness and hooks.
- `src/core/monsterPath.ts`: bounded waypoint planning in the existing grid plane.
- `src/game/Monster.ts`: entity lifecycle and MonsterView animation/render adapter.
- `Game` loads the original atlas, creates one Slime, updates it once after Player
  each frame and destroys it on scene shutdown. No per-enemy timers/listeners.

Slime's body deliberately reuses FDS-005 `createPlayer`/`movePlayer` and their
PlayerState physical state shape. Despite those existing names, no keyboard,
Player Entity or camera is attached to the body. Direction magnitude is scaled
by desired speed / PLAYER_SPEED (the existing analog input contract). Thus there
is one movement/collision implementation, not an Arcade body or a competing
position writer. Configured monster speeds must be positive and at most the
existing 3-cell/second movement ceiling. Player source/behavior is unchanged.

Distances are Euclidean in orthonormal logical col/row cells. Position is the
continuous footpoint, projected with FDS-003 gridToWorld. Camera pixels do not
participate in targeting, navigation or movement.

## Default configuration

| Parameter | Default |
| --- | --- |
| Enemy count | One entity created by the scene |
| Spawn | (22.5,16.5), initially 6 cells from Player |
| Wander / chase / return speed | 0.8 / 1.8 / 1.2 cells per second |
| Detection / disengage | <=4 / >6 cells |
| Leash radius / wander radius | 8 / 3 cells from spawn |
| Idle delay | Seeded random 1000–3000ms |
| Seed | 104729 |
| Replan interval / moved-target threshold | 500ms / 0.5 cells |
| Blocked timeout / HIT duration | 2000ms / 300ms |
| Arrival tolerance | 0.025 cells |
| Wander destination attempts | 8, configurable up to 32 |

Config is validated at creation. RNG seed is part of immutable state; no global
Math.random or Phaser timer is used. Equal state, inputs and seed replay equally.
Both movement and timers use FDS-005's valid-delta policy: cap at 50ms, discard
stall excess, ignore nonpositive/nonfinite delta. Normal movement partitions
agree within floating-point tolerance. Transitions are evaluated on frame
boundaries; this is not a claim of sub-frame identical FSM timestamps.

## State transitions

- IDLE waits, then chooses a clear bounded destination and enters WANDER.
- IDLE/WANDER enters CHASE at detection range if the target is within the spawn
  leash. WANDER arrival returns to IDLE; after waiting away from home, RETURN
  brings the Slime back before another excursion.
- CHASE remains active in the 4–6-cell hysteresis band. Missing/invalid target,
  distance >6, or target leaving the spawn leash causes RETURN. It idles in place
  upon reaching the target; there is no attack or damage event.
- RETURN ignores detection until it reaches the home region, then enters IDLE.
  Movement proposals are also rejected if they would exceed the spawn leash.
- Internal `event('HIT')` immediately stops movement; after 300ms it enters RETURN.
  Internal `event('DEAD')` stops movement permanently and is absorbing. These
  are preparation hooks only: no HP, damage, hitbox, attack, loot or health bar.

## Obstacles and bounded navigation

The Slime uses the same 0.36×0.36 ground footprint and 0.25 map inset as Player.
Obstacles come from the FDS-009 Tiled adapter; neither source geometry nor the
collision resolver is rewritten. Spawn overlapping any expanded footprint fails.

A direct route is tested with short segments through the existing resolver. If
blocked, four-neighbor BFS searches at most 32×32 grid-center nodes, confined to
the leash and map bounds. Fractional start/target points connect to nearby clear
nodes. The route is consumed waypoint by waypoint; unchanged goals keep their
route instead of replanning/reversing at every frame. Moving chase targets can
replan at most every 500ms after moving more than 0.5 cells. Failed searches also
respect that cooldown. Each actual step still passes through movePlayer's swept
collision resolver; no planner result can bypass runtime collision.

No progress for two seconds causes CHASE -> RETURN. Failed WANDER/RETURN yields
to seeded IDLE delay; an away-from-home idle retries RETURN afterward. This is
bounded retry/backoff, not teleportation or a promise to escape a sealed area.
The static prototype map has navigable routes around its nine isolated obstacles.
There is no line-of-sight requirement, dynamic-body avoidance or optimal path
smoothing. Four-neighbor detours can look angular. Slime may overlap Player at
its destination because actor-vs-actor collision/combat is not part of this task.

## Rendering and assets

The original project-owned atlas is `public/assets/monsters/green-slime.png`:
8 frames of 32×32, footpoint (16,28), display scale 1.5. Idle uses frames 0–1,
move 2–5; HIT/DEAD use static visual frames 6/7. Animations register once, and
sync changes animation/depth only when needed. One sprite survives all updates.

Public depth remains exact world foot-Y. Existing FDS-009 sorting handles
occlusion, with deterministic equal-depth order obstacles -> Slime -> Player.
Camera continues to follow Player only. Source, author and MIT terms are in
[asset attribution](../apps/game/public/assets/ATTRIBUTION.md). Regenerate only
this new atlas with `node apps/game/tools/generate-slime.mjs`.

## Verification — 2026-11-06

- **264 unit tests PASS**, including **37 new** FSM/navigation/view tests.
  Coverage includes all states, detection thresholds, hysteresis, leash, seeded
  replay, invalid config/spawn/deltas, normal frame partitions, tree/rock routes,
  map edges, thin-wall tunneling, blocked timeout and unreachable-home backoff,
  animation/depth and fresh lifecycle. All 227 prior tests remain passing.
- Root `pnpm.cmd run lint`, `typecheck`, `test`, `build` and `git diff --check`
  pass. `node apps/game/tools/generate-slime.mjs` generated the original atlas.
- localhost:8080 actual WASD S+D approach changed IDLE -> CHASE, with move
  animation and camera still following Player. A QA-only valid target reseed
  far away produced RETURN then IDLE within 0.025 cells of spawn.
- Scene diagnostic stepped 500 real entity updates around a tree and a rock;
  both reached the target without penetration. Far-target stepping exercised
  IDLE/WANDER, and native animation advanced from frame 2 to frame 4.
- Renderer snapshotPixel at zoom 0.5 verified behind-tree canopy RGB (36,78,60)
  and front Slime RGB (61,157,63); trunk sample switched from brown (99,72,46)
  to Slime green (117,206,80). Samples are checked to be inside the viewport.
- Identical seeded traces at zoom 0.5 and 3 produced exactly identical grid
  positions. All 260 FDS-008 real Camera assertions remain passing.
- CDP touch joystick moved Player while Slime updated independently; release
  returned Player to Idle. 568×320 and 844×390 landscape and 390×844 portrait
  retained camera/controls; portrait prompt still appears, with no forced lock.
- Four restarts retained one Slime, nine obstacles, 19 shutdown listeners,
  one keyboard listener and four scale resize listeners. Native animation keys
  are reused. Default root reload: one canvas; no captured console/JS or HTTP
  errors, including the new PNG. No dependency/version changes or Git push.

The browser fixture `/tests/keyboard.html` imports development diagnostics only;
it is absent from the production entry imports. It exposes `monsterSnapshot`,
`resetMonster`, `placePlayerForMonster`, `stepMonster`, and internal hook calls.
Fixture reseeding is not a production teleport/debug system. No overlay is
enabled in production by default.

Real-device iOS/Android, Safari/Firefox, long-duration performance and hosted CI
remain unverified. Phone emulation is not real-device QA. Target switches and
navigation have only been validated for one enemy and the current static map.
No FDS-011 combat functionality is implemented.
