# FDS2-007 — GameState Adoption & Native Browser Persistence QA Design

Status: **FDS2-007 DESIGN APPROVED — 2026-11-09**.
Final contract-level verification satisfied the owner's conditional document
approval. This approves the design only, not implementation or browser QA PASS.
Technical design only. No adoption code, harness, integration, storage operation,
migration or browser test is delivered by this document. All proposed tests below
are **PLANNED / NOT TESTED**. Separate owner approval is required before coding.

Subsequent owner authorization permits **FDS2-007A pure boundary only**, tracked
separately in section 9. Sections 1–8 retain the approved design checkpoint;
application adoption, session ownership and native QA remain unimplemented.

## 1. Verified baseline and actual integration boundary

Inspected clean main, empty index, exact HEAD
`95b6ea2c88af66377e9e4a0556516072d7e1f85d`. GitHub API independently verified
[Development Quality 42596640896](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42596640896)
completed/success for that exact SHA on 2026-11-09. FDS2-006 is IMPLEMENTATION
COMPLETE / CI VERIFIED; 758 tests / 29 files is historical regression evidence,
not a newly executed test result in this design task.

Retained contracts: [D1–D9 / T01–T38](./INVENTORY-PERSISTENCE-DESIGN.md),
[authority](./GAME-STATE-AUTHORITY.md), [architecture](./ARCHITECTURE.md),
[pure v2](./GAME-STATE-V2.md), [persistence](./PERSISTENCE-ARCHITECTURE.md),
[coordinator and audit corrections](./STORAGE-MIGRATION-COORDINATOR-DESIGN.md),
[Sprint 2](../tasks/SPRINT-02.md), [repository rules](../AGENTS.md).

| Inspected implementation | Actual contract / consequence |
|---|---|
| [gameState.ts](../apps/game/src/core/gameState.ts) | Strict v1 envelope, IDs, safe integer revisions/time, detached validation; leave public APIs unchanged |
| [gameStateV2.ts](../apps/game/src/core/gameStateV2.ts) | Strict bounded dispatcher, pinned catalog 1, deterministic v1/r -> v2/r+1/i0, aggregate operations; no storage/adoption |
| [gameStatePersistence.ts](../apps/game/src/core/gameStatePersistence.ts) | SnapshotStorage raw-string port and snapshotKey; existing service/codec remain v1-only, never save v2 through them |
| [storageMigrationCoordinator.ts](../apps/game/src/core/storageMigrationCoordinator.ts) | Explicit migration seam; four completed reconciliation outcomes, separate busy preflight; no adoption or normal v2 save API |
| [BrowserLocalStorageAdapter.ts](../apps/game/src/storage/BrowserLocalStorageAdapter.ts) | Injected provider; native synchronous localStorage behind async port; normalized storage errors, no enumeration/CAS |
| [InMemorySnapshotStorage.ts](../apps/game/src/storage/InMemorySnapshotStorage.ts) | Isolated fake strings; unit evidence cannot establish native browser durability/quota behavior |
| [main.ts](../apps/game/src/main.ts) -> [game/main.ts](../apps/game/src/game/main.ts) -> [Game.ts](../apps/game/src/game/scenes/Game.ts) | DOMContentLoaded starts Phaser; Scene creates runtime actors/input/camera/combat directly; no current persistent session, inventory consumer or startup migration |

Existing gameplay position/HP/AI/cooldowns remain transient. Adoption must not
deserialize actors, restart combat, import camera/input/DOM into GameState, grant
items or apply character death-drop rules to farm-scoped farm-main.

## 2. Proposed application-facing contracts (not exports)

Keep a pure decision boundary separate from asynchronous evidence verification
and from a later rendering/application adapter. Reuse existing result types;
do not redefine GameStateV2, MigrationReceipt, BackupReference or storage APIs.

```text
Pure evaluateAdoption(sessionSummary, capturedEvidence) -> AdoptionDecision

AdoptionDecision =
  { status: 'proposal-eligible', evidenceKind, identity, exactPrimary,
    state: detached GameStateV2, mutationPermission: 'read-only' }
  | { status: 'inspection-only', reason, mutationPermission: 'blocked' }
  | { status: 'migration-required', receipt, mutationPermission: 'blocked' }
  | { status: 'rejected', cause, mutationPermission: 'blocked' }

Future ApplicationSession (one aggregate, one coordinator):
  inspect() -> existing VersionedLoadResult, with session diagnostic
  migrate(receipt, authorization, retryResolution?) -> existing MigrationCommitResult
  reconcile(receipt) / inspectRecovery(reference?) -> existing attempt results
  proposeAdoption(capturedEvidence) -> proposal-issued | refusal
  adopt(proposalHandle, explicitAuthorization) -> Promise<AdoptionResult>
  close() -> invalidate transient proposals, no storage mutation

AdoptionResult =
  { status: 'adopted-read-only', identity, exactPrimary, state,
    history: 'confirmed-in-live-session' | 'reconciled-current-target',
    persistentMutations: 'blocked', normalV2Save: 'not-implemented' }
  | { status: 'busy', gateUnchanged: true }
  | { status: 'refused', code, cause?, persistentMutations: 'blocked' }
```

Required refusal codes: invalid-evidence, invalid-authorization, wrong-target,
stale-proposal, source-changed, unresolved-history, unresolved-commit,
competing-writer, storage-error, unsupported-state, session-closed. Preserve the
original typed storage/parser/domain cause, offsets and field issues where supplied;
do not replace them with message matching. No failure includes an active candidate.

Captured evidence is a detached, session-owned combination of an actual explicit
operation and its result: accepted load + raw source; retained receipt + verified
committed/already-migrated commit result; or receipt + completed already-migrated
reconciliation (possibly reconstructed from a known BackupReference). Missing,
prepared, retained-source, busy, conflict and unknown are never v2 adoption evidence.
Copy and validate before awaits; arbitrary caller-supplied status='committed' is
not trusted evidence. This is an ordinary-data/local application boundary, not
protection from adversarial JavaScript or a server-authenticated capability.

A loaded-v2 proposal in a confirmed live session must exactly match that session's
last verified committed observation, including raw string and complete state. A
newer/different valid load cannot become eligible merely because the session once
verified some older snapshot. It requires its own separately approved transition
and persistence evidence; normal v2 save is not supplied here. Unresolved history
or conflict overrides any prior success until an allowed explicit resolution.

Proposals are internal detached observations with complete identity, both revisions,
schema/catalog, exact raw primary and evidence provenance. An opaque in-memory
proposal handle is bound to its issuing session instance and monotonic generation;
only one outstanding adoption proposal per session. No serialized handle can be
replayed after restart or in another session. Counter overflow refuses issuance.
These handles do not add persistent metadata, a journal, secrets or schema fields.

Explicit authorization contains ownerId, approval='explicit-adopt-verified-state',
operatingMode='local-single-writer', competingWriter='none-known'. The handle binds
the exact reviewed proposal; UI must show identity, revisions and read-only mode.
Validate context/ownership before I/O. Approval is an operator decision, not login.
Known/suspected competition prevents adoption as well as migration. Adoption
authorization cannot substitute for migration authorization or authorize a save.

### Adopt algorithm and failure atomicity

1. Acquire the session active-operation guard; busy changes no previous gate or
   evidence. Validate issued handle, generation, authorization and history policy.
2. Revalidate the entire detached proposal using existing strict v2/identity/catalog
   rules. A migration proposal must match its rederived receipt.target exactly and
   complete candidate; no arbitrary state replacement is accepted.
3. For migration-derived adoption, explicitly invoke read-only reconcile(receipt),
   require already-migrated and verified backup, then reread primary via load.
   For a permitted same-live-session accepted-load proposal, load/reread again.
   Both paths require accepted v2, exact raw primary string equality, complete
   identity/state/counter/time/inventory equality with the issued proposal. Checks
   run sequentially, at most three reads for migration evidence, one otherwise.
4. If any check fails, invalidate proposal, retain previous adopted state only as
   a frozen diagnostic view, block all GameState mutation consumers and report the
   failure. Never publish a partial candidate or undo storage. No automatic retry.
5. On success, publish one validated immutable aggregate reference to the later
   application adapter, consume the proposal and mark adopted-read-only. Repeating
   the handle is stale-proposal, not another activation. No write or revision/time
   increment occurs. A rendering adapter must stage its view before swapping; a
   failed view build must not continue applying GameState commands to either copy.

Readback is a current observation under D8, not proof of historical acknowledgment,
durability, exclusive ownership or prevention of a write immediately afterward.
Adoption never clears the coordinator's blocked reconciliation gate. No clearGate,
coordinator recreation, restore or unrestricted raw-state installation API exists.
Future normal persistent mutations need their own approved service and gate policy;
adoption alone cannot supply that missing v2 save functionality.

## 3. Adoption decision matrix

In this proposed first boundary, **all persistent gameplay mutations remain blocked**,
including after read-only adoption, until normal v2 saving is separately approved.
An inspection proposal is not active gameplay state. Current Sprint 1 transient
gameplay can run only as an explicitly separate unsaved prototype, without issuing
GameState mutations or pretending it is persisted inventory gameplay.

| Observation | Proposal / explicit adoption | Required evidence / decision | Gate and caller report; never automatic |
|---|---|---|---|
| Missing primary | No v2 candidate/adoption | Confirm missing rather than access error; operator may request a separately designed new-game workflow | Blocked; show no snapshot. Never create state, inventory or overwrite on load |
| Valid v1 requiring migration | Migration candidate only, not adoptable | Strict parser, complete identity, safe revision, explicit migration authorization and D8 preconditions | Blocked for gameplay; offer explicit migration. No starter items or revision bump from preparation |
| Valid v2 accepted load | Inspect/propose only if history permits; load alone is insufficient | Exact source, validated full state, no unresolved session evidence; explicit adoption plus fresh reread | Startup history unknown -> inspection-only; do not equate accepted with old commit acknowledgment |
| Explicit commit verified | Eligible read-only proposal | Session-retained receipt, exact target + verified backup result; renewed checks at adopt and separate adoption approval | Adopted-read-only only after explicit call; an open coordinator gate does not activate gameplay or authorize normal saves |
| Already-migrated reconciliation | Eligible read-only proposal | Same receipt/known-reference reconstruction, verified backup, exact target, explicit adoption and fresh reread | Coordinator stays blocked; application can publish a read-only verified view, never infer historical writer |
| Original source confirmed retained | No v2 adoption | Exact source + backup observation; matching retryResolution and fresh migration approval for a new attempt | Blocked; report source retained. No automatic retry or candidate activation |
| Corrupt/incompatible primary | No adoption | Preserve typed cause and exact string for scoped inspection/export; compatible software/operator review | Blocked; never repair, downgrade, reset inventory or substitute backup |
| Storage access failure | No adoption | Normalized error/phase; operator may explicitly retry read after environment changes | Blocked; never turn failure into missing or fall back to memory as if saved |
| Conflicting primary or backup | No adoption from stale evidence | Exact retained receipt/current strings; operator inspection; new current-state policy requires separate review | Blocked; never overwrite newer data or reinitialize its inventory |
| Unknown commit status | No adoption until explicit target reconciliation succeeds | Retained receipt or known BackupReference; verified backup and exact current target required | Blocked; no blind second write, rollback or success based on write acknowledgment |
| Busy preflight | No new adoption proposal | Wait for active call to finish, then require a new explicit action | Preserve previous gate/proof. Not a fifth completed reconciliation result |
| Definite abort before primary write | No candidate adoption | Previously open migration gate may accept fresh authorization and repeat backup verification | Preserve previous gate; previously blocked remains blocked. Backup failure never authorizes gameplay |

## 4. Session ownership and startup policy

Propose a single application composition root owning identity, SnapshotStorage,
coordinator, operation guard and evidence/proposals. Scene restart must not create
a second persistent owner. The future Scene receives a read-only view, never
storage/adapters, a mutable cloned inventory authority or direct save capability.
Separately hold:

| Session data | Meaning |
|---|---|
| prepared candidate | Uncommitted migration result; never active or authoritative |
| verified committed observation | Validated stored string/state observed with provenance, not a durable historical certificate |
| active read-only aggregate | Explicitly adopted detached reference; views derive inventory from it |
| unresolved diagnostic | Current failure/receipt/reference; blocks mutation and invalidates pending proposals |

One active session operation per aggregate; busy refuses without queuing or gate
changes. Identity switch/close invalidates outstanding handles; a new aggregate
requires a different session, without overlapping writers for either. No listener,
timer, beforeunload save, background retry or automatic resume is implied.

Every fresh process starts with history **unestablished**, no active GameState and
persistent mutations blocked. It cannot prove no prior uncertain migration exists
from a successful load, an absent in-memory block or a claimed clean-shutdown flag.
Do not invent a durable journal or infer a source revision from g-1.

- Known receipt: explicit reconcile; exact target can become a proposal after
  verification and explicit adoption. Retained source permits explicit migration
  retry, not v2 adoption; conflict/unknown permit neither.
- Lost receipt but known BackupReference: explicit inspectRecovery; validate one
  referenced backup and current primary. Only embedded already-migrated permits
  target proposal; other outcomes retain their existing restrictions.
- No receipt/reference: accepted v2 may be displayed for inspection only. Report
  history-unestablished and require operator review; no backup enumeration or
  guessing. A general clean-v2 bootstrap/rebaseline policy is an open later owner
  decision, not an escape hatch included here. Missing/corrupt backup after an
  uncertain write remains a manual-recovery limitation even if primary parses.
- Valid v1 on fresh startup: an operator may explicitly assert the local single-
  writer operating precondition and authorize first migration through the existing
  protocol. A present unverifiable/conflicting backup stops that commit. This does
  not certify history or make old v1 active. It creates no automatic startup action.
  This first-migration path is unavailable if the operator/session reports an
  unresolved earlier attempt: that evidence takes precedence and requires explicit
  reconciliation; missing backup must not be reinterpreted as a fresh start.

Current-session uncertainty invalidates prior proposal generations immediately.
A later accepted load cannot erase it. Success of read-only reconciliation never
opens a mutation gate; only its permitted next explicit action can be considered.
The session guard does not exclude tabs, workers, old clients or DevTools. Operator
must close other writers; known competition refuses. There is **no multi-tab CAS**.
Production multi-writer migration remains **BLOCKED** until separately approved
coordination or transactional storage. Client state/approval is not anti-cheat.

## 5. Independently executable native QA specification

### Environment, tooling and isolation prerequisites

All cases Q01–Q16 below are **PLANNED / NOT TESTED** in this task. Record actual
Chrome version/OS/hardware and physical iPhone model/iOS/Safari version only when
available. Integrated Electron/Chromium is separate evidence, never independent
Chrome or real iPhone PASS. Private mode availability must be observed, not assumed.

Use an owner-approved disposable browser profile and dedicated QA origin, e.g.
`http://localhost:8081` for desktop and the exact LAN URL/port for the phone.
Scheme/host/port define storage identity: localhost, LAN IP, HTTPS, different ports
and private profiles do not share snapshots. Use no real player profile/origin.
Record build SHA, dev/production, exact URL and browser storage policy per run.

Current code has no published production QA entry or adoption UI. A future approved
standalone QA harness is a prerequisite for production/adoption cases, not something
this task implements. It must import the existing coordinator/domain/adapter and
log the exact public calls and results, storage operation counts, raw strings and
explicit approvals. Provide Step/Read/Prepare/Commit/Reconcile/Inspect/Adopt controls
with no on-load writes. Never expose the harness in the ordinary release entry.
Build it as a separately selected QA artifact using the same pinned dependency
lockfile and production transforms; label it **production-optimized QA harness**,
not evidence of persistence integrated into the shipped game. Main game startup
no-storage behavior needs its own smoke case. Dev and optimized runs are separate.

Dev-only independent execution can use browser DevTools module imports served by
Vite, e.g. `/src/core/storageMigrationCoordinator.ts` and
`/src/storage/BrowserLocalStorageAdapter.ts`, composing an injected native
localStorage provider. Do not assume these paths exist in dist or that modules are
window globals. Adoption-specific actions remain unavailable until its separate
implementation. Before QA, freeze a reviewed harness revision and operator script
implementing the exact fixture/actions below; no hand-coded alternate migration.

Proposed commands for later execution (NOT run here):

```powershell
pnpm.cmd --dir apps/game run dev --host 0.0.0.0 --port 8081 --strictPort
pnpm.cmd run build
pnpm.cmd --dir apps/game exec vite preview --host 0.0.0.0 --port 8082 --strictPort
```

The preview command serves today's ordinary build only; its smoke test must show
no storage integration. Future QA harness build/serve command must be separately
reviewed when tooling exists. Never report production storage QA from dev imports.
For phone testing, owner permits LAN access and records the exact reachable origin;
no public deployment, TLS bypass or system-policy change is implied.

### Disposable fixture and explicit key manifest

Operator selects a unique valid ASCII run ID, e.g. qa007-20261109-a (not automatic
wall-clock game time). IDs: gameId=run ID, farmId=farm-a, ownerId=qa-owner.
Use farm-b for isolation cases. Check designated keys absent **before** seeding;
if occupied, stop and choose another run ID, never overwrite earlier evidence.
Retain an operator-held manifest outside localStorage with identity, origin,
source revision, exact source/target and known BackupReference; it is not trusted
authentication, discovery or a persistent schema extension.

Fixture v1 is exactly schemaVersion 1, those IDs, logicalTimeMs 100, metadata
revision 7, createdAtLogicalMs 10, updatedAtLogicalMs 80. Save this source string
verbatim in the manifest, including an alternate CRLF/escaped-key/member-order
fixture. Pure preparation gives v2 schema 2/catalog 1, g8/i0, farm-main, owner match,
capacity 20 and 20 explicit nulls; logical time and both timestamps unchanged.
For nonempty newer-v2 cases, use existing authorized aggregate addItem wood=5 to
derive g9/i1 with the same times except updatedAtLogicalMs=100. Seeding a fixture
is an explicit QA-only raw write to an absent designated key, not normal v2 save.

Manifest keys, derived with validated components and existing namespace rules:

- P = snapshotKey(identity), existing primary namespace without version suffix.
- B = farm-development:game-state-backup:<encoded game>:<encoded farm>:<encoded owner>:v1:r7.
- P2/B2 = same derivation for farm-b, if needed.
- Quota padding = farm-development:qa-only:<run ID>:pad:<explicit index>.

No enumeration, localStorage.clear(), blanket namespace deletion, revision guessing
or unlisted cleanup keys. Each case uses a fresh identity unless it explicitly
continues migration/reload of the same fixture. On failure retain/export the exact
disposable strings and manifest; cleanup only after explicit operator confirmation.
Backups stay retained through every success/failure/retry scenario. Final QA-only
cleanup may remove exactly manifest-listed P/B/P2/B2/padding keys with owner consent;
it is not a coordinator feature. Verify those keys absent and unrelated sentinel
unchanged. Do not log/export secrets or real player storage.

### Evidence template and acceptance

For each case capture: date/operator, browser+version, OS/device, physical vs
emulated, build SHA/mode, exact origin, manifest, pre/post P/B strings, strict
equality booleans, g/i/timestamps/slot totals, API result/cause/phase/disposition,
session/gate state, read/write/remove counts and console/network errors. Screenshots
are supporting evidence, not substitutes for stored-string assertions. Store
unescaped text exports as well as escaped display; compare JS UTF-16 sequences with
===, never normalize or claim disk-byte preservation. Use bigint per-item totals
for nonempty fixtures. Unexecuted/unreproducible cases remain NOT TESTED, not PASS.

Apply Q01–Q12 and Q14–Q16 separately to native desktop Chrome and physical iPhone
Safari, dev and optimized harness where supported. Q13 deliberately violates the
single-writer assumption in an isolated test, never normal gameplay. Every row
uses the manifest fixture/key scope and the evidence/cleanup rules above.

| Case | Preconditions / explicit actions | Expected stored strings, state and acceptance |
|---|---|---|
| Q01 Missing / startup | Fresh manifest keys; open, load, reload; do not seed yet | missing; P/B absent; zero writes/removes and no adopted state. Main-game dev/production entry also must not access these keys |
| Q02 Native migration | Seed v1 P; load -> migration-required; prepare; explicit authorized commit | B===source, P===target, committed/target-verified, g8/i0 and unchanged times; one primary write, no automatic adoption. Explicit adopt separately verifies then read-only view |
| Q03 Reload/reopen same origin | Continue Q02; retain manifest/reference outside process; reload, then close/reopen tab | load accepted is inspection only on new session; explicit inspectRecovery(ref) -> already-migrated; zero writes, exact B/P retained; explicit adoption plus reread required |
| Q04 Exact-target retry | Q02 target and B intact; explicit commit with same verified receipt; compare counts | already-migrated, zero writes and no extra g/i bump or inventory reset. Separate reconciliation remains blocked and cannot itself activate |
| Q05 Text equality / backup conflict | Fresh alternate escaped/CRLF/reordered source; commit; also use a separate identity with parsed-equivalent but text-different preexisting B | Successful B retains exact source; conflicting B aborts untouched. Equivalent reordered P target produces conflict on reconcile, never success from structural equality |
| Q06 Corrupt primary | Fresh disposable P='{' plus valid referenced B; load, inspectRecovery; no commit action | rejected malformed; recovery reports reconstructed receipt with unknown primary. Preserve both strings; no automatic restore, reset or adoption |
| Q07 Incompatible / invalid | Separate cases for future schema, unknown catalog, unknown item, revision/quantity/duplicate-key/precision error and foreign identity | Typed rejection/conflict/unknown as existing APIs specify; raw P retained, no writes/adoption. Also test valid different MAX v1 -> source-changed conflict with overflow diagnostic |
| Q08 Newer nonempty primary | B/source and original receipt known; P is valid g9/i1 wood5 fixture; reconcile/inspect | conflict, P/B unchanged, wood5 and all slots preserved; no migration-empty inventory or stale adoption |
| Q09 Access/private storage | Dedicated profile; explicitly block site storage if reproducible; separately run private mode without assuming it fails | Provider/read/write failures normalized; not missing or successful save. If private mode supports storage, report its actual result and retention; unavailable fault NOT REPRODUCED/NOT TESTED separately |
| Q10 Real quota | Dedicated throwaway origin/profile; seed P then explicitly fill only manifest padding, try commit | When backup creation fails: quota-exceeded, P===source, no primary write/deletion. If quota cannot be reached within limits, NOT TESTED; mocked exceptions are separate evidence |
| Q11 Interrupted / lost acknowledgment | Harness checkpoint before primary vs after native write; retain receipt/reference; explicit stop/reload then inspect | Observed source -> retained; exact target+valid B -> already-migrated; corrupt/missing/unreadable -> unknown. No automatic second write/adoption. Record actual crash vs debugger interruption vs injected acknowledgment failure distinctly |
| Q12 Unverifiable backup | Separate QA fixtures: attempted-write uncertainty then missing/corrupt/conflicting B; read/reconcile only | blocked; no inference of safe retry or commit success even if P is v2. No backup recreation/rollback. Export/inspect only |
| Q13 Two-tab / old-writer conflict | Same disposable identity only; explicitly declare competitor and attempt; separately pause native-backed calls to demonstrate undetected race | Known competitor -> no writes. Controlled changed-before-reread -> conflict. Changed-after-reread may be overwritten; record race, never CAS PASS. Old v1 service rejects v2; production multi-writer remains blocked |
| Q14 Busy and safe retry | Pause initial native read using test-only barrier; invoke reconcile/recovery; finish load. Separately inject pre-primary backup-stage failure | busy preflight preserves gate; fresh explicit commit creates/verifies B; definite abort preserves prior gate. Injected-fault evidence is not real quota/crash evidence |
| Q15 Adoption / process loss | Valid target with matching receipt/ref; also no known reference, stale proposal, denied owner, changed P between proposal/adopt | Only exact reverified evidence + explicit permission activates read-only view. No-ref startup inspection only; accepted load never clears unknown. Zero adoption writes/removes; repeated handle stale; Scene restart no second session owner |
| Q16 Lifecycle / isolation / cleanup | Reopen same origin, app-switch/background/foreground, Scene restart; migrate farm-b; perform explicit listed-key cleanup last | No hidden writes/retries, duplicate owner/inventory authority or death-drop; P2/B2 isolated. Background alone cannot advance logicalTime. Cleanup only listed disposable keys, unrelated sentinel unchanged |

Quota procedure requires separate operator consent per disposable profile. Bound
padding to at most 64 explicitly listed keys / 64 Mi UTF-16 code units, at most
1 Mi per value, yielding to UI and allowing cancel between writes; never an
unbounded fill loop. Record the native first quota error and remaining space
uncertainty; smaller bounded final padding may be approved to reproduce the backup
failure. Stop at cap/error/cancel, never delete backup/primary to free quota. If
native eviction or storage policy makes the scenario indeterminate, stop and mark
it NOT TESTED. Preserve manifest outside the quota store so cleanup remains scoped.

Actual browser termination cannot reliably interrupt a synchronous setItem at a
chosen instruction. For Q11 use separate before/after native-call barriers for
reproducible boundary observations; injected throw-after-effect is explicitly a
native-backed fault test, not proof of power-loss durability. Actual device/process
termination, when performed, records the observed retained source/target/unknown
without pretending the precise internal crash point is known. No guaranteed
durability or memory-leak/performance conclusion follows from these cases.

## 6. Future implementation plan and acceptance gates

These are separately approvable **draft work packages**, not new tickets started
or a promise to combine all work in the next task. Final ticket IDs need owner
approval; do not assume FDS2-008 or any other number is authorized.

| Order | Proposed scope/files | Future acceptance / stop conditions |
|---|---|---|
| A | Pure core/stateAdoption.ts + tests, names subject to review | Matrix exhaustiveness; identity/full-state validation, immutable proposals, provenance/history rules, invalidation, no Phaser/DOM/I/O; legacy regressions preserved |
| B | Application session owner in a new application module + tests; no Scene wiring | Serialize actual operations, distinguish busy/completed outcomes, explicit authorization, exact reread, bounded reads and zero writes for adoption; handle stale handles, process-loss policy and renderer handoff failure; no reset API |
| C | Standalone opt-in native QA harness + operator instructions | Isolated fixture/key manifest, approved dev/optimized builds, no startup writes, no import in ordinary release, fault/native distinction; no new dependency by default |
| D | Independently executed browser QA evidence | Q01–Q16 per environment with exact results; native Chrome and real iPhone separately; unsupported cases NOT TESTED; no player data; blocking failures prevent integration approval |
| E | Separately scoped application/Scene integration with read-only state view | One owner across restarts; runtime state untouched, no duplicate inventory, controls/camera/combat regressions; explicit adopt UI and failure display reviewed first |
| F | Normal v2 save/transaction acknowledgment policy, then optional autosave | Separate design/approval, domain candidate -> durable verified snapshot -> publication, expected g/i, unknown handling, startup policy, budget and fault tests; never call legacy v1 save with v2 |
| G | Farming or other inventory-consuming gameplay | Only after approved persistent mutation path and separate economic/authority rules; not part of adoption or QA work |

Existing parser, v1 contracts, adapters and coordinator exports can remain unchanged
for A–E: composition can use coordinator.load/reconcile plus an injected adapter.
Do not clear a coordinator block to implement read-only adoption. A normal v2
mutation path or durable recovery journal may need new reviewed contracts; they
are explicitly not supplied here. Browser QA can exercise the existing migration
seam before adoption implementation; Q15 waits for A/B and Q16 Scene wiring waits
for E. Do not label those deferred portions PASS after migration-only tests.

Future pure/session tests must cover every decision-matrix row, busy preserving
both prior gates, stale/equivalent changed text, valid MAX primary conflict,
authorization and immutable captures across awaits, unknown then accepted-load
still blocked, lost reference, source-retained retry vs adoption, reverified target
adoption without coordinator unblock, inventory conservation, repeated handles,
cross-session handles, identity switch, Scene restart and fake read failures.
Reuse T01–T38 classifications; Q IDs add browser procedures, do not renumber or
upgrade earlier fake-storage evidence into native PASS. Run actual root checks
after coding and report measured count rather than assuming 758.

Stop integration on any unexplained primary/backup mutation, false acknowledgment,
silent adoption/reset, duplicate writer, lost item, stale proposal activation or
protected-contract change. Freeze mutation/application handoff, preserve evidence,
create a scoped defect and seek review. Code rollback means disabling/reverting
the future integration under owner review, **never restoring an older snapshot**
over newer data. Destructive recovery/export/restore needs separate explicit design
and approval; it is not a QA cleanup or deployment rollback.

## 7. Owner decisions and remaining risks

| Decision required before coding | Proposed default / risk |
|---|---|
| Adoption permission | Approve read-only adoption first; persistent mutations remain blocked until F; no inventory UI/gameplay implied |
| Fresh v2 without receipt/reference | Inspection-only. A general current-state rebaseline policy and durable startup evidence remain separately blocked on review; availability is intentionally limited |
| Session/application placement and UI | One application owner outside Scene; explicit identity/revision/read-only disclosure; no hidden fallback |
| Harness packaging / environment | Separate opt-in dev and optimized QA artifact; ordinary build unchanged; approve profile/LAN origin and freeze harness revision before native tests |
| Quota, interruption and physical device access | Owner controls disposable profile, finite padding cap and actual termination; phone model/version must be supplied, never invented |
| Browser acceptance scope | Native Chrome plus real iPhone where available; unexecuted cases remain open; decide release blockers explicitly, not from emulation |
| Recovery and normal saves | No automatic restore, no backup authenticity, no history from counters alone; approve separate recovery/save contracts before economic mutations |

Race after revalidation remains possible; rereads do not provide CAS. Gate/proposals
are volatile, snapshots and owner context forgeable, quota/eviction may destroy
availability, backups consume storage indefinitely. Production multi-writer remains
**BLOCKED**. No backend/authentication, durable transaction, encryption or cloud
recovery guarantee is introduced. No architecture exception to D1–D9 is proposed;
fresh-session availability restrictions and future rebaseline policy need explicit
owner acceptance before implementation, not an implicit inference from v2 validity.

## 8. Verification scope

Documentation-only verification: baseline/status and exact CI checked; whitespace,
final newline, relative links, git diff --check, exact changed-file scope and
protected-source/dependency/CI guards. No new unit/browser/build results claimed.
Existing 758 tests / 29 files remains historical. No real snapshot access, harness
execution, migration or follow-up implementation in FDS2-007. The final checkpoint
authorizes one local documentation commit only, not push or merge.

Executed on 2026-11-09: `git diff --check` PASS (exit 0); both changed/new documents
PASS trailing-whitespace, final-newline and relative-link scans; exact two-document
scope and empty staging confirmed. Protected source/adapters/assets/dependencies/
CI, existing coordinator design and original D1–D9/T01–T38 file have no diff.
Branch/HEAD still match baseline. No regression, build, browser or native storage
test was executed for this documentation-only checkpoint.

### Final design approval checkpoint — 2026-11-09

**FDS2-007 DESIGN APPROVED — 2026-11-09**. Final review verified the twelve
owner-required adoption/session/safety conditions: separate candidate/verified/
active state; provenance and explicit authorization; exact stored-string recheck;
conservative startup; read-only adoption without persistent mutation permission;
no automatic adoption/create/reset/repair/grant/restore; retained coordinator
busy/completed-gate semantics; one session owner without cross-tab exclusion;
normal v2 save separately deferred; no activation from an open coordinator gate;
and explicit authenticity/crash/CAS limits. Each decision-matrix row specifies
evidence, permitted action, forbidden automatic behavior, mutation disposition and
diagnostic/reporting treatment, with the common typed-error rules applying.

All sixteen Q01–Q16 rows were reviewed with their shared environment, disposable
fixture/key manifest, evidence and restricted-cleanup prerequisites. Preconditions,
actions and expected results define acceptance; deviations from required safety
invariants trigger the documented stop/failure process. Chrome, physical iPhone,
dev/optimized harness and injected-vs-real faults remain separate evidence classes.
Unavailable scenarios remain NOT TESTED. No real snapshots or clear-all allowed.
Q01–Q16 remain **PLANNED / NOT TESTED**, not executed acceptance evidence.

D1–D9, T01–T38, FDS2-001–006 acceptance and production multi-writer BLOCKED are
preserved. Read-only/startup policy is design-approved; coding, harness packaging,
native execution and any future normal-save/rebaseline/recovery changes still
need their separate approvals. No implementation or BROWSER QA PASS is recorded.

## 9. FDS2-007A pure implementation checkpoint — 2026-11-09

Historical pre-audit checkpoint: **FDS2-007A PASS local — awaiting owner source review**.
The targeted P2 correction below supersedes its readiness and issuance contract.
This is package A only;
the parent FDS2-007 DESIGN APPROVED status and Q01–Q16 classifications are unchanged.
Baseline main was clean at `398a5feb91876ca2056fd3bc48df17a69fe133bd`. GitHub API
independently verified [Development Quality 42600268118](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42600268118)
completed/success for that exact SHA before coding. No hosted CI claim for new code.

New pure [stateAdoption.ts](../apps/game/src/core/stateAdoption.ts) and adjacent
[tests](../apps/game/src/core/stateAdoption.test.ts) implement:

| Export | Actual contract |
|---|---|
| evaluateAdoption(unknown, unknown) -> AdoptionDecision | Four branches: proposal-eligible, inspection-only, migration-required, rejected; never adopted-read-only or write permission |
| AdoptionSessionSummary / AdoptionHistory | Exact identity, lifecycle open/closed/invalidated, observationId and unestablished/confirmed-in-live-session/reconciled-current-target/unresolved history; confirmed observations contain complete source/state, unresolved history retains typed cause |
| CapturedAdoptionEvidence | Exact tagged load/commit/reconciliation/recovery/failure wrappers using existing coordinator result/receipt/reference types; observationId must match the summary |
| AdoptionProposal | Validated identity, observationId, exactPrimary, full detached GameStateV2, evidenceKind and mutationPermission=read-only; frozen recursively at runtime |
| validateAdoptionAuthorization | Pure strict context check: explicit-adopt-verified-state, matching owner, local-single-writer, none-known competitor; returns read-only policy or blocked typed refusal; performs no adoption |
| validateAdoptionProposal | Pure reevaluation against current inputs; retained with a new immutable proposal or invalidated with blocked decision; no handles, generations, replacement publication or session state |

observationId is a caller-provided ASCII correlation label, not generated here,
not a durable metadata field, secret, freshness proof or storage certificate.
Package B must bind actual operations to their current session/correlation and
invalidate superseded evidence. This module checks label equality and complete
data consistency; it cannot establish that a caller-supplied storage result really
occurred. Internally consistent fabricated captures remain indistinguishable from
honest data to a pure function; neither catalog validation nor freeze is anti-cheat.

Receipt validation reuses parseVersionedGameState and validateGameStateV2, rederives
the deterministic candidate, checks full identity/source revision/candidate and
exact target. No runtime import of the coordinator/persistence service or adapter:
those result types are imported with import type only. No new definitions of
GameStateV2 or MigrationReceipt, storage calls, browser/Phaser/network access,
async operations, timers, wall clock, random IDs or background behavior.

### Implemented matrix and history policy

| Observation | Pure result / restriction |
|---|---|
| Missing | inspection-only/missing-primary; no candidate or implicit creation |
| Valid captured v1 | migration-required with revalidated detached uncommitted receipt; existing preparation only, no extra revision increment |
| Accepted v2 + unestablished history | inspection-only/unestablished-history; schema 2 never proves acknowledgment |
| Accepted v2 + confirmed observation | proposal only on exact raw/full-state match; newer, reordered raw text or different complete state rejects |
| Verified commit / completed already-migrated reconciliation / known-reference reconstructed target | proposal only when wrapper, receipt, result, identities, counters, full state and exact target agree; no adoption or gate clearing |
| Source retained | inspection-only/source-retained; retry-only classification, no v2 proposal |
| Corrupt/schema/catalog/revision/storage/conflict/unknown | rejected with detached typed cause/offset/issues; never backup substitution or missing-state fallback |
| Busy / definite pre-primary abort | inspection-only/busy or pre-primary-abort; input gate remains untouched, new action still needed |
| Closed / invalidated / unresolved session | no proposal; blocked inspection reason, or original typed failure retained if already rejected; unresolved history overrides positive observations |

Any existing confirmed history must match the candidate exactly for every positive
evidence kind, not just loads: old commit/recovery evidence cannot replace a newer
known inventory. A genuinely new verified transition requires package B's explicit
history policy and correctly captured summary; package A never updates history.
Malformed session/evidence and stale correlation labels reject before eligibility.

All accepted DTOs are defensive copies from strict validators/parser, then deeply
frozen, including identity, metadata, slots and stacks. No caller object is frozen
or retained as proposal authority. Equality operates only on validated canonical
DTOs; raw primary/target comparisons use exact UTF-16 string equality without
trimming, normalization or reserialization. Runtime diagnostic validation copies
only existing typed codes, safe offsets and dense path/message issues; malformed
diagnostic payloads reject rather than being echoed. Diagnostic arrays are bounded
at 2048 issues, paths 256 and messages 1024 UTF-16 units, without truncation/repair.

### Tests, self-audit and actual checks

**883 tests / 30 files PASS**, including **125 new pure-boundary tests** and every
758 existing test. Existing tests/source/adapters/coordinator were not modified.

New tests cover all four decision branches and observation classes; exact commit/
reconciliation/recovery provenance, wrong identities/references/revisions, forged
status-only records, raw-text equivalence rejection, nonempty inventories, deep
freeze/detachment, deterministic reevaluation, authorization refusal/precedence,
invalid/missing/accessor/unexpected fields, current failures overriding earlier
success, stale/closed/switched/invalidated sessions and pure proposal invalidation.
Edge cases include parser duplicate keys/precision/limits/offsets, both revision
fields, MAX_SAFE_INTEGER and preparation overflow, logical timestamps, invalid
quantities, 1000 slots and bigint per-item totals. No source state/time/item changes.

Self-audit corrected, within the new module: (1) all positive evidence must match
a newer confirmed history, (2) unvalidated objects are never string-coerced via
custom toString, (3) closed/unresolved policy does not erase a captured typed
failure, and (4) contradictory not-attempted/primary-write abort records reject.
No blocking source finding remains for the pure ordinary-data contract. This is
not opaque-handle enforcement, actual storage verification, backup authenticity,
historical acknowledgment or application mutation security.

Initial test typecheck failed on Node fs typings; test source inspection now uses
the existing Vite raw import support, without adding dependency/types or relaxing
strictness. One foreign-owner fixture initially mismatched its own inventory owner;
it was corrected to a valid foreign aggregate, retaining the exact identity-mismatch
assertion. Production validation was not weakened to satisfy the test.

| Command from repository root | Final actual result |
|---|---|
| pnpm.cmd run lint | PASS, exit 0 |
| pnpm.cmd run typecheck | PASS, exit 0 |
| pnpm.cmd run test | PASS, exit 0; 883 tests / 30 files, none skipped |
| pnpm.cmd run build | PASS, exit 0; unwired module does not imply browser acceptance |
| git diff --check | PASS, exit 0; new files also scanned for whitespace/newlines |

Package B still owns issued opaque handles, monotonic generations, operation guard,
explicit application authorization/adoption, proposal consumption and exact fresh
storage reread. C/D own harness/native QA. Normal v2 saving is **NOT IMPLEMENTED**;
Q01–Q16 remain **PLANNED / NOT TESTED**, native browser/quota/crash QA **NOT TESTED**,
production multi-writer migration **BLOCKED**. No real snapshot, migration, gameplay
integration, autosave, dependency, commit, push or follow-up package work.

Final guards PASS: exactly four changed/new files and empty staging; protected
tracked sources/tests/adapters/coordinator/gameplay/assets/dependencies/CI unchanged;
new files inspected separately from git diff; whitespace/final-newline/relative
links pass; no existing runtime import. Original approved sections 1–8 and
D1–D9/T01–T38/Q01–Q16 retained. Editor diagnostics report no errors in new TS files.

### Targeted P2 proposal-invalidation correction — 2026-11-09

**FDS2-007A READY FOR OWNER COMMIT REVIEW — PASS local**. Baseline remains main at
`398a5feb91876ca2056fd3bc48df17a69fe133bd`, empty staging and the same four-file scope.
No hosted CI claim for uncommitted code. Original design approvals remain intact.

Root cause: proposals retained identity/observation/raw state/evidence kind, but
not the policy under which they were issued. Revalidation reevaluated the current
summary, so an old commit/reconciliation/recovery capture still made a proposal
eligible after confirmed history became unestablished. Three regression cases
failed before the production fix: expected invalidated, received retained; all
883 previous tests passed in that red run (886 total, three failures).

The current AdoptionProposal additionally requires **issuanceHistory**, a detached,
deep-frozen snapshot of the validated eligible AdoptionHistory: unestablished or
confirmed-in-live-session/reconciled-current-target with full lastVerified source
and state. Unresolved history cannot issue a proposal. This reuses the existing
history representation; it adds no persistent field, schema version, timestamp,
token, session generation, arbitrary verified flag or new source of authority.

validateAdoptionProposal strictly validates/copies issuanceHistory using the same
session/history rules, rejects impossible issuance (including unknown-history load
or confirmed observation contradicting proposal raw/full state), then reevaluates
current evidence. Existing typed failures and blocked decisions are preserved.
When both decisions are eligible, the entire canonical issuance history must still
match exactly. A change of history kind, exact UTF-16 source or complete verified
state invalidates the old proposal with adoption/policy-changed where the fresh
decision is otherwise eligible. Missing/malformed/contradictory issuance metadata
returns invalid-proposal, blocked, without an actionable proposal payload.

| Issuance -> current policy | Old proposal revalidation | Separate fresh evaluation |
|---|---|---|
| Confirmed -> unchanged identical history | Retained, read-only, if all other evidence still agrees | Existing matrix applies |
| Confirmed -> unestablished | Invalidated/blocked, even with the same raw string, identity, observation ID and repeated verified capture | Internally valid verified commit/reconciliation/recovery may produce a new read-only proposal; accepted load stays inspection-only |
| Unestablished -> confirmed | Invalidated/blocked; no automatic promotion of the old proposal | A new proposal may be evaluated under the new policy |
| Confirmed -> reconciled-current-target | Invalidated/blocked even when the verified raw/state is identical | Existing matrix applies to the new policy |
| Any -> unresolved/closed/invalidated | Invalidated with existing blocked inspection/typed failure | No eligible proposal under unresolved/closed/invalidated policy |
| Verified source/state/counters/inventory change | Invalidated; no history inheritance across different observations | Must independently satisfy the current decision matrix |

Copies include nested metadata, inventory, dense slots and item stacks inside
lastVerified. Caller inputs remain unfrozen; later mutation cannot rewrite captured
history. Exact source comparison remains UTF-16 string equality. No storage access,
GameState/Inventory/time/revision mutation, adoption or policy-reset method exists.

This is a consistency binding, not proof that an operation happened or was newly
captured. A consistently fabricated/replaced DTO remains indistinguishable from
honest caller data. Package B must own actual operation provenance, opaque handles,
monotonic session generations, close/revocation, fresh storage reads and adoption.
The pure function cannot remember a previously rejected DTO or a historical policy
excursion omitted by the caller; it stores no revocation ledger. It does not add
an operation that resets invalidation. Replaying the old capture after a supplied
history downgrade does not retain the old proposal.

Measured final suite: **916 tests / 30 files PASS**, no skipped/deleted cases;
**158 adoption tests**, 33 added here plus all 883 previous cases. Coverage includes
the three unchanged red reproductions; unchanged and upgraded/downgraded policy;
unresolved/closed/invalidated contexts; all material history fields; malformed and
missing metadata; immutable detached history; repeated old evidence vs fresh
evaluation; and representative blocked negative outcomes with typed diagnostics.
Existing revision tests now assert exact metadata.revision/inventory.revision
paths. The proposal-field assertion explicitly includes issuanceHistory.

The first new immutability fixture failed typecheck because it directly assigned a
readonly session field; it now uses Reflect.set to exercise runtime caller mutation,
without weakening types or production validation. Before the larger coverage set,
the three original regressions passed after the fix (128 adoption cases).

Root lint, typecheck, full test and production build: PASS, exit 0. git diff --check,
four-file scope/empty staging, whitespace/final-newline/relative-link and protected
source/dependency/CI guards pass. No legacy/parser/coordinator/adapter/gameplay
change, dependency or real snapshot access. Q01–Q16 remain PLANNED / NOT TESTED;
native browser/quota/crash NOT TESTED; B/C/D and normal v2 save remain unimplemented;
production multi-writer remains BLOCKED. No commit, push or follow-up work.
