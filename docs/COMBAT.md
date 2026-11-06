# FDS-011 — Real-time prototype combat

## Architecture and authority

- `core/combat.ts` owns immutable health, attack resolution, cooldowns,
  invulnerability, activation ids and combat events. It has no Phaser dependency.
- `core/pressLatch.ts` buffers a press edge, shared by existing KeyboardInput
  and ActionPointer. Holding never manufactures another attack. Release preserves
  a quick tap; cancel/blur/visibility/reset discards pending input.
- `game/CombatController.ts` samples both input sources once, runs the pure step
  once after Player/Monster movement, dispatches existing FSM hooks and renders
  lightweight feedback/HUD. It adds no movement, camera or AI update loop.
- HP/maxHP for each actor live in the combat state, separate from their physical
  body states. There is no competing position or physics writer.

## Central config

| Parameter | Player | Green Slime |
| --- | --- | --- |
| HP / maxHP | 5 / 5 | 3 / 3 |
| Damage | 1 | 1 |
| Range | 1.3 ground cells | 0.85 ground cells |
| Arc | 100 degrees | Radial melee |
| Cooldown | 450ms | 1200ms |
| Damage invulnerability | 500ms | HIT interrupts movement for existing 300ms |

COMBAT_CONFIG also defines swing duration 160ms, flash 180ms, recovery protection
1500ms and safe recovery footpoint (16.5,16.5). Distance is Euclidean in the
existing col/row ground plane, never projected screen-pixel distance.

## Input, direction and resolution

Space and the existing DOM Action button (now labelled ATTACK) create press
activations. E stays reserved. WASD/joystick are unchanged. KeyboardPlugin's
installed Phaser 4 keydown/keyup dispatch is reused; no global Space capture or
second listener pair is added. Text inputs, IME and modifier shortcuts remain
unconsumed. Both attack sources are drained every frame, even if the first is
active, and merged into at most one request. Simultaneous inputs do not queue a
second attack. Cooldown/knockout requests are discarded rather than deferred.

Facing reuses FDS-005's four canonical ground directions: southEast +col,
southWest +row, northWest -col, northEast -row. FDS-006 already converts screen
intent to those logical axes; combat does not re-project input. Range includes
the endpoint; the arc compares normalized dot product against cos(50 degrees).
At coincident footpoints the target is in range and direction is accepted.

An accepted attack resolves immediately exactly once, emits one activation id,
and consumes cooldown even on a miss. There is no persistent damaging visual
hitbox, so that activation cannot damage the same target on subsequent frames.
The attack checks living target state and static obstruction before damage.

`isSegmentBlocked` extends the existing collision geometry with an exact slab
segment test against the authored Tiled footprints. It is a thin footpoint-to-
footpoint attack ray, without body inflation; tangent contact blocks conservatively.
This also blocks Slime melee and very thin obstacles. It does not replace the
swept movement resolver or treat the whole canopy as solid.

Player activation resolves first. A newly hit Slime cannot retaliate during that
frame. A living CHASE Slime can melee only within range, with clear line and zero
cooldown, against a living, non-invulnerable Player. HIT/RETURN/IDLE/WANDER/DEAD
do not melee. Slime cooldown is independent of Player cooldown. Valid damage
clamps HP to [0,maxHP]. Timers reuse FDS-005 valid-delta/cap-at-50ms policy:
normal frame partitions agree; stalls discard excess and do not catch up attacks.

## FSM, knockout and recovery

Nonlethal Slime damage invokes the existing HIT hook; lethal damage invokes DEAD.
HIT retains the FDS-010 300ms stop then RETURN policy; DEAD is absorbing and
cannot move, attack or receive more damage. Slime can overlap Player physically;
actor-vs-actor collision was not added.

Player HP zero is the canonical knockout flag. The next movement sample is
drained but replaced with zero; the sprite becomes translucent, and AI receives
no living target. There is no automatic revival timer. Press the HUD's **Recover
at safe spawn** button to restore Player HP once, reset its existing body at the
validated safe point, grant 1500ms protection and reset a living Slime to its
clear spawn. Slime HP is retained; a dead Slime is not resurrected. This explicit
action avoids an automatic repeated death/respawn loop. Scene restart resets
both actors and all combat state to initial values for another full test.

## Visual feedback and lifecycle

A small projected sector indicates the attack's actual ground facing/range.
Hit versus miss/blocked text and color are distinct. Slime uses its HIT/DEAD
frames; the hit flash uses Phaser 4 `setTintMode(TintModes.FILL)`, not the removed
setTintFill stub. Player flashes red on damage. Existing animation selection
is not restarted every frame. One graphics object and one DOM combat HUD are
reused; no particles, timer callbacks or health-state listeners are required.

HUD shows Player and Slime HP above the play area, independently of camera.
Shutdown/destroy removes its DOM button, graphics and lifecycle handlers.
Existing keyboard/touch reset and cleanup cover combat pending input too.
The default development demo has no real attack adapter, preserving the prior
demo/input separation. No debug overlay is enabled in production.

## Verification — 2026-11-06

- **318 unit tests PASS**, **54 new tests**, and the earlier reserved-action
  expectation updated because Space is now implemented. Includes health clamps,
  eight screen intents/facing, range/arc boundaries, thin-wall obstruction,
  cooldown spam, press/hold/release, one-hit activation, FSM HIT/DEAD, melee,
  invulnerability, knockout/recovery, delta partitions/stalls, keyboard focus and
  text entry, multi-touch cancellation, controller cleanup and movement gating.
  Earlier Player/AI/collision/camera regression suites pass.
- `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test`,
  `pnpm.cmd run build` and `git diff --check` pass.
- localhost:8080 real KeyboardPlugin Space events: outside range and back-facing
  miss, authored tree blocks damage, correct-facing hit reduces 3 -> 2 -> 1 -> 0
  on three valid activations, then DEAD frame 7 remains still. Miss/hit/blocked/
  defeated HUD text and projected swing become active.
- Slime melee reduced Player HP; a 1-HP QA fixture reached knockout, WASD no
  longer moved it, and a real Recover click restored 5 HP at (16.5,16.5).
- Native renderer pixel sample during flash RGB (240,252,233), then normal HIT
  frame RGB (207,239,155), verifies rendered brightening. Initial testing exposed
  Phaser 4's removed setTintFill stub; it was replaced and the scenario rerun
  without console errors.
- Real W+Space held 900ms produced one activation while movement continued.
  A focused HTML input received a literal space without creating an activation.
- Chromium CDP touch: joystick + Attack simultaneously moved and hit; holding
  Attack beyond cooldown retained one activation. Releasing Action kept joystick
  movement; touchCancel stopped movement without another attack.
- Zoom 0.5 and 3 both produced exactly one damage. All 260 native camera
  assertions remain passing. Four scene restarts restored HP 5/3, activation 0,
  one combat HUD, one Slime, one keyboard listener, four scale resize listeners
  and 21 total scene shutdown listeners; counts did not increase.
- DOM rect checks at 568×320, 844×390, 1024×600 and 1280×720 confirm no combat
  HUD overlap with joystick, Attack or zoom controls.
- Root reload and combat scenarios after the tint correction report no captured
  JavaScript/console or HTTP asset errors. No dependency/version changes.

The standalone `/tests/keyboard.html` fixture exposes `combatCase(kind)` and
`combatSnapshot()` in addition to prior diagnostics. Valid test reseeding is
only in that development test module, not the production entry. Automated
encounter setup is not claimed to be manual traversal of the entire map.

Real-device iOS/Android, Safari/Firefox, hardware safe areas, physical Alt-Tab,
long-duration balancing/performance and hosted CI remain unverified. Browser
touch emulation is not real-device QA. Combat is immediate, single-target and
local: no wind-up simulation, loot, currency, inventory, persistence, backend
or multiplayer. No FDS-012 work is implemented.
