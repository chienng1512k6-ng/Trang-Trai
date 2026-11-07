# Sprint 1 final review and acceptance — FDS-013

Review date: 2026-11-07. Baseline: `fe67496` (clean working tree before review).
Scope: local isometric technical vertical prototype; no new gameplay, backend,
dependencies, engine upgrade, commit or push in this review.

## 1. Executive summary and decision

**FDS-001–012: accepted PASS within their recorded scopes. FDS-013: PARTIAL.**
The review, documentation, local regression, production smoke and proposed next
backlog are complete. The ticket explicitly requires **CI green**; a successful
hosted workflow run for the reviewed revision has not been verified. Local
execution of the same commands is green, but does not close that hosted gate.
Do not mark all 13 tasks complete until the owner supplies a successful workflow
URL/revision or explicitly revises that acceptance gate.

**GO, conditional, for a small Sprint 2 starting with domain/state design.**
No blocking gameplay defect is reported in the accepted desktop/iPhone QA.
Before merging Sprint 2 implementation, verify hosted CI on the reviewed Sprint 1
checkpoint and approve the small Sprint 2 scope/authority contract below.
**NO-GO for Beta 1.0, commercial release or trusted persistent economy.**
GDD beta acceptance requires persistence, validated economy, offline progression
and operational/security controls that this prototype deliberately does not have.

The local prototype goals are met: a 32×32 isometric farm, one animated Player,
WASD and multitouch movement/attack, camera, nine static obstacles, one Slime FSM
and real-time combat. The outstanding review gate is evidence, not a new gameplay
feature. Numerical phone/Chrome FPS remains unmeasured; the owner's FDS-012 PASS
is preserved, with those measurement limitations explicitly carried forward.

## 2. Task acceptance matrix

Counts below are historical total suites at each task, not additive test counts.
Current regression is 351 tests / 23 files. Task-time device limitations remain
historical; later owner device coverage is attributed under FDS-012.

| Task / goal | Actual deliverables | Acceptance / evidence | Remaining limits | Next-sprint dependency |
|---|---|---|---|---|
| 001 Foundation | pnpm workspace, apps/game, strict TS, dev/typecheck/build, esbuild-only build approval | PASS local; frozen install and current quality commands pass | App manifest retains template identity; not all future packages exist | Keep lockfile/toolchain and reproducible root commands |
| 002 Quality & CI | ESLint Flat Config, Vitest, root scripts, push/PR workflow | PASS local; initial deliberate failing assertion exited 1; now 351 pass | Hosted GitHub job NOT VERIFIED; Node/Linux runner not exercised locally | Require hosted green before next implementation merge |
| 003 Coordinates | Pure 2:1 projection/inverse, origin, picking, Phaser camera adapter | PASS local/browser; 41 tests at delivery, 40 native browser checks, seeded round trips | Normal layer transform only; finite-position documentation exceeds helper validation | Reuse grid contract for state/plots/placement |
| 004 Tilemap | Tiled-format 32×32 JSON, 64×32 tiles, Ground/Detail, 6 trees/3 rocks, original tileset | PASS local/browser; 59 tests, five coordinate checkpoints matched actual layer | Tiled GUI open/save NOT TESTED; prototype-specific importer | Define ownership/occupancy separately from tile art |
| 005 Player | Pure state/movement, input interface, four-facing Idle/Walk atlas, footpoint view | PASS local/browser; 96 tests; four animation directions verified | 50ms delta cap discards stalls; four facings; fixed map constants | Preserve one authoritative movement path |
| 006 Keyboard | Screen-intent WASD adapter, opposing-key cancellation, focus/editable guards | PASS local/browser; 127 tests; owner later passes physical Alt-Tab | Key ghosting/assistive input not certified | Keep commands independent of device input |
| 007 Mobile | DOM joystick/Action, independent pointer IDs/capture, dead zone, safe-area/portrait layout | PASS local/emulation; 162 tests; later iPhone functional QA PASS by owner | Android/device matrix and numeric phone performance not verified | Keep HUD screen-fixed and regress multitouch |
| 008 Camera | Native footpoint startFollow, world bounds, 0.5–3 zoom, resize | PASS local/emulation; 190 tests, 260 native camera assertions; later owner QA PASS | Rectangular bounds leave diamond-corner gaps; lerp varies with frame rate | Preserve camera-independent domain state |
| 009 Collision/depth | Tiled AABBs, swept col/row slide, separate obstacle renders, stable foot-Y order | PASS local/emulation; 227 tests, actual collision and pixel occlusion checks | Static AABB only, col-first bias, no actor collision | Occupancy/large-building geometry needs explicit extension |
| 010 Monster AI | Seeded six-state FSM, bounded BFS, wander/chase/return, HIT/DEAD hooks, atlas | PASS local/emulation; 264 tests; browser states/path/occlusion/restart checks | One actor; angular paths; shared PlayerState/speed ceiling | Profile before increasing population; stable entity IDs first |
| 011 Combat | Pure health/arc/range/obstruction/cooldowns/events, Space/Attack, HIT/DEAD, manual recovery HUD | PASS local/emulation; 318 tests; later owner Chrome/iPhone functional PASS | Immediate single target, local authority, no loot or persistence | Never trust client combat rewards for economy |
| 012 Performance/device QA | DEV probe, reproducible soak/CDP tools, durable metrics, two Safari gesture fixes | PASS accepted; 351 tests; production Electron 600s; owner Chrome 10min/physical Alt-Tab and iPhone PASS | Chrome/phone numeric FPS NOT MEASURED; hardware/version gaps | Carry measurement matrix; no invented device capacity |
| 013 Final review | This matrix, architecture/debt/risk/license/security review, final regression/smoke, playable README, ADR outcome, Sprint 2 draft | PARTIAL: review deliverables complete; local checks PASS | Explicit hosted CI-green gate still open | Conditional GO for scoped planning; close CI before implementation merge |

Detailed task-time evidence: [Sprint backlog](../tasks/SPRINT-01.md),
[coordinates](./ISOMETRIC-COORDINATES.md), [tilemap](./ISOMETRIC-TILEMAP.md),
[movement](./PLAYER-MOVEMENT.md), [keyboard](./PC-KEYBOARD-CONTROLS.md),
[touch](./MOBILE-TOUCH-CONTROLS.md), [camera](./CAMERA-CONTROLS.md),
[collision/depth](./COLLISION-DEPTH.md), [AI](./MONSTER-AI.md),
[combat](./COMBAT.md), [performance](./PERFORMANCE-QA.md).

## 3. Test and QA evidence — separate environments

### Final local regression, executed during FDS-013

Windows PowerShell, Node 26.13.0 / pnpm 12.18.0. Installed Phaser 4.0.0,
Vite 6.4.5, TypeScript 5.7.3, Vitest 4.1.12. No dependency or lockfile changes.

| Command at repository root | Actual result |
|---|---|
| `pnpm.cmd install --frozen-lockfile` | First sandbox attempt denied access to pnpm store lock; approved retry exit 0, lockfile unchanged |
| `pnpm.cmd run lint` | PASS, exit 0; warnings treated as errors |
| `pnpm.cmd run typecheck` | PASS, exit 0 |
| `pnpm.cmd run test` | PASS, exit 0; **351 tests in 23 files**, Vitest reported 3.17s |
| `pnpm.cmd run build` | PASS, exit 0; Vite production output generated |
| `git diff --check` | PASS; rerun after documentation edits |

Install's pending Phaser agent-skill approval notice is informational: install
succeeded, no skill was enabled and no approval policy was changed. The approved
retry accessed the pnpm store; it did not enable unrestricted Full Access.

### Fresh production smoke, FDS-013

Served the rebuilt output with
`pnpm.cmd --dir apps/game exec vite preview --host 127.0.0.1 --port 8082 --strictPort`.
The task-tool launch was delayed; a direct terminal launch supplied the successful
server. When the delayed task started it exited 1 because that port was already
in use. This was not a second successful server or a product build failure.
Embedded browser: Code 1.145.1 / Electron 43.8.3 / Chromium 150.0.7871.250,
Windows x64. This is not independent Google Chrome or a physical phone.

At `/?perf=1&playerDemo=1`, one canvas and one touch overlay loaded; farm.tmj,
terrain.png, farmer.png and green-slime.png were requested successfully.
Space produced Miss feedback, Zoom+ changed 150% to 180%, page scale stayed 1.
No captured page/console errors, HTTP >=400 responses or failed requests during
the successful reload/interaction interval. Zero performance overlays despite
the query; the production entry excludes the demo/profiler branches.
WASD down/up was dispatched, but this short smoke did not assert travel distance,
collision or new FPS statistics. Existing evidence covers those independently.

The integrated host restored its viewport to about 293×171 despite requested
1024×600. A later screenshot showed clipped controls and Recover click timed out
with canvas interception; a repeated attempt had the same limitation. Those
checks are **NOT VERIFIED**, not PASS or evidence of target-size layout failure.
The unsuitable screenshot is not retained as target-viewport proof. Do not replace
the owner's successful target-device/recovery QA with this constrained-host result.
No new 10-minute benchmark or physical Alt-Tab was performed in FDS-013.

### Accepted prior measurement / manual evidence

| Environment and source | Result | Limits that remain attached to that source |
|---|---|---|
| Agent production Electron/Chromium benchmark | 600.2443s elapsed, 600.0625s captured; 60.037079 mean FPS, 16.656373ms mean, global p95 17ms, max 32ms; >33.3 / >50ms = 0/0; 10 restarts, stable 20 objects / 1 Slime / 9 obstacles | Engine poststep cadence, not compositor FPS; five blur/focus pairs, 62 unfocused callbacks; not uninterrupted focus; Slime HIT/DEAD not observed in this benchmark |
| Agent development soak | 600.0015s elapsed; 60.0375 mean FPS; all FSM modes, combat/recovery cycles observed | DEV fixtures/instrumentation; never substitute for production or phone performance |
| Owner independent Chrome 157.0.8103.38, Windows 11 Pro, LAN URL :8080 | 10 continuous minutes functional PASS; WASD/Space, combat HIT/DEAD, KO/recover, collision/depth, camera/resize, restart/reload; physical Alt-Tab held-input return PASS | FPS/frame time NOT MEASURED; build mode/hash/date/hardware not supplied; console report retains conditional DevTools wording |
| Owner physical iPhone Safari | Functional QA and FIX-002 10/10 retest PASS; **FIX-001 CLOSED, FIX-002 CLOSED** | Model, iOS/Safari version, numerical FPS not supplied; not agent-operated QA or multi-phone certification |
| Historical agent independent Chrome attempt | NOT TESTED; hidden page, frame counter 0, completed=false | Not 0 FPS; preserve failed artifact, do not rewrite it as owner Chrome PASS |

Raw evidence: [production Electron](./qa/fds012-production-embedded.json),
[development soak](./qa/fds012-soak.json),
[unsuccessful agent Chrome attempt](./qa/fds012-production-chrome.json).
Methodology, hardware that was actually verified, heap caveats and owner reports
remain in [PERFORMANCE-QA](./PERFORMANCE-QA.md). No measured values are reassigned
between environments. Heap variation/stable counters do not prove absence of leaks.

The fresh production JS SHA256 values match the recorded benchmark bundles:

```text
index-CEBRnW4o.js  1DD95571D75194637D1B4D33092918A76E72DB2E137DC40A7E3598A2770B015B
phaser-BEsb1Ci6.js F19075BECD34638B9D81CBB9E8BE865E295D1D2646742E239058BFC0EDE90F36
```

### CI and original acceptance gates

[Workflow](../.github/workflows/ci.yml) reviewed: push + pull_request, Ubuntu,
Node 26, pnpm 12.18.0, frozen install -> lint -> typecheck -> unit tests -> build,
15-minute timeout, contents:read, no secrets/deploy or continue-on-error. Local
commands are green. GitHub CLI is unavailable; public API inspection did not
return an accessible run. **Hosted CI success/failure propagation NOT VERIFIED.**
Do not infer green from YAML or from the existence of an origin remote.

Sprint acceptance gates 1–7 and 9–10 have scoped local/browser/owner evidence.
Gate 8's desktop/phone FPS target is not fully measured: Electron timing exists,
phone/Chrome numeric timing does not. FDS-012 was explicitly accepted by the owner
with that limitation; the wording is not silently changed into measured phone FPS.
The original actor-overlap checkbox exceeds implemented static collision scope;
actor-to-actor collision remains deferred. Trusted-Wi-Fi-only exposure is operator
policy, not verified by functional QA. Broad manual checklist boxes must not all
be checked merely because a ticket passed. Hosted CI remains the open FDS-013 gate.

## 4. Architecture readiness

| Area | Actual responsibility and coupling | Readiness / regression considerations |
|---|---|---|
| Foundation | Standalone apps/game; root delegates scripts; strict TS/property initialization; skipLibCheck affects dependency declarations | Appropriate prototype foundation; no portal/API scaffold needed. ESLint recommended rules are not type-aware; tests mix TS and Node mjs |
| Coordinates / Tiled | Pure core/isometric; camera.getWorldPoint adapter; top origin (1024,0), layer (992,0); ordinary TilemapLayer | One projection; reuse it. Importer validates this exact map, not arbitrary maps/elevation/parallax |
| Player / inputs | Pure movement/state, Player composition, PlayerView footpoint/animation; keyboard/touch sample once via CombinedInput | Good device/domain boundary; joystick ownership priority and edge latches are tested. Shared fixed Player constants constrain Monster reuse |
| Camera | Native startFollow; no second camera update; DOM zoom HUD stays screen-fixed | Good isolation; world AABB clamping and frame-based lerp are explicit tradeoffs |
| Collision / render | Pure static footprint resolver; map is sole metadata source; separate obstacle graphics; foot-Y tie policy | One position writer; column-first bias accepted. DisplayList comparator replacement is Phaser-version coupled and must retain cleanup tests |
| AI | Pure seeded FSM + bounded path module; Monster adapter reuses movement and view lifecycle | Testable/replayable for one actor; speed <=3 and 32×32 BFS assumptions need deliberate expansion, not a new movement engine |
| Combat | Pure state/events; controller samples once after Player/Monster, maps events to FSM and HUD | No competing HP/position writer; one target and immediate activation are prototype constraints, not network-ready combat |
| Performance | DEV-only bounded probe; separate CDP tools; native poststep timing/AI update cost | Repeatable instrumentation; sorting, probes and retained buffers affect measurements; no device capacity guarantee |
| Scene / lifecycle | Scene assembles loaders/map/Player/AI/combat/input/camera and update order; adapters own cleanup | Acceptable composition root, but createMap validation/error paths and async DEV imports grow coupling; extract only when a second scene/content need warrants it |
| Tests / CI | 351 pure/adapter/mock tests; native browser diagnostics and owner device QA complement them | Strong regression baseline; cloud CI does not run WebGL/browser/device diagnostics. No coverage percentage or complete formal verification claimed |

Domain rules are still under apps/game/src/core rather than shared packages/core.
This matches the existing one-consumer decision; extract when a real second
consumer exists. Do not mistake readonly TS state or fixed seeds for secure,
bit-identical server-authoritative simulation. No broad refactor is needed now.

## 5. Technical debt register

P1 = address before its dependent feature/release; P2 = planned follow-up;
P3 = housekeeping. None is automatically a Sprint 2 gameplay blocker.

| ID / priority | Debt and impact | Proposed treatment | Appropriate phase |
|---|---|---|---|
| TD-01 P2 | Col-first resolver biases corner sliding; frame partitions can differ near contacts | Preserve regression traces; compare symmetric sweep only if playtests expose a problem | Before complex movement/geometry |
| TD-02 P1 | Static AABB only; importer accepts tree/rock footprints <=1 cell | Define separate occupancy and scalable footprint contracts; extend importer/geometry with fixtures | Before multi-cell building placement; not during this review |
| TD-03 P2 | Four-neighbor BFS looks angular; bounded 1024-node work/replan costs | Measure population/cost; then consider caching, smoothing/A* and budgets | Before multiple enemies/larger maps |
| TD-04 P2 | No actor-to-actor collision/avoidance; Player/Slime may overlap | Decide contact/separation rules; keep one movement authority | Before crowd gameplay |
| TD-05 P2 | Immediate single-target combat; GDD wind-up not simulated | Explicit attack phases/target collection with activation tests when required | Later combat scope, not basic state Sprint 2 |
| TD-06 P1 | No server authority, idempotency or trusted economy | Establish command/result, validation, operation IDs, authoritative time contracts first | Before real persistence, trading/rewards/purchases |
| TD-07 P2 | Chrome FPS NOT MEASURED | Foreground standalone production trace with build/device metadata | Next performance checkpoint |
| TD-08 P2 | No quantitative phone/device matrix or thermal benchmark | Record model/iOS/browser, Android and mid-range device traces | Before external alpha/capacity claims |
| TD-09 P1 | Hosted GitHub Actions NOT VERIFIED | Owner runs existing workflow; attach URL, SHA and logs; fix only an observed failure | Close FDS-013; before Sprint 2 implementation merge |
| TD-10 P2 | Frame-based follow smoothing; 50ms discarded stalls | Preserve local policy; evaluate fixed-step/authoritative timing separately | Before reconciliation/offline/time-sensitive systems |
| TD-11 P2 | DisplayList comparator/CDP closure inspection couple to Phaser internals/layout | Keep installed-API browser regression; abort QA introspection on mismatch | Any future engine change |
| TD-12 P2 | Finite position/origin validation claimed in coordinate doc but not performed by gridToWorld/worldToGrid | Define trusted internal vs public validated boundary; add explicit non-finite cases or narrow documentation in a scoped follow-up | Before accepting saved/external state; no new coordinate system |
| TD-13 P3 | App manifest/README retain template naming, npm guidance and old version examples; legacy setup sections historical | Root README is authoritative; clean template metadata/docs in a scoped housekeeping task | Next documentation cleanup |
| TD-14 P3 | Unused bg/logo copied to production; log.js telemetry utility retained but unused | After provenance review, deliberately remove unused files/utility if approved; never delete valuable source automatically | Packaging cleanup |
| TD-15 P2 | Test suite is not type-aware lint, renderer/device automation or leak proof | Add meaningful boundary/browser tests and retained-object study as risks justify | Before public alpha |
| TD-16 P2 | Prototype dots/hover highlight, whole-object trees, four-facing player and fixed map constants | Treat as intentional prototype features; decide diagnostics gating, content scale/elevation/depth splitting | Before polished content/buildings |
| TD-17 P2 | Async DEV import can attach to a restarted active Scene; fail-load paths only broadly caught | Consider lifecycle generation token/failed-load teardown tests if scenes expand | Before multi-scene/HMR tooling expansion |

TD-12/17 are inspection findings, not reproduced blocking gameplay defects;
no architecture or behavior changes are made to conceal them.

## 6. Risk register

| Risk | Likelihood / impact | Mitigation / owner and gate |
|---|---|---|
| Sprint 2 expands directly into eight systems | High / high | Owner approves a small state/item slice; defer shop/buildings to later increments |
| Local saves/currency treated as commercial authority | High / high | Domain command validation now; server/transactions/time later before trusted mutations |
| Device performance inferred from Electron | Medium / high | Keep source-attributed metrics; owner/device QA captures separate traces |
| Hosted/Linux install differs from local warm store | Medium / high | Verify frozen install and all steps on actual GitHub runner before next merge |
| New buildings invalidate occupancy/path/depth assumptions | High / medium | Static AABB/footprint/ownership ADR and fixtures before placement work |
| Input/gesture regression after adding HUD | Medium / high | Reuse guard allowlist deliberately; real iPhone retest, editable content and cleanup regressions |
| Dependency/license/security confidence overstated | Medium / high | Keep notices, review advisories/license inventory before release; no clean-security certification |
| GDD beta confused with finished prototype | Medium / high | Explicit local-only status; persistence/offline/economy/operations remain release gates |

## 7. Assets, licenses, dependencies and security

| Asset group | Provenance / review result |
|---|---|
| farm.tmj / terrain.png and tree/rock Graphics | Project original procedural/authored content; generator and ObstacleRenderer source retained; MIT attribution |
| farmer.png / green-slime.png | Project original procedural pixel art; generate-player / generate-slime sources; MIT attribution |
| bg.png / logo.png / favicon.png / template screenshot | Retained Phaser Studio template; template MIT notice retained; old background/logo not loaded by map but still copied from public |
| Music/fonts/downloaded commercial art | None used by current scene; no ripped third-party assets found in reviewed inventory |

See [attribution and full original-asset terms](../apps/game/public/assets/ATTRIBUTION.md)
and [template MIT license](../apps/game/LICENSE). Installed Phaser includes its
MIT notice. This is a repository provenance review, not an independent legal
ownership certification. Before distribution, retain dependency copyright/license
notices too: production minification removes comments, and this review did not
generate a complete transitive license/SBOM bundle.

Security scan of the initial **117 tracked/nonignored files** found no matches
for private-key, AWS access-key, GitHub-token and OpenAI-token patterns; no tracked
.env files. No secret values were printed. .gitignore excludes .env variants;
.codex config stays workspace-write/on-request. Reviewed workflow requires no
secrets and has read-only repository permissions. This bounded pattern scan is
not a full secret-history/security audit or proof of no credentials. Review the
final staged diff again before any future commit.

Dependencies/scripts: no versions changed; root private package pins pnpm
12.18.0. Phaser exactly 4.0.0; installed TS/Vite retained. Only esbuild is allowed
dependency build scripts. Dev/build invoke Vite directly; retained log.js contains
a telemetry request but is not called by current scripts/imports. The template's
build banner only writes stdout. No runtime auth, database, payments, API or
multiplayer endpoint added. Frozen install reused existing store, not a fresh
Linux install or online vulnerability audit. No claim of vulnerability-free
dependencies; review advisories before release in an authorized follow-up.

Production bundle review: no playerDemo, DemoInput, DevPerformance,
performance-overlay, keyboardCheck or soak-helper tokens in emitted JS;
tests/tools are outside production entry and not copied into dist. Guard code
is intentionally production Safari compatibility, not debug scaffolding.
Prototype map checkpoints/hover hints intentionally remain visible; do not
claim all diagnostic-looking graphics were removed. Default production has no
performance overlay or privileged debug global. Release/deploy, headers/CSP,
hosted CI, browser support beyond supplied evidence and full accessibility are
not verified. Action's pointer-only DOM activation merits an explicit keyboard/
assistive-accessibility review later; Space remains the desktop attack binding.

## 8. Sprint 2 proposed backlog — plan only

This draft is narrower than the full feature list and earlier roadmap. It is a
proposed reprioritization, not silent approval of an accelerated farming release.
No files/packages for these systems are implemented. Owner approval is required
to select tickets, estimates and any change to the master roadmap.

Recommended committed scope: S2-D01–D03 plus regression/review, roughly 18–24
focused hours with buffer. Stretch work is excluded until that slice passes.

| Draft | Deliverable and acceptance | Dependencies / authority boundary | Scope |
|---|---|---|---|
| S2-D01 State/authority ADR, 4–6h | Versioned GameState, stable entity/definition IDs, command/result/error contracts, ownership/time rules, state boundaries documented | Baseline CI gate; client intents never provide authoritative reward, balance or elapsed time | Commit proposal |
| S2-D02 State snapshot/persistence seam, 6–8h | Pure serialize/validate/migrate round trip; reject invalid/version-mismatched data; explicit in-memory adapter. Optional local save only by separate approval, labelled untrusted/resettable | D01; no accounts/backend/DB. Clock and persistence adapters injectable; server later owns persistent timeline | Commit proposal |
| S2-D03 Item definitions/inventory rules, 6–8h | One small item catalog, integer quantity/capacity rules, atomic add/remove failure semantics, duplicate command/replay tests; minimal inspection UI if approved | D01–02; definition version + operation ID; no loot/drop/shop/currency reward integration | Commit proposal |
| S2-QA Review/regression, 2h+buffer | Frozen install, quality commands, state migration/replay tests, existing input/combat/device regression; no invented save security | D01–03; preserve 351-test baseline plus meaningful new cases | Commit proposal |
| Later Currency/economy foundation | Integer money/ledger, price/version rules, idempotent mutations, transaction plan | Stable state/items first; server validation/ACID before commercial balances | Deferred |
| Later Farming plots/crop growth | Separate owned/buildable/occupied cells; crop definitions; injected authoritative time and deterministic transitions | State/definitions/ownership; cap catch-up and validate timestamps; 24×24 proposed build area is not the 32×32 prototype map | Deferred |
| Later Harvesting | One atomic crop-ready -> inventory mutation, capacity rollback and duplicate retry tests | Inventory + plots/growth + operation IDs | Deferred |
| Later Basic shop | Buy/sell commands atomic across inventory/wallet, price validated at authority, no client-granted balances | Inventory + economy; persistent economy requires trusted service design | Deferred |
| Later Land expansion | Contiguous owned-cell purchase, occupancy/price rules and replay-safe transaction | Ownership + wallet; don't infer ownership from terrain graphics | Deferred |
| Later Building/construction foundation | Multi-cell footprint/rotation/occupancy and lifecycle timestamps; preview separate from validated placement | Geometry debt TD-02, ownership/items/economy/time; later server validates and persists | Deferred |

Ordering: authority/state -> validation/persistence seam -> definitions/inventory
-> economy and plots -> growth/harvest -> shop/expansion -> construction.
The last groups can be split across future Sprints. No wall-clock localStorage
progress should be sold as server-authoritative offline simulation. A future
service validates identity/ownership, quantities, cooldown/rewards, prices and
time; transaction/idempotency guarantees precede trusted persistence. Multiplayer
movement reconciliation is a separate later milestone, not a Sprint 2 dependency.

## 9. Git checkpoint and remaining acceptance work

Initial status was clean at fe67496. Prior work is already preserved:
cd62b07 contains collision/depth and Monster AI; e19ac93 combat;
5189e55 performance/stability QA; fe67496 final QA and Safari fixes.
The earlier risk of uncommitted FDS-009–012 work is not present at this baseline.
This review changes documentation only; no runtime source/asset/lockfile changes.
Temporary task configuration and an unsuitable host-clipped screenshot created
during inspection were removed; neither is a project deliverable.

Suggested owner-operated checkpoint, after reviewing this report:

1. Review `git status --short`, `git diff`, untracked report and `git diff --check`.
2. Stage only the reviewed README, ADR, Sprint backlog and final report. Inspect
   `git diff --cached --stat`, full staged diff and secret/license notices.
3. Owner may create a documentation review checkpoint without rewriting existing
   commits; do not label it all-13-PASS while the hosted gate is open.
4. When the owner chooses to push, inspect Actions -> Development Quality / PR
   Checks; retain the green run URL and matching commit SHA. No push done here.
5. After actual green evidence, update FDS-013/Sprint acceptance to PASS in a
   small follow-up. An optional annotated sprint-1-prototype tag can then point
   to the accepted checkpoint. No hard reset, clean, deletion or history rewrite.

Before Sprint 2 implementation merge: close CI evidence; approve D01–D03 scope
and untrusted-local/authoritative-future boundary. Before release: advisories and
license notices, device metadata/numeric phone benchmarks, target-browser matrix,
accessibility, hosted deployment/security and GDD beta gates. These are distinct
from permission to start the next small design ticket.
