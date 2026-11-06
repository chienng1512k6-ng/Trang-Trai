# FDS-005 — Player character and movement

## Modules

- [core/player.ts](../apps/game/src/core/player.ts): immutable state, spawn,
  pure movement and FDS-003 projection. No Phaser import.
- [input.ts](../apps/game/src/game/player/input.ts): device-independent sample
  interface; its neutral implementation returns zero. FDS-006 connects a keyboard
  adapter in the Game scene.
- [Player.ts](../apps/game/src/game/player/Player.ts): composes input, pure
  update and rendering. Scene only preloads, constructs, updates and destroys it.
- [PlayerView.ts](../apps/game/src/game/player/PlayerView.ts): spritesheet,
  animation registration, footpoint placement and depth.
- [demoInput.ts](../apps/game/src/game/player/demoInput.ts): opt-in DEV import,
  one second along each ground axis followed by half a second idle. Partial
  frames crossing phase boundaries are weighted so laps do not drift.

## Position, speed and time

The authoritative position is continuous `{col,row}` in the FDS-003 square
ground plane. Spawn `(16.5,16.5)` is the center of cell `(16,16)`, projected
to `(1024,528)` with the existing map origin `(1024,0)`. Position is already
the footpoint; rendering uses gridToWorld without adding another half-cell.

Input is a col/row vector on orthonormal ground axes, not a screen-space vector.
Magnitude above one is normalized; smaller analog magnitudes are preserved.
Speed is 3 square ground cells/second. Thus diagonals travel the same ground
distance as cardinal axes. Isometric projection intentionally changes apparent
pixel distance by direction; normalizing projected screen pixels would distort
ground speed. No alternative projection or tile-size-based speed compensation
is introduced.

The pure update accepts milliseconds. Finite positive delta is capped at 50ms;
zero, negative or non-finite delta causes no movement. Excess stall time is
discarded (no catch-up backlog or teleport after a background tab). Under normal
frame partitions totaling the same time, fixed-input updates agree within
floating-point tolerance. Normalized vectors and time are never rounded to
pixels. Kahan compensated addition limits cumulative error; its per-axis
correction is reset on a clamped map edge. This is local movement, not a claim
of bit-identical deterministic simulation across machines.

Footpoint bounds are `[0.25,31.75]` per axis, leaving a quarter-cell edge inset.
Clamp each axis, allowing travel along a map edge; a fully blocked player is
Idle. The inset is a map-boundary policy, not collision geometry. Trees/rocks
are not tested for collision. Zero/invalid input stops immediately.

## Facing, sprite and depth

Four logical facings map to the sheet rows:

| Facing | Ground direction | Screen direction |
| --- | --- | --- |
| southEast | +col | down/right |
| southWest | +row | down/left |
| northWest | -col | up/left |
| northEast | -row | up/right |

Choose the dominant moving ground axis, with col winning exact diagonal ties.
At a map edge use the axis that can actually move. Idle retains the last facing.
Each facing has a two-frame Idle (2fps) and four-frame Walk (8fps), looping.
The renderer changes animation only when motion/facing changes and also passes
Phaser 4.0.0 Sprite.play's ignoreIfPlaying flag.

Original [farmer.png](../apps/game/public/assets/player/farmer.png) is a 192x192
RGBA atlas: 24 frames of 32x48, contact point `(16,46)` in every frame. Sprite
origin is `(0.5,46/48)`, scale 1.5, position equals the projected footpoint and
depth equals footpoint Y (the same rule as obstacle visuals). No collision or
actor occlusion system is added. Art/source/MIT terms are in
[ATTRIBUTION.md](../apps/game/public/assets/ATTRIBUTION.md). Regenerate only this
asset with `node apps/game/tools/generate-player.mjs`.

## Running and verification

Run `pnpm.cmd run dev`. Default http://localhost:8080/ uses FDS-006 WASD controls.
Use http://localhost:8080/?playerDemo=1 for development movement with keyboard
disabled. Vite removes the DEV demo branch and dynamic import from production.
See [PC keyboard controls](./PC-KEYBOARD-CONTROLS.md) and
[Mobile touch controls](./MOBILE-TOUCH-CONTROLS.md). FDS-007 supplies a combined
keyboard/joystick adapter while preserving the movement/animation modules.

Root lint/typecheck/test/build remain unchanged. Vitest tests spawn, zero input,
four facings, diagonals, analog magnitude, split deltas, stalls, invalid inputs,
map edges, precision, projection, animation ranges/footpoint/no-restart, PNG
dimensions, neutral input and demo lap stability.

On the default dev URL (no demo query), run in browser DevTools:

```javascript
await (await import('/tests/player.browser.mjs')).runPlayerBrowserChecks()
```

The diagnostic creates and destroys a temporary real game, checks all four
moving directions/frame progression, idle retention and world/depth position.
It also confirms the existing ground and obstacle visuals remain present.
Manual browser testing additionally verified the opt-in demo. Browser diagnostics
are separate from CI. Physical mobile, hosted CI, collision, camera follow,
WASD/joystick and long-duration playtesting are not verified by this ticket.
