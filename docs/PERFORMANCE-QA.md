# FDS-012 — Performance, stability and device QA

Status: **PARTIAL overall; PASS local/embedded-browser; real-device QA open**.
Standalone desktop Chrome and the required physical landscape phone remain
NOT TESTED. This report does not complete
Sprint 1 or FDS-013. Measurements below are from real browser timing, not supplied
FPS values or accelerated simulation. No dependencies/engine upgrades are needed.

## Environment and scope

- Dates: 2026-11-06 (initial checks), 2026-11-07 (repeat soak/final QA);
  Windows x64; Node 26.13.0; pnpm 12.18.0.
- Integrated browser UA: Code/1.145.1, Chrome/150.0.7871.250,
  Electron/43.8.3. This is VS Code's embedded Chromium, **not a verified
  standalone Chrome/Edge, Safari/Firefox, or physical phone**.
- Browser reports 12 logical processors, deviceMemory bucket 16 and DPR about 1.
  These browser values do not certify the physical machine model or RAM capacity.
- Phaser 4.0.0, Vite 6.4.5 and TypeScript 5.7.3 remain unchanged.
- Long-run performance: **development build**, Vite localhost:8080,
  `/tests/keyboard.html?perf=1`, initial viewport 1024×600, no CPU/GPU throttling
  configured. Diagnostic input/setup is scripted; frame updates use real elapsed
  browser time. These figures must not be represented as production or phone FPS.

## Instrumentation and reproduction

`core/frameMetrics.ts` keeps at most 4096 samples. FPS = 1000 × sample count /
sum of raw frame intervals. Mean frame time is sum/count; p95 is nearest-rank;
the displayed p5 FPS is 1000/p95 frame time. Counts use strict >33.3ms and >50ms.
No sample means null rather than fabricated FPS. CPU timing includes zero samples
below the browser timer resolution. Do not interpret derived FPS of AI timings
as game FPS: only its milliseconds are meaningful.

`game/DevPerformance.ts` loads through a DEV-only dynamic import for `?perf=1`.
It measures performance.now between native Phaser `poststep` events, not the
smoothed/capped simulation delta. It separately wraps Monster.update, including
any pathfinding invoked there. Standalone pathfinding CPU time is not isolated.
Hidden-page periods and blur/focus boundaries reset the timing anchor; their
count is recorded. Visible long stalls are retained. Snapshot sorting/overlay
updates themselves add measurement overhead; no profiler-free comparison is
claimed. An overlay updates once per second and is absent from default production.

The probe is shared per Game through WeakMap, survives scene restart without
duplicating listeners, and removes Game/DOM listeners on Game destruction. It
records objects, named Slime/obstacles, keyboard/scene/scale/poststep listeners,
DOM overlays and Chromium heap bytes when available (otherwise null).

```powershell
pnpm.cmd run dev
```

Open `/tests/keyboard.html?perf=1` in a visible foreground browser, then DevTools:

```javascript
const { startPerformanceSoak } = await import('/tests/performance.browser.mjs');
globalThis.performanceSoak = startPerformanceSoak(keyboardCheck);
// Keep the tab visible for at least 10 minutes; do not edit source (HMR resets it).
performanceSoak.result
// After completed === true:
copy(JSON.stringify(performanceSoak.result, null, 2));
```

The 60-second cycle covers idle/wander, scripted held WASD + zoom, blocked-path
chase, repeated combat, knockout/recovery and restart. Inputs go through existing
adapters and actual Scene.update; no helper calls Player.update/Monster.update
manually for the soak. Valid fixture setup reseeds encounters so it can repeat.
Every ~30 seconds it exports timings, heap, counters, HP and physical state checks.
Checkpoints are also stored in localStorage under `fds012-soak`. A reload does
not resume the timer: retrieve the partial record and start a new full run.
The interrupted November 6 run had only about 437 seconds verified; it is not
counted as the required completed 10-minute test. Keep browser focus on the
canvas: the existing input safety policy intentionally ignores unfocused input.
It captures console errors, unhandled errors/rejections and Resource Timing HTTP
statuses where the browser exposes them. Browser automation additionally checks
network failures during focused QA; status-less Resource Timing is not proof of
successful loading. Only one game is booted on the diagnostic page.

## Measurements and long-run evidence

Completed 2026-11-07, starting 05:19:06.485 UTC: **600.0015 seconds** elapsed,
20 approximately 30-second measurement windows, 36,002 raw frame intervals.
Raw checkpoints and state observations: [soak evidence](./qa/fds012-soak.json).

| Metric | Measured result, development build |
|---|---:|
| Time-weighted mean FPS across captured intervals | 60.0375 |
| Mean frame time | 16.6563 ms |
| Per-window p95 frame time | 16.8–17.1 ms |
| Per-window p5 FPS | 58.48–59.52 |
| Maximum observed frame interval | 26.9 ms |
| Frames >33.3 ms / >50 ms | 0 / 0 |
| Per-window mean Monster.update CPU time | 0.0069–0.0192 ms |
| Per-window p95 Monster.update CPU time | about 0.1 ms |
| Chromium heap sample range | 22,139,941–37,779,606 bytes |

These are poststep interval statistics, not verified compositor/presented-frame
FPS. Weighted mean uses total captured intervals/time; p95 values are **ranges
of window percentiles**, not an invented global percentile. Resetting timing
windows/focus excludes a small part of wall-clock duration (599,658.7 ms of
captured intervals). The soak was foreground but input required focus restoration
around 160 seconds; early unfocused keyboard actions were intentionally ignored.
Later repeated cycles exercised actual movement and combat. No source edits or
quality/build workloads were run during the completed benchmark.

The 100 ms state observer began about 40 seconds into the run, collected 5,598
samples and saw IDLE, WANDER, CHASE, RETURN, HIT and DEAD, with 24 Slime deaths
and 21 knockout/recovery cycles. Encounter fixtures reseed valid actors to repeat
scenarios; these counts are QA observations, not normal-session progression.
Ten restart phases completed; every saved checkpoint retained 20 Game Objects,
1 Slime, 9 obstacles, and one of each touch/camera/combat/performance overlay.
Listener counts stayed shutdown=22, keydown=1, keyup=1, resize=4, poststep=2
(counts include engine listeners). No collision/bounds invariant errors, console
errors or exposed HTTP error statuses were recorded. Heap rose and fell rather
than increasing monotonically. No retained-object/post-GC analysis was performed;
this is no observed object/listener growth, **not proof of no memory leak**.

The raw historical AI snapshot includes generic derived FPS fields from the
shared accumulator. Ignore those fields: final instrumentation exports only AI
milliseconds/sample counts, since AI call frequency is not game FPS.

## Desktop and mobile QA matrix

All checks below use the embedded Chromium described above, unless marked
otherwise. Browser fixture setup is separate from assertions of real input.

| Scenario | Result and evidence |
|---|---|
| Idle, WANDER, CHASE/path around obstacles, combat, knockout/recovery | PASS; real-time soak plus focused Space tests; all six FSM modes observed |
| WASD and four diagonals, release | PASS; actual browser key presses; world X/Y signs match eight requested screen directions; all return to Idle |
| Attack hit/miss/occlusion | PASS; outside/back/blocked keep Slime HP 3; facing hit reduces to 2; three valid Space attacks reach HP 0/DEAD |
| Knockout/manual recovery | PASS; HP 0 disables controls, recovery restores HP 5 and control |
| Text entry | PASS; input receives `wasd ` including Space; attack activation unchanged |
| Blur | PASS synthetic window blur/focus; held movement stops; physical Alt-Tab/actual hidden-tab resume NOT TESTED |
| Camera follow, zoom and picking | PASS; native camera geometry helper rerun: 260 assertions; +/- clamp to 0.5 and 3 |
| Tree/rock collision and sliding | PASS; actual held diagonal keys, 43 observed frames each, zero penetrations; blocked coordinate remains valid |
| Depth ordering | PASS display-list checks behind/front/tie: Player Y 176/208/192 vs tree Y 192; indices order correctly; no new pixel-occlusion test claimed |
| Map bounds stress | PASS; existing deterministic helper manually steps movement to boundaries; functional test, excluded from FPS measurements |
| Landscape sizes | PASS layout/camera measurements at 568×320, 844×390, 1024×600, 1280×720; no severe joystick/Action/HP/zoom overlap or document overflow |
| Portrait 360×640 and return | PASS; rotate overlay appears, input blocked, landscape restores controls; no forced orientation |
| Joystick + Attack | PASS CDP touch with two simultaneous pointer IDs; movement continues after Action release; hold produces one activation; touchCancel restores Idle/zero vector |
| Joystick short performance sample | 144 actual frame intervals / 2398.5 ms; mean 60.0375 FPS, mean 16.6563 ms, p95 17.2 ms, no >33.3 ms frames; short dev sample, not phone FPS |
| Additional five scene restarts | PASS; all object/overlay/listener counts match baseline |
| Production smoke | PASS Vite preview localhost:8082, reload/asset requests, canvas, WASD/Space feedback and zoom; no JS/HTTP errors; `?perf=1` produces zero profiler overlays |
| Production benchmark | NOT TESTED; production smoke does not establish production performance |
| Real safe-area insets, touch ergonomics, browser toolbars, real phone | NOT TESTED; checklist below |

Safe-area CSS was inspected and zero-inset emulated layouts measured. Nonzero
notch/home-indicator geometry, actual hardware multi-touch and accessibility with
assistive technology remain unverified. Existing controls retain labels, 44px
zoom targets and 88px/72px touch controls. Physical Alt-Tab, real hidden-tab
lifecycle, browser chrome/toolbars and touch hardware cannot be certified by a
dispatched blur event or browser emulation. HTTP request/console listeners during
focused load checks reported no failures; resource statuses alone cannot detect
all network failure modes.

## Quality commands and findings

| Command (repository root unless specified) | Result |
|---|---|
| `pnpm.cmd install --frozen-lockfile` | Initial sandbox access denied to pnpm store operation lock; approved retry PASS, no lockfile/dependency changes |
| `pnpm.cmd run lint` | PASS, exit 0 |
| `pnpm.cmd run typecheck` | PASS, exit 0 |
| `pnpm.cmd run test` | PASS, 327 tests in 22 files; 318 baseline + 9 new |
| `pnpm.cmd run build` | PASS, exit 0 |
| `pnpm.cmd --dir apps/game exec vite preview --host 127.0.0.1 --port 8082` | Started successfully; production smoke above |
| `git diff --check` | PASS; Git warns about future LF→CRLF conversion, no whitespace errors |
| `git status --short` / `git diff` | Reviewed; no dependency/version changes, no commit/push |

Nine added tests cover five timing/statistics cases, three profiler measurement/
restart/destruction cases, and unchanged-HUD DOM assignment regression. All
earlier game tests remain passing. Editor diagnostics report no errors.

| Finding | Severity / outcome |
|---|---|
| Unchanged HP text and hidden property rewritten every frame | Low; fixed with state comparison, regression tested and browser mutation count verified |
| README contradicted existing collision/combat | Low; corrected documentation |
| First interrupted soak lacked final result | Evidence gap; rerun completed full 600 seconds, durable localStorage checkpoints added |
| Physical phone and standalone desktop Chrome unavailable | Open acceptance limitation; overall FDS-012 PARTIAL, no fabricated device PASS |
| Phaser agent-skill approval notice during install | Informational; install succeeded; no new skill enabled or approval policy changed |

## Real phone checklist — NOT TESTED

Record phone model, OS, browser/version, refresh rate, battery/power mode, thermal
state, viewport/DPR, network, build mode and testing date. Test at least one
landscape phone; preferably both Safari/iOS and Chrome/Android.

1. On the same trusted LAN, start Vite with
   `pnpm.cmd --dir apps/game run dev --host 0.0.0.0`, then open
   `http://<PC-LAN-IP>:8080/?perf=1`. If Windows asks, review private-network
   firewall access. This is a local QA server, not a production deployment.
2. Verify joystick, Attack and zoom +/- fit the real notch/home-indicator safe
   areas. Open and collapse browser toolbars; repeat on a small landscape phone.
3. Hold joystick with one finger and Attack with another. Release either first;
   move a finger outside controls; cancel via app/tab switch. No repeated attack
   from holding, stuck movement or pointer stealing should occur.
4. Rotate portrait and back; prompt must appear and held input must reset.
   Do not require forced orientation locking. Check pinch/browser UI and text
   fields retain normal behavior outside the game interaction areas.
5. Fight, kill Slime, allow Player knockout and manually recover. Verify camera,
   collision/depth, HP and input remain usable after zoom 0.5–3 and orientation.
6. Run for 10+ minutes. Record profiler average/p5 FPS, mean/p95 frame times and
   >33.3/>50ms counts periodically. Repeat after thermal warm-up. Save real phone
   screenshots/logs with environment metadata; do not copy emulated results.
7. With remote DevTools when available, inspect console/network and heap trends,
   then restart Scene repeatedly and check counters. Memory growth alone is not
   enough: seek retained objects or a repeating post-GC upward trend before
   diagnosing a leak.
8. Confirm labels are readable, touch targets usable, browser back/app switching
   recover safely, and no unwanted page scroll/zoom or severe UI overlap occurs.

## Limits and optimization follow-ups

- Fixed a small measured issue: unchanged HP text previously caused 72 DOM
  mutations during a 1.2-second observation. Guarding text/hidden assignments
  reduced unchanged-HP mutations to zero in the repeated 1.2-second browser
  observation. This is a DOM-work reduction, not a claimed measured FPS gain.
- README contained obsolete statements that collision and Action gameplay were
  absent. These have been aligned with the existing FDS-009/FDS-011 behavior.

- No real phone, standalone Chrome/Edge or Safari/Firefox result is claimed.
- A single NPC/static map and short focused scenarios do not establish capacity
  for many entities or low-end/mobile GPUs. No simulated low FPS is a real device.
- Heap API is Chromium-specific and approximate; GC is not forced, retained
  objects are not profiled, and no leak conclusion follows from one increase.
- Benchmark noise from the host/editor, compositor and diagnostics is not isolated.
- Follow-ups after Sprint 1: profile on target hardware/production, isolate render
  vs AI/path costs, consider path caching only if measured, and review expensive
  DOM/tint/graphics work that repeats without a state change. No broad architecture
  or gameplay expansion is authorized by this ticket.
