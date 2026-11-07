# FDS-012 — Performance, stability and device QA

Status: **PASS — FDS-012 accepted using the combined, separately attributed
evidence below.** The owner's final independent Chrome desktop report supplies
the previously missing 10-minute functional session and physical Alt-Tab results.
No blocking gameplay defect is reported. This closes FDS-012 only, not FDS-013
or the overall Sprint review. Earlier PARTIAL statements in fix reports describe
their historical verification stage; this report and the Sprint backlog are the
current FDS-012 acceptance record.
[FDS-012-FIX-001](./FDS-012-FIX-001.md) and
[FDS-012-FIX-002](./FDS-012-FIX-002.md) are **CLOSED**. The project owner officially
retested the latest GameGestureGuard build on physical iPhone Safari and reported
**10/10 PASS**: double-tap Zoom +/-; Recover without duplicate activation;
canvas/HUD gaps; portrait overlay; Attack center/text/edge; joystick+Attack;
outside release/cancel; app switch/return; camera +/-; normal page zoom outside
the game. This is **owner-provided evidence**, not Codex-operated device QA.
No iPhone model, iOS/Safari version or numerical phone performance data were
supplied or inferred. Prior matrices below describe historical agent-run checks.
This report does not complete
Sprint 1 or FDS-013. Measurements below are from real browser timing, not supplied
FPS values or accelerated simulation. No dependencies/engine upgrades are needed.

## Environment and scope

### Final owner-provided Chrome desktop QA — PASS

Source: the project owner's final FDS-012 QA report in this conversation.
Codex reviewed the report; Codex did **not** perform these manual checks.

| Environment | Owner-supplied value |
|---|---|
| Browser | Independent Google Chrome 157.0.8103.38 |
| OS | Windows 11 Pro |
| Tested URL | http://192.168.4.102:8080/ |
| Gameplay duration | 10 continuous minutes |
| Build mode / build hash / test date | Not supplied; port 8080 alone does not establish dev or production mode |
| Chrome-specific FPS / frame time / slow-frame counts | **NOT MEASURED**; no Electron figures substituted |

| Manual check | Owner-reported outcome |
|---|---|
| WASD / Space | PASS; movement and attack work normally |
| Combat, Slime HIT/DEAD, knockout/recover | PASS; damage, death and recovery work correctly |
| Collision / depth | PASS; no passage through props, correct front/behind tree ordering |
| Camera follow / zoom / resize | PASS |
| Restart / reload | PASS |
| Console / assets | PASS reported, no errors found; report retains an "if DevTools was opened" qualification, so a complete independently captured DevTools log is not asserted |
| 10-minute operational stability | PASS; owner observed no significant stutter, freeze or serious error; qualitative, not an FPS measurement or memory-leak proof |
| Physical Alt-Tab while holding input | PASS explicitly reported; switching away/back works |
| Input after return | PASS; no stuck keys, involuntary movement or repeated attacks |

The owner report includes a reminder to retain Alt-Tab PASS only if the physical
action was performed. Its final result explicitly reports that action as PASS;
this record accepts that owner assertion, without relabeling agent-generated
blur events as an OS test. No video, trace, exact test date or device hardware
details were supplied for this manual session. Hardware from the separate CIM
read below is not automatically attributed to the owner's test machine.

### Acceptance cross-check and remaining limitations

| FDS-012 requirement | Evidence / disposition |
|---|---|
| Desktop operating feel and functional stability | Owner's independent Chrome 10-minute report PASS, including combat HIT/DEAD, collision/depth, camera, restart and physical Alt-Tab |
| Physical landscape mobile/touch QA | Owner's earlier iPhone Safari functional QA and 10/10 FIX-002 retest PASS; FIX-001 and FIX-002 CLOSED |
| Repeatable performance instrumentation / long-run measurement | Agent-run development soak plus unchanged-production Electron/Chromium 600-second measurement: mean **60.037 FPS**, mean frame time 16.656 ms, global p95 17ms, 0 frames >33.3ms / >50ms; source remains Electron only |
| Restart/object/listener stability | Production measurement: 10 Scene restarts, stable recorded counters, no captured invariant/runtime/network failures; owner restart/reload also PASS |
| Quality regression | Last executed lint/typecheck/test/build/diff checks PASS; **351 tests in 23 files**. Documentation-only final acceptance does not rerun or invent a new regression |
| Blocking defects | None reported in final owner QA; both Safari P1 fixes closed by owner verification |

**Decision: FDS-012 PASS for the Sprint 1 prototype scope.** Unknown numerical
Chrome/phone performance remains a recorded measurement limitation, not a
reported gameplay failure. Chrome desktop FPS/frame times and phone FPS remain
NOT MEASURED; phone model/iOS/Safari version, owner-session build mode/hash/date,
GPU/power/thermal state and assistive-technology certification remain unverified.
No sustained thermal/capacity or retained-object leak guarantee is claimed.
Electron's benchmark did not observe Slime HIT/DEAD; the owner's functional
Chrome report covers those behaviors without supplying a performance benchmark
for them. Other browser/device combinations are not certified by these results.
Optional quantitative follow-up instructions are retained below. No new bug
ticket is warranted solely for missing optional measurements; a discovered
serious defect should get a scoped FDS-012 fix ticket.

### Historical agent Chrome attempt — NOT TESTED, no valid benchmark

This failed agent attempt is retained unchanged as historical evidence. It is
separate from the later owner-provided manual Chrome PASS above; its raw JSON
must not be rewritten to imply a successful quantitative Chrome benchmark.

On 2026-11-07 Codex verified the installed executable
`C:/Program Files/Google/Chrome/Application/chrome.exe` product version
**157.0.8103.38**, and CDP reported **Chrome/157.0.8103.38** (not Electron).
An isolated temporary profile and localhost-only debug port 9223 were used.
Production files were served by Vite preview at http://127.0.0.1:8082/ after a
successful build. No headless, frame-rate override, throttling bypass or visibility
spoof was used.

Read-only Windows CIM (approved after sandbox denied access) verified:

| Item | Verified value |
|---|---|
| OS | Microsoft Windows 11 Pro, 10.0.22631, 64-bit |
| Computer | LENOVO 20TH000XUS |
| CPU | Intel Core i7-10750H @ 2.60GHz, 12 logical processors |
| Physical memory reported by CIM | 16,954,777,600 bytes |
| GPU / power / thermals | NOT VERIFIED |
| Chrome viewport / DPR | 1036×703 / 1.25 (observed, no viewport emulation) |

Chrome opened and its production Scene initialized, but the agent-launched tab
reported **document.hidden=true / visibilityState=hidden**, despite hasFocus=true,
Page.bringToFront and native window state normal. Phaser loop.frame remained **0**.
The first exploratory capture had zero poststep timing samples and was aborted;
the helper now refuses to start a benchmark when hidden or when frame count does
not advance. A clean preflight retry exited 1 for that reason.
[Failed-attempt evidence](./qa/fds012-production-chrome.json) explicitly records
completed=false and NOT TESTED. Its zero action/error counters are not evidence
of successful gameplay; no average FPS, mean/p95 frame times or slow-frame counts
can be reported from that attempt. FPS is **unavailable, not 0 FPS**.

| Required result | Status |
|---|---|
| Standalone Chrome combat/camera/collision/restart functional QA | NOT TESTED; renderer did not advance |
| >=10-minute production benchmark in standalone Chrome | NOT TESTED; no valid render samples; embedded production measurement below is separate |
| Standalone Chrome production FPS / frame times / slow frames | N/A, not measured |
| Console / assets | No errors captured during aborted preflight; not a completed runtime QA PASS |
| Physical Alt-Tab / actual hidden-tab recovery on desktop | NOT TESTED; no OS interaction evidence |
| Physical iPhone functional cases | PASS, 10/10 supplied by owner; no numerical phone benchmark |

### Optional reproduction / quantitative Chrome follow-up

Run from repository root in PowerShell (leave servers running):

```powershell
pnpm.cmd run build
pnpm.cmd --dir apps/game exec vite preview --host 127.0.0.1 --port 8082 --strictPort
```

In another interactive PowerShell, launch a separate Chrome QA profile (do not
reuse a personal profile). Keep the window visible in the foreground:

```powershell
& 'C:/Program Files/Google/Chrome/Application/chrome.exe' --remote-debugging-port=9223 --remote-debugging-address=127.0.0.1 --user-data-dir="$env:TEMP/farm-qa-chrome" --no-first-run --no-default-browser-check http://127.0.0.1:8082/
node tools/qa/chrome-inspect.mjs
node tools/qa/chrome-production.mjs
```

The dependency-free Node/CDP QA helper attaches only to this localhost production
tab and verifies the Chrome product identity. It reads the existing Phaser Game
through its canvas listener closure using DevTools; it **does not modify the
production bundle or add a shipped global API**. This inspection is tied to the
installed Phaser 4.0.0 layout; failure must abort rather than guess a Game object.
Injected instrumentation is removable, opt-in DevTools-only state.

The helper requires an initially visible, advancing renderer, then measures real
performance.now deltas between native poststep events for >=600 seconds. It
retains raw intervals, computes time-weighted mean FPS, nearest-rank global p95,
strict >33.3/>50ms counts, and saves 30-second checkpoints to
`docs/qa/fds012-production-chrome.json`. It excludes visibility/focus boundaries
and refuses completed status without at least 595 seconds of captured intervals;
review actual captured duration and interruptions. These are engine-update
intervals, not guaranteed compositor-presented FPS. Probe/DevTools work adds
overhead; do not call this an uninstrumented GPU benchmark.

Scripted inputs use real CDP keyboard/mouse dispatch and existing Scene.restart;
the helper never calls Player/Monster.update manually, supplies fake deltas,
teleports actors, changes HP, or bypasses collision. Cycles exercise idle/wander,
approach/chase/combat, movement, obstacle approach, camera buttons and restart.
It records actor state/counters and checks positions against existing metadata;
stationary approach counts alone are not proof of collision. A complete visible
600-second run of this helper remains **unverified in the agent environment**.
Do not mark PASS merely because the script exits: inspect mode/health evidence,
errors, visibility and functional behavior.

Manually verify WASD/Space, tree/rock blocking/sliding, depth, camera follow and
zoom 0.5–3, knockout/recover, resize and repeated restart. Record Chrome version,
OS/hardware/power mode, build hash, viewport, all timing metrics, console/network
errors and exported evidence. Then test **actual Alt-Tab** while holding movement/
Attack, return, verify no stuck input, release and start a fresh gesture. Treat
this as a separate lifecycle test so the benchmark is not misrepresented as
uninterrupted foreground rendering. Synthetic blur is insufficient. If CDP cannot
inspect Phaser, collect a Chrome DevTools Performance trace for >=10 minutes and
provide the trace for frame analysis; do not fabricate statistics from a video or
the configured FPS cap. Close the isolated QA Chrome to end the local debug port.

### Completed production measurement — embedded Chromium, not standalone Chrome

Codex measured the unchanged production bundle at http://localhost:8082/ in
Code/1.145.1, Chrome/150.0.7871.250, Electron/43.8.3. Same verified Windows/CPU/RAM
as above, viewport 1024×600, DPR approximately 1, no CPU/GPU throttling configured.
Actual GPU/power/thermal state remains unverified. Start 2026-11-07 06:29:39.614 UTC;
elapsed **600.2443 seconds**, captured intervals **600.0625 seconds**.

| Metric | Measured production result (embedded Chromium) |
|---|---:|
| Native poststep intervals | 36,026 |
| Time-weighted mean FPS | 60.037079 |
| Mean frame time | 16.656373 ms |
| Global nearest-rank p95 frame time | 17 ms |
| Maximum frame interval inside saved measurement | 32 ms |
| Frames >33.3 ms / >50 ms | 0 / 0 |
| Snapshot windows / Scene restarts | 20 / 10 |
| Heap snapshot range | 16,720,011–24,008,281 bytes |
| Runtime/console / HTTP / network failures captured | 0 / 0 / 0 |

[Completed production evidence](./qa/fds012-production-embedded.json) contains
completed=true, per-window states/counters, exact global statistics, bundle SHA256
hashes and a **lossless frequency histogram** of original interval Number values.
Histogram count 36,026 and recomputed p95 17ms agree with the measurement; frame
ordering is retained only at 30-second window level. Statistics are from the
completed capture, not later cleanup/serialization frames or the FPS target.

The probe observes existing native poststep events; inputs use real CDP keyboard/
mouse dispatch, and the existing Scene.restart is exercised. No fake deltas,
manual actor updates, HP/position mutation or production debug overlay. Each
checkpoint retains 20 objects, 1 Slime, 9 obstacles, one touch/camera/combat overlay,
zero performance overlays, keyboard=1, resize=4, shutdown=23 and poststep=2
(one engine listener plus one QA probe). Position/footprint invariants reported
no violations, and camera followed Player's foot sprite at each checkpoint.

Observed modes were IDLE/WANDER/CHASE/RETURN. Scripted attacks and Slime melee
ran; checkpoint Player HP alternated knockout/alive with manual-style Recover
clicks. Slime HIT/DEAD were **not observed in this benchmark**; do not claim that
damage/death workload was covered. Those functional rules retain unit/earlier
local QA and owner-device evidence. Nine stationary obstacle-approach samples
are diagnostic, not by themselves proof of blocking; no penetration was detected.
Camera zoom buttons were exercised; no full desktop Chrome visual certification
or new depth-pixel test is implied.

No hidden-frame samples occurred. Five blur/focus pairs near 525–533 seconds and
62 unfocused frame callbacks were recorded; boundary anchors reset, while visible
unfocused intervals can remain in the sample. This was **not an uninterrupted
focused session**, and the source of those events was not verified as physical
Alt-Tab. Synthetic/browser focus APIs are insufficient evidence of actual OS
switching. Heap variation is not a leak diagnosis: intentional timing buffers,
CDP handles and diagnostics add overhead, and no retained-object/post-GC study
was performed. FPS describes engine-update cadence, not guaranteed compositor
presentation, standalone Chrome performance or phone FPS.

The local CDP/QA helper and the embedded coordinator use the same probe/workload;
the standalone Chrome full run is still unverified. The production bundle was
not rebuilt or changed during this measured interval. Final regression commands
are run after the measurement.

### Historical development benchmark environment

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
| Production benchmark | Completed 600-second embedded-Chromium measurement above; standalone Chrome NOT TESTED |
| Real iPhone functional QA | Owner reports 10/10 PASS on latest GameGestureGuard build; not agent-operated device QA |

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
| `pnpm.cmd run test` | Latest regression PASS, 351 tests in 23 files; original profiler baseline was 327 |
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
| Agent-launched Chrome remained hidden with loop frame 0 | Historical agent limitation; later owner manual Chrome/Alt-Tab PASS closes functional gates. Numerical Chrome benchmark remains NOT MEASURED |
| Phaser agent-skill approval notice during install | Informational; install succeeded; no new skill enabled or approval policy changed |

## Historical real-phone checklist / remaining device metadata

The owner has now supplied functional iPhone Safari PASS and closed both fixes.
The checklist is retained for reproduction. Device model/OS/browser version,
numerical device FPS and assistive-technology testing are still not provided.

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

- No agent-run real phone, standalone Chrome/Edge or Safari/Firefox result is claimed.
- A single NPC/static map and short focused scenarios do not establish capacity
  for many entities or low-end/mobile GPUs. No simulated low FPS is a real device.
- Heap API is Chromium-specific and approximate; GC is not forced, retained
  objects are not profiled, and no leak conclusion follows from one increase.
- Benchmark noise from the host/editor, compositor and diagnostics is not isolated.
- Follow-ups after Sprint 1: profile on target hardware/production, isolate render
  vs AI/path costs, consider path caching only if measured, and review expensive
  DOM/tint/graphics work that repeats without a state change. No broad architecture
  or gameplay expansion is authorized by this ticket.
