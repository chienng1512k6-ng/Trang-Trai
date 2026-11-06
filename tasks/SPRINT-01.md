# SPRINT 01 — ISOMETRIC TECHNICAL VERTICAL PROTOTYPE

**Goal:** Demonstrate game-feel and technical feasibility on desktop AND mobile landscape without backend.
**Capacity assumption:** ~45–65 focused hours for a solo developer; aim at 2 weeks if time permits, else extend to 3–4 weeks. Do not reduce testing to hit a calendar date.
**Scope:** Phaser 4 + TS + Vite, isometric Tiled map 32×32 cells (prototype map); WASD, joystick, camera, collision, enemy and simple attack; unit tests and build.
**Non-goals:** auth, persistence, construction UX, wallet, quests, online APIs, offline sim, multiplayer, payments.

## Ordered backlog (estimated focused hours)

| ID | Estimate | Depends on | Deliverable / acceptance |
|---|---:|---|---|
| FDS-001 | 3h | none | Git repo, pnpm workspace, `apps/game` Vite + Phaser 4 + TS, scripts build/dev/typecheck; clean local start |
| FDS-002 | 3h | 001 | CI lint/typecheck/unit/build, README commands; failing test causes CI failure |
| FDS-003 | 4h | 001 | 2:1 grid math helper + inverse/property tests under camera transformations |
| FDS-004 | 5h | 003 | Tiled JSON 32×32 isometric map, ground/obstacle/object layers; art sources recorded |
| FDS-005 | 5h | 003,004 | Player sprite with 4-direction animation placeholder, velocity normalization and stable delta handling |
| FDS-006 | 3h | 005 | WASD move, keyboard interaction/attack mapping, diagonal speed tests |
| FDS-007 | 5h | 005 | Mobile joystick + action button, touch capture, safe-area UI, no page scroll while playing |
| FDS-008 | 4h | 004,005 | Camera follow, world bounds, zoom, resize, landscape orientation prompt |
| FDS-009 | 4h | 004,005 | Obstacles, collision against tree/rock/building and visible depth/occlusion correctness |
| FDS-010 | 5h | 005,009 | One slime: idle/wander/chase/hit/death, state boundaries and basic tests |
| FDS-011 | 4h | 006,007,010 | One attack: cooldown, range, damage, feedback + enemy death; no client-server economy |
| FDS-012 | 4h | 007-011 | Performance/QA: Chrome desktop, one real landscape phone, debug overlay and accessibility checks |
| FDS-013 | 3h | 012 | CI green, remove blockers, playable README, screenshots/test evidence and ADR outcome |

**Total:** 52 focused hours, excluding uncertainty/asset rework.

## Acceptance gates
1. 32×32 diamond isometric scene loads correctly and can be explored.
2. PC WASD and landscape touch joystick move player; diagonal speed is normalized.
3. Camera tracks player, including at bounds and after resize/zoom.
4. Character cannot pass through obstacles; depth ordering passes tree occlusion cases.
5. Enemy reacts, chases at bounded range, can hit, take damage and die.
6. Attack button works on PC and mobile without browser interaction conflict.
7. `pnpm install`, documented development command, typecheck, tests and build pass.
8. Browser console has no critical errors; record observed FPS on desktop + real phone (target 60/30, not a guarantee).
9. Every imported third-party asset has source and license metadata; no copyrighted assets ripped from commercial games.
10. Scope is kept local-only; no pretend persistent gold/player account exists.

## Manual QA checklist
- [ ] Chromium desktop keyboard and mouse
- [ ] Real mobile browser, landscape touch and browser toolbar resizing
- [ ] Diagonal velocity vs cardinal velocity
- [ ] Camera edges, zoom and resized viewport
- [ ] Collision with static props and actor/entity overlap
- [ ] Attack cooldown not bypassed through repeated clicks/taps
- [ ] Long-running 10-minute play session without accumulating major leaks
- [ ] Dev server not publicly exposed beyond trusted Wi-Fi
- [ ] Console and CI green

## Recommended commit checkpoints
- `chore: initialize game workspace` (after FDS-001/002)
- `feat: isometric map and player movement` (after FDS-003/006)
- `feat: mobile controls and camera` (after FDS-007/009)
- `feat: combat prototype and QA` (after FDS-010/013)

## Ticket reporting template
ID; brief outcome; files changed; commands actually run + results; screenshots/perf evidence; known limitations; next unblocked ticket. Never claim tested on phone when only using responsive browser emulation.
