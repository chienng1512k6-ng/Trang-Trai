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

## FDS-001 verification — 2026-11-06: PASS

- Git and pnpm workspace present. Phaser 4.0.0, TypeScript 5.7.3 and Vite
  6.4.5 unchanged. Root dev/build/typecheck scripts delegate to apps/game.
- Strict property initialization enabled; default dev/build do not call log.js.
- `pnpm.cmd install` and `pnpm.cmd install --frozen-lockfile` passed with
  approved access outside the sandbox for registry metadata and pnpm store.
  Initial frozen install required metadata regeneration for packageManager.
- `pnpm.cmd run typecheck` and `pnpm.cmd run build` passed (exit 0).
- `pnpm.cmd run dev` started Vite at http://localhost:8080. Integrated browser
  reload produced one canvas and no pageerror events during the smoke check.
- `git diff --check` passed. Visual QA in desktop Chrome/Edge and physical
  phone testing remain unverified. FDS-002 lint/unit/CI work is not included.

## FDS-002 verification — 2026-11-06: PASS (local), GitHub run unverified

- ESLint Flat Config uses JS and TypeScript recommended rules; generated
  output/node_modules are ignored and lint warnings fail the command.
- Vitest 4.1.12 runs two bootstrap unit tests with Phaser mocked; no gameplay
  or isometric math added. Phaser 4.0.0, Vite 6.4.5 and TypeScript 5.7.3 retained.
- `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd run lint`,
  `pnpm.cmd run typecheck`, `pnpm.cmd run test`, `pnpm.cmd run build` and
  `git diff --check` passed on Node 26.13.0 / pnpm 12.18.0.
- Temporarily changing the expected container made one assertion fail and
  root `pnpm.cmd run test` exit 1. Restored test suite passed (2 tests, exit 0).
- Workflow YAML parsed and required triggers, tool versions, ordered commands
  and no error suppression verified locally. No commit/push performed;
  hosted GitHub CI failure/success propagation still requires a real run.
- Registry marked ESLint 9.39.5 deprecated; it remains functional with the
  selected TypeScript ESLint setup. No browser/device tests run for this ticket.

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
