# FDS-009 — Collision and isometric depth

## One authoritative path

`Player.update` samples CombinedInput once, calls the existing pure `movePlayer`
once, then synchronizes PlayerView. `movePlayer` retains FDS-005 normalization,
analog strength, 3 cells/second speed, 50ms delta cap, map edge clamp and Kahan
integration. It now resolves the proposed grid position against static footprints
before returning state. Facing, Idle/Walk and rendering use the resolved movement.
Keyboard and joystick do not own separate collision or velocity implementations.
CameraController and the FDS-003 projection are unchanged.

Pure ground-plane geometry is appropriate because col/row are orthonormal
gameplay axes. Arcade bodies would add a second position writer in projected
pixel space; this implementation does not add physics bodies or dependencies.

## Tiled contract

The existing nine point objects in the Obstacles layer remain the only runtime
obstacle source (6 trees, 3 rocks). Positions and original graphics do not change.
Every object has a unique positive integer id, col/row and these custom properties:

| Property | Tiled type | Meaning |
| --- | --- | --- |
| collisionShape | string | `grid-aabb` |
| collisionWidth | float | Full extent along col, in ground cells |
| collisionDepth | float | Full extent along row, in ground cells |

Trees use 0.36×0.36, rocks 0.7×0.7, centered at `(col+0.5,row+0.5)`.
These are deliberately small trunk/base footprints, not canopy or image bounds.
The prototype adapter validates finite positive extents up to one cell, ids,
property uniqueness and the original Tiled object coordinate contract. Missing
or malformed metadata fails visibly instead of silently disabling collision.
The regeneration script writes the same metadata; runtime has no duplicate
hardcoded obstacle coordinate list.

`obstacleColliders` converts normalized objects to GridCollider AABBs. The pure
geometry supports larger rectangles; this prototype's importer remains limited
to the two existing object kinds. No building definitions/placement are added.

## Contact, sliding, time and spawn

- Player footpoint is the center of a 0.36×0.36 square ground footprint
  (half extent 0.18). Its sprite origin and projected footpoint remain unchanged.
  The map inset 0.25 still keeps that footprint inside the map.
- Expand each obstacle by the player's half extent (Minkowski AABB), then sweep
  the footpoint along col to nearest contact, followed by row. Each axis checks
  the entire segment rather than testing only the endpoint. The unblocked axis
  slides without renormalizing the remaining velocity or boosting its speed.
- Exact touching is permitted. A 1e-10-cell tolerance suppresses contact noise;
  it is not a speed/position rounding grid. No retries or unbounded push loops.
- Col-first sliding has a small directional bias and corner paths can depend
  on frame partition. It is not a continuous circular-body rigid-body solver.
  Under the existing 50ms cap, maximum travel is 0.15 cells per update. The
  swept axis segments also prevent tunneling through very thin rectangles.
- Delta stalls still discard excess time. Invalid/zero delta or input stops
  normally. Obstacle contact resets compensated error only on clipped axes;
  unobstructed precision and speed remain identical to FDS-005.
- A spawn/state already penetrating an expanded collider is rejected immediately
  with a descriptive error, even with zero input. There is no implicit teleport
  or indefinite depenetration loop. Correct the authored spawn/map data. Scene
  reports the failure and does not run an overlapping controllable Player.
- A fully blocked movement becomes Idle; a tangent slide stays Walk. Releasing
  input stops immediately; retreating from contact is allowed.

## Rendering and depth

ObstacleRenderer draws the original geometric art once per obstacle, as separate
named Graphics objects. Ground/Detail stay at -2/-1. Player and obstacles retain
their **actual world foot-Y** as public depth, never sprite-top depth. PlayerView
calls setDepth only when that Y changes; objects are not reconstructed each frame.

The installed Phaser 4 DisplayList.depthSort uses its public sortByDepth method.
The scene installs a comparator that sorts foot-Y into 1/1024-pixel buckets,
then breaks ties by obstacle id order, with Player after obstacles. Only the sort
key is quantized; logical/world position and public depth stay exact. This avoids
floating-point flicker and produces a transitive order (unlike pairwise epsilon
comparisons). The comparator is restored on shutdown/destroy and its listeners
are removed, so restarts do not stack comparator wrappers.

The current upright tree/rock graphics support this whole-object footpoint
sorting. No canopy splitting, alpha fading or physics-sized canopy is needed.
Large future overhangs or multi-cell structures may need separate render parts.

## Verification — 2026-11-06

- **227 unit tests PASS**, 37 new tests plus an existing PlayerView test extended
  to assert unchanged depth is not updated. Coverage includes authored metadata,
  all 9 obstacles, four-sided contact, canopy/base distinction, diagonal sliding,
  thin/nearest obstacles, large/invalid delta, 10,000-frame precision/contact,
  edge movement, overlap rejection, zero input, 5,000 seeded random steps,
  keyboard/joystick integration, before/after/near-equal Y and comparator cleanup.
- `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test`,
  `pnpm.cmd run build`, `git diff --check` pass.
- localhost:8080 real Game scene via `/tests/keyboard.html`: actual keyboard D
  approaches a tree and rock; contact clamps col to 4.14 and 8.97 respectively
  while row slides. Sustained holds then go around the base. 247 observed update
  frames across those two runs have zero penetrations; release returns Idle.
- CDP touch emulation: dragging joystick toward rock produces the same contact
  at col 8.97, then slides; 60 observed frames have zero penetrations; release
  returns Idle and clears pointer ownership. This is not real-phone QA.
- Native renderer snapshotPixel at tree world `(928,168)` changes from canopy
  RGB (36,78,60) with Player behind to sprite RGB (226,163,104) with Player in
  front. Display list order agrees. Equal-Y tests approached from both sides
  keep Player after the tree. This verifies rendered occlusion, not only JSON.
- Repeating the same collision trace at zoom 0.5 and 3 returns exactly the same
  grid position. Camera still follows the footpoint. All **260** FDS-008 native
  camera assertions continue to pass, including pointer-to-grid transforms.
- Four live restarts keep 9 named obstacles, 18 shutdown listeners, one keyboard
  listener, four scale resize listeners and one camera overlay. Counts include
  Phaser's own listeners; they do not increase per restart.
- Default root reload: one canvas; no captured JavaScript/console errors or HTTP
  errors. Phaser 4.0.0, Vite 6.4.5 and TypeScript 5.7.3 remain unchanged.

QA fixtures reseed a valid state using createPlayer only in the separately loaded
development test module; production has no teleport/debug entry point. Reproduce
with `keyboardCheck.placeNearObstacle('tree')`, `stepCollisionKeys(['KeyD'])`,
`collisionSnapshot()` and `sampleTreePixel()` on the keyboard test page. Real
keyboard/touch hold tests additionally used browser input events and frame watches.

## Limits

Real iOS/Android, Safari/Firefox, hardware safe areas, prolonged device performance
and hosted CI are unverified. Full visual review around every canopy edge on
target devices is still recommended; automated render samples cover one tree's
front/back occlusion, while unit tests exercise every authored footprint. Colliders
are static, axis-aligned on the ground plane, with no moving-body collisions.
FDS-009 itself added no combat, building, farming, inventory or backend.
FDS-010 now reuses this geometry and depth policy for one Slime; see
[Monster AI](./MONSTER-AI.md).
