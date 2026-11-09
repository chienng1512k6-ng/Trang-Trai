# FDS2-006 — Storage Migration Coordinator Design

Status: **FDS2-006 DESIGN APPROVED — 2026-11-09**.
The owner accepted the architecture, implementation plan and review amendments.
Design approval does not authorize coordinator implementation or imply IMPLEMENTATION PASS.
No coordinator code, storage writes, migrations or snapshot changes were executed.

## 1. Baseline and retained decisions

Inspected clean main at `3ec3f84aba872477759eb3e3e9c5437a36a3afbc`.
GitHub API verification on 2026-11-07 found
[Development Quality 42369209539](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42369209539)
completed/success with that exact head SHA. FDS2-005's 602 tests/28 files are
historical acceptance evidence, not newly executed coordinator tests.

Canonical contracts: [approved D1–D9 / T01–T38](./INVENTORY-PERSISTENCE-DESIGN.md),
[pure v2](./GAME-STATE-V2.md), [authority](./GAME-STATE-AUTHORITY.md),
[architecture](./ARCHITECTURE.md) and [Sprint backlog](../tasks/SPRINT-02.md).
Retain farm-scoped farm-main, not a Player backpack; character death-drop rules
MUST NOT affect it. Keep schema/catalog pinning, migration g=r+1/i=0, exact source
string preservation, fail-closed validation and the D8 production multi-writer gate.
Do not alter v1 public APIs, their error semantics, schema or adapter contracts.

Inspected implementation and tests:

| Existing component | Reuse / integration constraint |
|---|---|
| [gameStatePersistence.ts](../apps/game/src/core/gameStatePersistence.ts) and [tests](../apps/game/src/core/gameStatePersistence.test.ts) | SnapshotStorage read/write/remove and snapshotKey; GameStatePersistence and v1 codec stay v1-only, never receive v2 candidates |
| [InMemorySnapshotStorage.ts](../apps/game/src/storage/InMemorySnapshotStorage.ts) | Per-instance async string Map, no transactions/enumeration; reuse unchanged |
| [BrowserLocalStorageAdapter.ts](../apps/game/src/storage/BrowserLocalStorageAdapter.ts) | Injected provider; no import-time browser access; normalized quota-exceeded/storage-unavailable; unchanged |
| [boundedJson.ts](../apps/game/src/core/boundedJson.ts) / [tests](../apps/game/src/core/boundedJson.test.ts) | Mandatory raw grammar/duplicate/numeric/resource gate; no unbounded fallback parser |
| [gameStateV2.ts](../apps/game/src/core/gameStateV2.ts) / [tests](../apps/game/src/core/gameStateV2.test.ts) | parseVersionedGameState, deterministic preparation/target, validateGameStateV2 and typed issues; no storage access |

## 2. Proposed API and result contracts

Names and sketches below are an implementation specification, not new exports.
One small coordinator is composed with an existing SnapshotStorage. It has no
Phaser, DOM, lifecycle listeners, clock, RNG, command bus or storage singleton.

```text
prepareMigration(source: string, identity: SnapshotIdentity) -> PreparationResult
    pure: wraps parseVersionedGameState(source, identity)

coordinator.load(identity) -> Promise<VersionedLoadResult>
coordinator.commit(receipt, authorization, retryResolution?) -> Promise<MigrationCommitResult>
coordinator.reconcile(receipt) -> Promise<ReconciliationResult>
coordinator.inspectRecovery(identity, backupReference?) -> Promise<RecoveryResult>
```

No save/remove/reset/restore operation is introduced in this ticket. No caller
can submit an arbitrary replacement v2 state. load performs one primary read;
it does not read/create backups or perform recovery implicitly.

Receipt is a detached, transient data record:

```text
MigrationReceipt {
  identity: {gameId, farmId, ownerId}, sourceVersion: 1, sourceRevision: r,
  source: exact original stored string,
  state: prepared GameStateV2, target: stable serialized v2 string
}
BackupReference {sourceVersion: 1, sourceRevision: nonnegative safe integer}
```

Receipt is not a persistent schema extension, credential or exactly-once ledger.
Copy/validate it before the first await; never retain caller-owned mutable DTOs.
On commit/reconcile, rederive preparation from receipt.source and identity;
require all receipt fields, source revision, complete candidate and exact target
string to match. Reject altered/extra/missing fields as invalid-preparation, never
silently repair or serialize a caller-modified candidate. Target ordering is the
existing pure preparation ordering. Reject source r=MAX_SAFE_INTEGER. There is
no injected wall-clock timestamp or second revision increment.

PreparationResult: prepared(receipt), already-v2(validated state/source), or
rejected(cause). An already-v2 result is not a migration receipt or write request.
VersionedLoadResult is a discriminated union:

| Status | Required payload / behavior |
|---|---|
| missing | Primary read returned null; no state creation, reset or inventory grant |
| migration-required | Receipt from a valid strict v1 source, correct identity and nonoverflowing revision; candidate uncommitted |
| accepted | Valid strict v2 + catalog + identity; detached state and original source, revisions/times unchanged |
| rejected | Exact parser/domain/version/identity cause; source retained by the caller-facing result where available; no write/delete |
| storage-error | quota-exceeded/storage-unavailable cause, primary-read phase; no fabricated missing result |

Use an explicit nested cause union based on existing JsonFailure/V2Failure and
StorageErrorCode, plus coordinator codes below. Preserve code, offset and typed
path/message issues; do not collapse invalid-revision into invalid-state. Raw
lexical errors retain precedence over version/domain errors. Source payloads are
data for explicit inspection/export, not console/error-message dumps. Oversized
source strings are not copied into diagnostics or reparsed without bounds.

MigrationCommitResult:

| Status | Meaning / mutation disposition |
|---|---|
| committed | Exact target readback, independently valid matching v2 and verified backup; caller may explicitly adopt returned state |
| already-migrated | Exact expected target already present, independently valid candidate and verified source backup; no write/revision bump |
| aborted | This attempt made no primary write, or reconciliation positively confirmed original source retained; no candidate publication |
| conflict | Observed source/backup/target differs, including newer valid data; preserve snapshots and block mutations pending caller reconciliation |
| commit-status-unknown | Primary write may have taken effect but verification cannot establish result; block all further mutations for that aggregate |

All results include phase and primaryWrite disposition: not-attempted,
source-confirmed-retained, target-verified or unknown. Failure codes include
invalid-preparation, approval-required, forbidden, busy, competing-writer,
production-coordination-required, backup-conflict, invalid-backup, source-changed,
target-mismatch and reconciliation-required; storage/domain causes stay nested.
No exception from an injected storage operation is an unhandled promise rejection.
Unknown storage errors map to storage-unavailable without leaking arbitrary errors.

Authorization is a separate local caller context, bound to this identity/receipt:
ownerId, approval='explicit-v1-to-v2', operatingMode='local-single-writer' and
competingWriter='none-known' or 'known-or-suspected'. Owner must match; absent or
invalid approval rejects before I/O. Known/suspected competition rejects. A
production-multi-writer request always rejects, with no override flag. Context
is an explicit operating acknowledgment, not authentication, proof of exclusive
ownership or a lock. It is not stored inside GameState. New attempts/retries
require explicit approval again; read-only reconciliation does not authorize a write.

### Amendment 1: exact reconciliation union and permission boundary

Proposed discriminated union (documentation notation, not production declarations):

```text
ReconciliationCause =
  { kind: 'storage', code: StorageErrorCode }
  | { kind: 'validation', failure: JsonFailure | V2Failure }
  | { kind: 'coordinator', code:
      'invalid-preparation' | 'backup-missing' | 'backup-conflict'
      | 'invalid-backup' | 'source-changed' | 'target-mismatch'
      | 'primary-missing' | 'busy' | 'recovery-reference-required'
      | 'invalid-reference', failure?: JsonFailure | V2Failure }

ReconciliationContext = {
  identity: SnapshotIdentity | null, backupReference: BackupReference | null,
  phase: 'receipt-validation' | 'backup-read' | 'backup-validation'
       | 'primary-read' | 'primary-validation' | 'comparison' | 'complete',
  mutationGate: 'blocked'
}

ReconciliationResult = ReconciliationContext & (
  { status: 'source-confirmed-retained',
    primaryWrite: 'source-confirmed-retained',
    receipt: MigrationReceipt, sourceState: GameState,
    observedPrimary: string, cause: null,
    permittedNextAction: 'explicitly-reauthorized-retry' }
  | { status: 'already-migrated', primaryWrite: 'target-verified',
      receipt: MigrationReceipt, state: GameStateV2,
      observedPrimary: string, cause: null,
      permittedNextAction: 'explicit-state-adoption' }
  | { status: 'conflict', primaryWrite: 'unknown',
      observedPrimary: string | null, cause: ReconciliationCause,
      permittedNextAction: 'operator-review' }
  | { status: 'commit-status-unknown', primaryWrite: 'unknown',
      observedPrimary: string | null, cause: ReconciliationCause,
      permittedNextAction: 'read-only-reconciliation-or-inspection' }
)
```

All listed fields are required except the explicitly optional nested failure.
identity/reference are non-null after their
validation; null means no valid identity/reference could be established, never
a guessed/default identity. observedPrimary=null in failure variants means no
primary string was obtained (missing, unreadable or not reached); phase/cause
distinguish those cases. Source/target success variants require exact observed
string equality and independently verified same-identity v1 backup. sourceState
is the detached validated v1; state is detached validated v2 matching receipt.state.
Receipt is rederived/verified, never an echoed untrusted object. Success variants
require phase=complete and non-null identity/reference matching receipt exactly.

Reconciliation makes no writes, so primaryWrite describes the established
disposition of the earlier migration, NOT an I/O action by this call. It is never
not-attempted: after process loss that history may be unknown. Exact source
observation does not prove no prior write/rollback occurred; exact target does not
prove who wrote it. These are current observations under D8, not history/authenticity.

Deterministic outcome rules: malformed receipt -> unknown/invalid-preparation
(with nested validation failure when available), no I/O; busy -> unknown/busy,
no new I/O; missing backup -> unknown/backup-missing; invalid or foreign/unsupported
backup -> unknown with its validation cause; a separately valid same-identity/r
backup text differing from receipt.source -> conflict/backup-conflict. Storage
exceptions -> unknown/storage cause at the failing phase. With verified backup,
exact source -> source-confirmed-retained; exact independently valid target ->
already-migrated; missing/corrupt primary -> unknown with primary-missing or original
validation cause; independently valid different primary -> conflict/source-changed
or target-mismatch. Unsupported primary schema/catalog -> conflict with original
validation cause. Do not replace validation codes/issues/offsets with message matching.

Every reconciliation outcome LEAVES the mutation gate blocked. The two success
observations supply a permitted explicit next action, not automatic unblocking:

| Outcome | Explicit retry | Explicit adoption | Gate handling |
|---|---|---|---|
| source-confirmed-retained | Allowed only with fresh authorization and this matching retryResolution | No v2 candidate adoption | commit may consume the resolution for one revalidated attempt; remains blocked until then |
| already-migrated | No migration write/retry | May explicitly adopt the verified returned v2 | Later application adoption policy must revalidate current primary before opening mutations; load/reconcile do not do so |
| conflict | Forbidden with old receipt | No adoption based on this result | Remains blocked; explicit review/reload under a separately approved policy |
| commit-status-unknown | Forbidden | Forbidden | Remains blocked; only read-only reconciliation/inspection |

retryResolution is optional only for a first unblocked explicit commit. For a
blocked identity it MUST be a matching source-confirmed-retained result; commit
revalidates receipt, context, backup and exact current source before any primary
write. A stale resolution never overrides a new conflict. It is not a durable or
secure capability; caller copies/tampering are checked, not trusted. Adoption is
an external explicit action, not a new implicit coordinator or gameplay API.

## 3. Lifecycle and mutation gate

```text
load -> missing / rejected / accepted / migration-required
pure preparation -> prepared (no write and no gameplay activation)
explicit commit -> validating -> backup-verified -> source-compared
                -> primary-write-attempted -> target-verified -> committed
                -> aborted / conflict / commit-status-unknown
unknown/conflict -> read-only reconciliation -> already-migrated
                                      OR source-retained / conflict / unknown
```

One active I/O operation per identity in the composed coordinator; overlapping
calls return busy rather than queueing unlimited work. A blocked identity permits
only bounded load/inspection/reconciliation, not another blind commit. Read-only
load never clears a block or installs a candidate. A confirmed source-retained
reconciliation permits an explicitly reauthorized retry using retryResolution,
not an automatic retry or clearing of the mutation gate.
Different/newer primary requires explicit reload/adoption under later application
policy, not retrying an old receipt over it. Exact target reconciliation can return
already-migrated only after backup and candidate validation, then allow explicit
adoption without a second write. No hidden background retry/timer.

This gate is proposed in-memory coordinator state plus a caller integration
obligation. It cannot stop direct use of legacy APIs, another coordinator, another
tab or developer tools. A future application must route every persistent mutation
through one session owner and honor the blocked result; that integration is not
built here. Destroying/recreating a service is not a supported way to clear a block.
After process loss, do not claim an in-memory gate survived. Reconstruct a receipt
from an explicitly supplied, independently validated backup reference if needed;
otherwise require operator inspection. All read-only recovery/reconciliation
results leave the new session's mutation gate blocked. A new load's accepted v2 does not prove
the old migration's acknowledgment or activate it automatically. A durable journal,
automatic startup adoption and restore UX require separate design/authorization.

## 4. Keys, backup creation and retention

Primary key uses existing snapshotKey(identity) unchanged:
`farm-development:game-state:<encoded gameId>:<encoded farmId>:<encoded ownerId>`.
Each identity component is validated and encoded separately. No version suffix
or separate live inventory key is added.

Backup key:
`farm-development:game-state-backup:<encoded gameId>:<encoded farmId>:<encoded ownerId>:v1:r<sourceRevision>`.
Revision is validated, canonical decimal, nonnegative and <=MAX_SAFE_INTEGER-1.
Derive keys internally; callers never supply arbitrary primary/backup paths.
Backup value is receipt.source, with exact ordered UTF-16 code units. Compare
with ===; preserve whitespace, escapes, property/numeric spelling and line endings.
No trimming, Unicode/newline normalization, source reserialization or raw-byte claim.

Read backup once. Missing -> write source once, then read back. Identical -> reuse
without a write, still independently validate. Different -> backup-conflict and
abort, including parsed-equivalent strings; never overwrite existing data. Raw
bounded parser + v1 validator must confirm version, complete identity and r;
v2 or foreign/corrupt/over-budget backup is invalid. Require exact source equality
as well. A failed backup write/readback aborts before primary; no cleanup remove.

Backups are retained after success, failure, restart and retries. No automatic
expiry, pruning, replacement or quota-recovery deletion. Retention is a policy
under the D8 single-writer assumption, not atomic write-if-absent protection.
Storage pressure is reported and may block migration rather than delete data.

SnapshotStorage cannot enumerate keys. inspectRecovery accepts ONE bounded
BackupReference for the same identity, from an existing receipt or explicit
operator-supplied reference. It never scans guessed revisions/localStorage keys
or creates an index key. If primary is corrupt and its source revision/receipt
is lost, automatic backup discovery is unavailable. Report recovery-reference-
required, not missing backup or reset. Export/discovery UI is deferred.

### Amendment 2: read-only lost-receipt reconstruction

RecoveryResult is exactly one of:

```text
{ status: 'receipt-reconstructed', receipt: MigrationReceipt,
  reconciliation: ReconciliationResult, mutationGate: 'blocked' }
| { status: 'recovery-rejected', identity: SnapshotIdentity | null,
    backupReference: BackupReference | null, phase: ReconciliationContext.phase,
    cause: ReconciliationCause, primaryWrite: 'unknown', mutationGate: 'blocked',
    permittedNextAction: 'operator-review-or-correct-reference' }
```

receipt-reconstructed requires a fully validated source backup and deterministic
receipt; its reconciliation can be ANY of the four outcomes, including conflict
or unknown. A reconstructed receipt alone is not migration success or retry
permission. Only the embedded reconciliation's permittedNextAction applies.
No backup-restoration result or gameplay state activation is hidden in this API.

inspectRecovery(identity, backupReference?) is the supported no-receipt path:

1. Set/retain the session mutation gate blocked. Validate identity and the exact
   BackupReference fields/version/range, with r<=MAX_SAFE_INTEGER-1. Missing
   reference -> recovery-rejected/recovery-reference-required; malformed reference
   -> invalid-reference; invalid identity retains the existing invalid-identity
   validation cause. Perform no storage I/O in these cases. Never guess revisions.
2. Derive the ONE backup key from the supplied identity/reference. Read once.
   Missing -> recovery-rejected/backup-missing; storage failure -> recovery-rejected
   with original storage cause. Never create a missing backup in this flow.
3. Strictly parse/validate the backup with parseVersionedGameState(raw, identity).
   Require migration-required (v1), exact identity and sourceRevision equal to the
   reference. A corrupt, over-budget, duplicate-key, foreign, unsupported schema/
   catalog, wrong-version or revision-mismatched backup produces recovery-rejected.
   Preserve available parser/domain causes; valid v2 is invalid-backup rather
   than an accepted v1 source. A source revision mismatch is invalid-backup.
4. Reconstruct preparation from the exact validated stored source; reuse stable
   target/candidate and build a detached receipt. No current prototype creation
   defaults, clocks, RNG or old caller candidate participate. Validate the complete
   receipt again. Retain the backup reference and original string unchanged.
5. Read current primary once, compare with expected source/target and classify
   using Amendment 1. Backup validation from this same operation supplies the
   verified backup observation; no need to enumerate or rewrite keys. Return
   receipt-reconstructed with receipt AND reconciliation, including errors from
   primary read/validation as conflict/unknown. Maximum two storage reads; ZERO
   write/remove calls. If receipt reconstruction itself fails, return recovery-rejected.
6. Exact source yields source-confirmed-retained; exact valid expected target yields
   already-migrated even after process restart; different/newer valid primary
   yields conflict; missing/corrupt/unreadable primary yields unknown. Preserve
   nonempty newer v2 inventory rather than initializing it from the source backup.

Without an old receipt there is no known original source string to compare with
a competing but structurally valid backup. Exact identity/revision and strict
validation do NOT prove backup authenticity or freshness. Such an unknown conflict
cannot be detected or certified away. If an old receipt becomes available, its
source/target must match exactly; mismatch -> conflict/backup-conflict, not silent
replacement of either receipt. Direct reconcile(receipt) continues to verify the
referenced backup against that receipt and uses at most two reads. Recovery
inspection never overwrites, restores, rolls back, migrates or adopts anything.

## 5. Explicit commit and readback protocol

1. Check authorization, identity, local mode, known competitors and per-identity
   gate. Capture/revalidate the receipt entirely before awaiting storage. Reparse
   source and stable target using the strict boundary; full target must match
   rederived migration, not merely counters. Reject tampering without writes.
2. Optional early primary read is not needed: verify backup first as above.
   Backup writes do not imply migration/primary success. Any existing backup is
   independently verified before it can justify a primary write or successful retry.
3. Reread primary under its existing key. Exact source -> proceed. Exact target
   -> independently validate v2, identity, revisions and full candidate, return
   already-migrated without writing. Null, different source string, other/newer
   valid v2 or corrupt/incompatible data -> conflict/source-changed, no overwrite.
4. Mark primaryWrite=unknown BEFORE calling write; write receipt.target once as
   one complete primary value. Never remove first or save root/inventory separately.
   Never route v2 through GameStatePersistence.save. Migration changes g once
   during preparation only, i remains 0 and all source logical times stay unchanged.
5. Read primary back. Require exact receipt.target string. Independently run strict
   version-aware validation: accepted v2, pinned catalog, matching identity, both
   revisions and complete candidate. Structural equality alone is insufficient.
6. All checks succeed -> committed, target-verified. Return detached verified state
   and backup reference; caller explicitly decides adoption. Keep source backup.
7. After any attempted primary write, a thrown error or unreadable/mismatching/
   corrupt readback must not trigger a second write or rollback. Read-only
   reconciliation below establishes source-retained/target-verified/conflict, or
   returns commit-status-unknown. If verification itself cannot finish, remain blocked.

This is bounded sequential I/O, not atomic CAS, multi-key transaction, guaranteed
crash durability or proof another writer cannot change primary after readback.

## 6. Failure, reconciliation and recovery matrix

reconcile validates its receipt, reads and validates backup, then reads primary;
it performs ZERO write/remove calls and makes no unbounded retry. The caller may
invoke it explicitly again after an external error clears. Reading source after
a failed write is observation under the supported single-writer assumption, not
proof of history or absence of a future writer. Lost-receipt recovery inspection
reconstructs a verified receipt and current reconciliation observation as specified
above; it cannot certify the historical writer or durability of an old commit.

| Failure / observation | Result and required retained data |
|---|---|
| Invalid source/candidate/approval/identity before backup | aborted, not-attempted; no read/write for invalid approval/receipt; source unmodified |
| Backup access/quota/write/validation failure | aborted, not-attempted; retain any backup content; primary never written by this attempt |
| Existing backup is textually different | conflict/backup-conflict, blocked; never replace/delete it |
| Crash after backup, before primary replacement | Primary remains v1 under one writer; verified backup can be reused on explicit retry; no revision reset |
| Reread primary missing/different/newer before write | conflict/source-changed, not-attempted; preserve primary/backup and reload; no stale write |
| Primary write throws; reread confirms exact validated source + verified backup | aborted with original storage cause, source-confirmed-retained; explicit retry possible |
| Primary write applies but throws / acknowledgment lost | Exact validated target + valid matching source backup -> already-migrated; no second write/bump |
| Crash after primary replacement | On explicit reconciliation, exact target + verified backup can establish already-migrated; reconstruct receipt from known source backup if necessary |
| Primary readback fails/unavailable | commit-status-unknown, blocked; retain receipt/reference and backup, report storage cause |
| Readback truncated/corrupt/invalid | commit-status-unknown, blocked; never accept/reset inventory; inspect backup separately |
| Readback valid v2 but different string or candidate | conflict/target-mismatch, blocked; structural equivalence/newer revision is not acknowledgment |
| Primary absent after attempted write | commit-status-unknown, blocked; no default/new-game creation |
| Unsupported primary schema/catalog after attempted write | conflict with preserved incompatible cause, blocked; never downgrade or overwrite |
| Backup becomes missing/invalid/conflicting during reconciliation | Cannot certify commit; unknown/conflict, blocked; never recreate it as part of read-only reconciliation |
| Valid same-identity backup with corrupt primary | Recovery offer after independent strict validation; preserve both; no automatic restore/rollback |
| Foreign/incompatible/invalid backup | Reject recovery; preserve stored strings, never prefer it merely because primary is bad |

Conforming existing storage adapters assume failed writes preserve old values.
Fault injection also tests nonconforming partial writes: a normalized exception
alone does not establish that assumption was honored. Never label uncertain data
as committed based only on write returning/resolving or error type.
Recovery availability is an additional observation, not a successful load/commit.
Restoring a backup could lose newer data and requires a separately approved,
explicit workflow preserving/exporting the bad primary and disclosing rollback.
No restore API, remove call or automatic correction is part of this design.

## 7. D8 concurrency and authority limits

Only one writer per aggregate across the ENTIRE local origin is supported.
The operator closes other tabs/windows/workers/old app versions/tools; the caller
serializes migration, save and recovery work under one session owner. Known or
suspected competition prevents migration before backup writes. The coordinator's
busy gate only serializes its own instance, not the origin. No lock, lease,
storage event, fencing token or writer election is implemented or implied.

Two unknown writers can both pass comparisons, race backup creation and overwrite
primary; even exact readback can immediately become stale. Tests must demonstrate
this limitation, not assert both-writers-cannot-win. Client snapshots, catalog
tags, approval context and backups remain forgeable; validation is not anti-cheat,
authentication, trusted ownership or legitimate item-history proof.

**Production multi-writer migration remains BLOCKED** pending separate approval of
coordination or transactional storage, including exclusion/fencing, atomic
preconditions, crash recovery and adversarial concurrency tests. Local test success
cannot lift that gate. No backend or server transaction is simulated here.

## 8. Proposed implementation and test plan

Future files, only after separate implementation approval:

| Proposed file | Responsibility |
|---|---|
| apps/game/src/core/storageMigrationCoordinator.ts | Result/receipt/context contracts, pure receipt verification/key derivation, explicit read/commit/reconcile/recovery operations over SnapshotStorage |
| apps/game/src/core/storageMigrationCoordinator.test.ts | Deterministic operation log, injected failures, crash checkpoints and controlled interleavings; no browser globals |
| docs/STORAGE-MIGRATION-COORDINATOR-DESIGN.md | Record actual conformance/limits after implementation; keep proposed tests distinct from executed evidence |
| tasks/SPRINT-02.md | Record actual acceptance, measured suite count and deferred native browser/device QA |

No adapter change, generic repository framework, backup index, normal v2 save,
automatic restore, gameplay activation or new dependency is planned. No real
player snapshot may be used for automated faults. Native QA uses disposable
explicit identities/keys and owner-controlled cleanup, never clear-all.

Future fault storage wraps an isolated InMemorySnapshotStorage or test-only Map.
Record every read/write/remove (remove must remain zero). Inject failure at each
await boundary: before effect, after effect/before acknowledgment, truncated
write, altered readback, rejected Promise and a barrier-controlled competing write.
Crash checkpoints discard the coordinator, retain the fake storage and explicitly
reconstruct/revalidate a receipt from the known backup. Tests never rely on random
scheduling, wall-clock delays or Date.now. Add exact source/candidate/backup
comparisons, preservation of nonempty newer v2 inventory and BigInt per-item totals.

All rows below are **PLANNED / NOT EXECUTED**, not PASS:

| Approved groups | Future deterministic cases / required assertions |
|---|---|
| T01 | Preserve all 602 existing tests and original legacy API semantics; old v1 client refuses v2 |
| T02–T15 | Reuse pure validation/migration/transition tests; coordinator never changes prepared times/revisions/items; tampered receipts fail |
| T16, T29–T35 | Primary AND backup use existing bounded duplicate/numeric/resource gate, including exact error causes/offsets and typed issues; no JSON.parse-only bypass |
| T17 | Multiple game/farm/owner identities, encoded delimiters, foreign primary/backup and bad reference; no key aliasing or unrelated changes |
| T18 | Backup missing -> exact create/readback; exact valid existing -> zero writes; different/equivalent text -> conflict; invalid/foreign backup or quota/access failure -> no primary write |
| T19 | Source changes after preparation/during backup and before primary reread -> no stale write; missing/corrupt/unsupported/newer source preserved |
| T20 | Each write/read fault, partial write and corrupt/mismatching readback; no false success, blind retry, deletion or partial inventory reset |
| T21 | Crash at every protocol boundary; lost receipt + valid explicit backup reference reconstructs deterministic receipt; exact target after process restart -> already-migrated with zero writes/no extra revision; exact source -> source-confirmed-retained; current conflicting primary preserved |
| T22–T23 | Known-reference reconstruction only from independently valid same-identity/r v1 backup; absent reference -> recovery-reference-required without I/O; missing/corrupt/foreign/unknown/revision-mismatched backup rejected; valid but unprovable backup conflict limitation explicit; preserve newer nonempty inventory; no restore calls |
| T24 | Two coordinator instances pass checks before either writes; controlled later-writer race demonstrates absence of CAS, including backup race; no multi-writer safety assertion |
| T25 | Unknown schema/catalog primary/backup rejected with original cause and string retained; unsupported primary never overwritten |
| T26 | Separate native browser QA below, not fake-storage or emulation-as-phone PASS |
| T27 | UTF-16 equality: CRLF/LF, escapes, whitespace/member/numeric order differences; exact source backup and comparisons; no raw-byte claim |
| T28 | Parsed-equivalent but textually different target readback -> blocked conflict, not successful acknowledgment |
| T36 | Formerly v1-accepted duplicate/rounded/over-budget sources reject only in new path, remain stored unchanged; legacy API regression unchanged |
| T37 | Every reconciliation/recovery outcome leaves mutation gate blocked; source-confirmed-retained permits only fresh authorized matching-resolution retry; already-migrated permits only explicit validated adoption; conflict/unknown permit neither; busy, stale resolution and process-restart cases; known competition no writes; direct/cross-instance bypass documented |
| T38 | production-multi-writer request rejected before writes regardless of local test success; no override flag |

Native QA after implementation approval: independent desktop Chrome and actual
iPhone Safari where available; record exact browser/OS/device, dev vs production,
disposable identity, actions and observed results. Verify v1 -> explicit commit ->
reload -> same v2, retained backup, exact-target retry without write, blocked/private
storage, quota and reload after interruption, and no startup migration. Real quota
must be exercised in an isolated test origin/profile, not by filling player storage;
mock quota evidence is separate. Unsupported/private/eviction behavior must be
reported accurately. Never treat browser emulation as physical device verification.

Implementation acceptance requires reviewed contracts, all applicable fault cases,
full root lint/typecheck/test/build/diff checks with actual counts, protected legacy
guards, and native QA recorded or explicitly NOT TESTED. An implementation review
must decide the permitted acceptance scope if native quota/crash cannot be reproduced.

## 9. Risks, owner review decisions and deferred work

| Review point | Proposed local decision / remaining risk |
|---|---|
| Result names, approval/context and transient receipt | Approve before coding; validation is not cryptographic authorization |
| No backup enumeration | One explicit reference; no discovery guarantee after receipt loss; UX/export/discovery deferred |
| Unknown gate after crash | In-memory gate cannot persist; explicit reconstruction/reconciliation or operator inspection required; durable startup protocol is separate |
| Adapter throws after effect | Conservative unknown until independent reconciliation; retains user data over availability |
| Backup retention/quota | Retain indefinitely, abort on pressure; owner-controlled maintenance requires later explicit design |
| Mixed old/new writers | Close all other writers; unable to detect every tab/version; production multi-writer remains blocked |
| Browser eviction and local tampering | No durability/authenticity guarantee; exported backup, cloud storage and entitlement protection deferred |
| Future regular v2 save/adoption | Not provided by this migration-only coordinator; needs its own reviewed application/persistence boundary |

No D1–D9 exception or architecture conflict is proposed. The points above require
owner review of this technical specification and a separate implementation grant;
they do not authorize code, normal v2 persistence, recovery UX or another ticket.

Historical architecture review outcome was APPROVE WITH CHANGES, design only. The three
requested amendments specify the reconciliation union, known-reference lost-receipt
path and current Sprint checkpoint. At that checkpoint the amendments awaited
owner review. The owner subsequently accepted them: **FDS2-006 DESIGN APPROVED
— 2026-11-09**. This supersedes the conditional design-review status, while
implementation remains separately unauthorized and is not marked PASS.

## 10. Documentation verification

This ticket changes three documents only. Applicable checks: git diff --check;
whitespace/final-newline/relative-link scans; exact changed-file scope; approved
D1–D9/T01–T38 preservation and protected source/tests/adapters/dependency/CI guards.
No regression/build/browser/fault tests are rerun for this design-only change.
The baseline hosted CI verifies FDS2-005, not this proposed coordinator or a new
documentation commit. No commit, push, merge or snapshot operation.

Executed documentation checks on 2026-11-07: git diff --check PASS (exit 0);
all three changed/new documents PASS trailing-whitespace, final-newline and
relative-link scans; exact three-file scope confirmed; protected-source guard
exit 0; D1–D9/T01–T38 rows exactly match HEAD. No implementation/fault/browser
tests were executed or relabeled PASS. No new dependency or architecture exception.
