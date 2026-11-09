# Sprint 2 — State and authority foundations

Scope is intentionally small; FDS2-001–005 have their recorded scope acceptance.
FDS2-006 is implementation complete and CI verified. FDS2-007 is DESIGN APPROVED.
The owner separately authorized
**FDS2-007A pure adoption decision boundary, local implementation only**. No real
migration, application session/adoption, native QA harness, gameplay integration,
UI, economy, backend, autosave or next implementation package is authorized.
Follow [AGENTS](../AGENTS.md), [GDD](../docs/GDD-V1.0.md),
[architecture](../docs/ARCHITECTURE.md) and
[Sprint 1 final review](../docs/SPRINT-01-FINAL-REPORT.md).

## Entry checkpoint

Sprint 1 accepted 13/13. Baseline `3d2777413fc661038be6ff081af888d034412c4c`
(`docs: close Sprint 1 with verified CI acceptance`), main, clean working tree.
Codex checked GitHub API on 2026-11-07: Development Quality
[42351527639](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42351527639)
completed/success for this SHA. Entry condition is satisfied. No commit/push
or workflow dispatch was performed by Codex. Future FDS2-001 commit needs its
own CI; baseline green does not certify new uncommitted code.

## Ordered backlog

| ID | Depends on | Scope / acceptance | Status |
|---|---|---|---|
| FDS2-001 — Game State & Authority Contract | Sprint 1 checkpoint + green CI | Pure schema/identity/logical-time/metadata contract, strict validation, explicit command/result/reference transition, authority matrix and meaningful tests; protect existing runtime; all quality checks pass | **PASS local — 2026-11-07** |
| FDS2-002 — Persistence Architecture & Storage Adapter | 001 + its CI green | Explicit envelope JSON codec, validated load/save/remove, in-memory/localStorage adapters, namespace/revision/schema/error policy, tests and documented authority/concurrency limits; no autosave/migration engine/backend | **PASS local / embedded-browser — 2026-11-07** |
| FDS2-003 — Item Definitions & Inventory Rules | 001, 002 + its CI green | Immutable item registry; validated configurable slots; atomic pure add/remove/move/split/merge; owner/target/revision/source-sink boundary; no UI/gameplay/persistence integration | **PASS local — 2026-11-07** |
| FDS2-004 — Persistent Inventory Schema & Migration Design | 001–003 merged + green CI | Proposed v2/ownership, migration/revision model, backup/corruption policy, bounded parsing and test matrix; D1–D9 review decisions accepted | **DESIGN APPROVED — 2026-11-07; NOT implementation approval or implementation PASS** |
| FDS2-005 — Pure Schema v2 & Migration Core | 004 design approval + exact baseline CI green | Separate v2 validator, pinned catalog, strict bounded raw parser, deterministic preparation and pure aggregate inventory/clock transitions; legacy v1 contracts unchanged; no storage integration | **IMPLEMENTATION COMPLETE / CI VERIFIED — 2026-11-07; 602 tests / 28 files; run 42369209539 SUCCESS** |
| FDS2-006 — Storage Migration Coordinator | 005 complete + exact baseline CI green | Explicit version-aware load, pure preparation, authorized commit, exact backup/readback, blocked reconciliation and known-reference recovery; isolated fault tests, no gameplay wiring | **IMPLEMENTATION COMPLETE / CI VERIFIED — 2026-11-09; 758 tests; run 42596640896 SUCCESS; native browser QA NOT TESTED** |
| FDS2-007 — Browser Persistence QA & Explicit GameState Adoption Design | 006 accepted + exact SHA CI green | Proposed adoption/session/history contract, explicit read-only handoff, native QA fixture/key/evidence plan and separately approved implementation sequence; documentation only | **DESIGN APPROVED — 2026-11-09; NOT implementation or browser QA PASS** |
| FDS2-007A — Pure GameState Adoption Boundary | 007 design approved + exact baseline CI green | Pure deterministic strict evidence/history decision, immutable issuance-history-bound read-only proposals, authorization policy and reevaluation; no session, I/O or actual adoption | **READY FOR OWNER COMMIT REVIEW — PASS local — 2026-11-09; 916 tests / 30 files; targeted P2 corrected** |

Currency, farming/growth/harvest, shop, land expansion and building/construction
remain later draft groups in the final report; not part of this implementation.

## FDS2-001 acceptance

Contract and recorded decisions: [GAME-STATE-AUTHORITY](../docs/GAME-STATE-AUTHORITY.md).
Deliverables: core/gameState.ts, adjacent unit tests and these two documents.
No changes to Player, controls, camera, collision, AI, combat, assets, dependency
versions, scripts or workflow. The reference logical-time transition is pure,
unwired and does not generate offline progress or operate a clock/save system.

Acceptance checklist:

- [x] Minimal versioned envelope and persistent/runtime/derived/render classification.
- [x] All nine authority domains documented; local validation is not anti-cheat.
- [x] Explicit command/result, owner/target/revision/time preconditions and deferred
  durable idempotency/concurrency requirements; no bus or persistence framework.
- [x] Focused tests for implemented invariants, including nonfinite/unsafe inputs.
- [x] Required lint/typecheck/test/build/diff checks actually pass; count recorded.

### Executed acceptance checks — 2026-11-07

| Command from repository root | Result |
|---|---|
| `pnpm.cmd run lint` | PASS, exit 0 |
| `pnpm.cmd run typecheck` | PASS, exit 0 |
| `pnpm.cmd run test` | PASS, exit 0: **390 tests / 24 files**, 39 new + 351 existing |
| `pnpm.cmd run build` | PASS, exit 0 |
| `git diff --check` | PASS; new-file whitespace also inspected separately |

An exploratory `git diff --no-index --check -- NUL` comparison returned 1 for
the newly added file; the wrapper incorrectly treated that as a whitespace error.
The follow-up explicit scan of all four new files found no trailing whitespace,
missing final newline or broken relative document links. Final `git diff --check`
passes. No product/test rule was changed in response.

Editor diagnostics report no errors in the two new TS files. Protected existing
source, assets, manifests, lockfile and workflow have no diff. The production entry
does not import this unwired contract, and rebuilt app/Phaser JS hashes remain:

```text
index-CEBRnW4o.js  1DD95571D75194637D1B4D33092918A76E72DB2E137DC40A7E3598A2770B015B
phaser-BEsb1Ci6.js F19075BECD34638B9D81CBB9E8BE865E295D1D2646742E239058BFC0EDE90F36
```

These identical hashes plus unchanged existing sources/351 passing regressions
support the no-runtime-change boundary; they are not new browser/device QA.
No save/load, authentication, transactional concurrency, durable deduplication,
schema migration or offline engine was tested/implemented. Owner matching in an
untrusted local caller is not a security guarantee. New-code hosted CI remains
unverified until an owner-authorized commit/push; baseline CI evidence is separate.

**FDS2-001 PASS for the contract scope.** The results above are its historical
acceptance. FDS2-002 was subsequently authorized and is recorded below;
FDS2-003 was subsequently authorized as recorded below. No real-device/production behavior
change is claimed by FDS2-001.

## FDS2-002 acceptance — 2026-11-07

Entry: clean main at `7fddbaacfbdb4d9c3ff847b4fd9150a47e670776`, containing FDS2-001.
Codex verified Development Quality
[42352432537](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42352432537)
completed/success on that exact SHA before implementation (approved read-only
network retry after sandbox connection failure). No commit/push/dispatch here.

Design: [Persistence Architecture](../docs/PERSISTENCE-ARCHITECTURE.md).
New files: core/gameStatePersistence.ts and its test, storage/InMemorySnapshotStorage.ts,
storage/BrowserLocalStorageAdapter.ts, architecture document. FDS2-001 gameState.ts
only exports the existing ID predicate; no behavior changes. Authority document
now links the persistence seam. No Player/input/camera/collision/AI/combat/asset,
package version, lockfile, script, workflow or production-entry changes.

| Executed command from root | Result |
|---|---|
| `pnpm.cmd run lint` | PASS, exit 0 |
| `pnpm.cmd run typecheck` | PASS, exit 0 |
| `pnpm.cmd run test` | PASS, exit 0; **434 tests / 25 files**, 44 new + all prior 390 |
| `pnpm.cmd run build` | PASS, exit 0 |
| `git diff --check` | PASS; all eight changed/new files also checked for whitespace/newline and document links |
| `pnpm.cmd --dir apps/game run dev --host 127.0.0.1 --strictPort` | Started Vite 6.4.5 at localhost:8080 for focused browser QA |

Embedded Chromium 150 / Electron 43.8.3 dev browser: native localStorage save ->
reload -> load PASS (logicalTimeMs 123/revision 0 unchanged); schema-2 data blocks
load/save and retains bytes; explicit remove -> missing PASS. The unique QA key
was removed. No captured console/page or HTTP >=400 errors during reload check.
Independent desktop Chrome, physical iPhone/Safari storage, production-browser
persistence and device eviction/private-mode/quota QA are **NOT TESTED**. No new
gameplay/performance or hosted-CI result for these changes is claimed.

Strict validation refuses corrupt/unknown fields; failed loads never create state
or delete/overwrite old bytes. Local data remains untrusted. Expected revision is
a sequential precondition, **not atomic CAS**: concurrent writers can both pass;
a test explicitly demonstrates that limitation. No migration engine, durable
deduplication, multi-tab lock, backend, cloud sync or offline catch-up.

Editor diagnostics report no errors in the new source/test files. Rebuilt app
and Phaser chunk SHA256 values still match the FDS2-001 baseline values above:
the seam is not imported by the production entry. These hashes are not a new
browser/device regression certification. Existing 390 tests remain unchanged.

**FDS2-002 PASS for explicit envelope storage scope.** No autosave or FDS2-003
inventory implementation. Keep future commits subject to their own hosted CI.

## FDS2-003 acceptance

Entry: clean main at `92ddfdf4d81f97e09db7cee2b8b90c4fe12ca155`, FDS2-002 commit.
Codex verified Development Quality
[42353307430](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42353307430)
completed/success on this exact SHA on 2026-11-07 before starting. Initial sandbox
network request failed; approved read-only retry succeeded. No commit/push/dispatch.

Design and invariants: [Item & Inventory](../docs/ITEM-INVENTORY.md).
Deliverables: core/items.ts, core/inventory.ts, core/inventory.test.ts and docs.
No GameState/schema/storage/runtime/asset/dependency/CI behavior changes.
No inventory UI, loot, recipes, shop/currency, farming or real saved inventory.

The first typecheck found TS2339 narrowing for from/to because two discriminants
shared a union member. Split all five operations into separate discriminated union
members; rerun typecheck passes. No type/lint rule or test assertion was disabled.
First full unit run passed 483 tests. A subsequent source/sink authorization test
raises the final total to 484; quantity-changing boundary commands now require
matching authorization supplied separately from intent. This is still forgeable
local context, not a backend, item reward entitlement or anti-cheat mechanism.

### Final executed checks — 2026-11-07

| Root command | Actual result |
|---|---|
| `pnpm.cmd run lint` | PASS, exit 0 |
| `pnpm.cmd run typecheck` | PASS, exit 0 after the discriminant fix |
| `pnpm.cmd run test` | PASS, exit 0; **484 tests / 26 files**, 50 new + all prior 434 |
| `pnpm.cmd run build` | PASS, exit 0 |
| `git diff --check` | PASS; new-file whitespace and relative document links also checked |

Editor diagnostics show no errors in the three new TS files. Tests include all
five operations and exact per-item conservation through a seeded 600-operation
trace, BigInt aggregate checks near numeric limits, invalid inputs, frozen state,
atomic failure, registry immutability, stale revision and source/sink authorization.
All 39 FDS2-001 tests, 44 FDS2-002 tests and 351 Sprint 1 tests remain passing.

Protected existing source, GameState/schema/codec, storage adapters, runtime assets,
manifests, lockfile and workflow have no diff. Production app/Phaser JS SHA256
values match the baseline values recorded above; domain modules are not imported
by the production entry. No new browser/device QA is claimed for this unwired
domain, and no hosted CI PASS is claimed for uncommitted changes.

**FDS2-003 PASS for the domain scope.** Registry definitions are trusted composition,
not command fields. Add/remove primitives do not prove source entitlement; future
server authority must validate actual grants/consumption and commit transactions.
No persistence/schema extension, UI, rewards, economy, gameplay or follow-on task.
No commit/push; owner-authorized future checkpoint needs its own CI run.

## FDS2-004 design review — 2026-11-07

Baseline main was clean at merge `8e91c51a71fbf85d0acd0420c53d1f9d9d1fff9d`.
Codex verified Development Quality
[42356114273](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42356114273)
completed/success on that SHA before drafting. Read-only network retry after
sandbox connection failure; no commit/push, workflow dispatch or networking code.

Deliverable: [Inventory Persistence Design](../docs/INVENTORY-PERSISTENCE-DESIGN.md).
Proposal: required nested inventory and catalog tag in v2; one farm supply
inventory with scoped farm-main ID; deterministic v1/r -> v2/r+1 with inventory
revision 0 and 20 null slots; unchanged legacy identities/logical timestamps.
Outer revision is the local aggregate commit token, inventory revision remains
subordinate. One accepted inventory mutation increments both once. Rejected
operations change neither. None of these v2 rules is implemented yet.

Architecture review outcome: **FDS2-004 DESIGN APPROVED — 2026-11-07** (design only).
The owner accepted D1–D9 and all three completed review amendments. D1–D9 retain
the proposed schema/migration/revision model. farm-main is farm-scoped storage,
not a Player backpack and MUST NOT be subject to character death-drop rules.
Amendments define exact stored-string (UTF-16 code-unit) backup/commit comparison,
not raw file/network/disk bytes; decoded-key duplicate detection at every depth;
explicit parser budgets and exact-number compatibility; one writer per aggregate
across the local origin, with no cross-tab CAS/transaction claim. Production
multi-writer migration remains BLOCKED pending separately approved coordination
or transactional storage. Current v1 APIs/contracts remain unchanged.

Parser design budgets include 262144 input code units, depth 16, 32768 tokens,
16384 values, 64 members/object, 1000 elements/array, bounded decoded strings and
numeric lexemes/exponents. Exact decimal integer checks precede Number conversion;
new-path rejection of previously rounded/ambiguous/over-budget input preserves the
stored string and does not alter legacy v1 API behavior. Matrix now includes
T01–T38, including 12 amendment groups; these are plans, not implemented tests.
Parser selection, conformance and implementation still need separate authorization.

All runtime source/contracts/schema/storage remain untouched. No actual snapshot,
localStorage or migration was executed. Test matrix distinguishes existing checks,
future pure tests, integration fault tests and later browser QA. Historical
484-test result is not a fresh regression or migration safety result. Only docs
changed; whitespace/link and Git diff checks are the applicable verification.

Verification executed: `git diff --check` PASS; all three changed/new document
relative-link/whitespace/newline checks PASS. Protected code/dependency/CI diff
guard exits 0. No regression rerun for docs-only work; the previous 484-test
result is retained as historical, not newly executed. No v2/migration/browser
tests were performed or claimed.

Status: **FDS2-004 DESIGN APPROVED — 2026-11-07** (design only).
Implementation remains blocked on separate authorization; production multi-writer
migration has the additional coordination/transactional-storage approval gate.
Do not mark FDS2-004 PASS implementation or implement follow-ups automatically.

Final approval checkpoint records owner approval of the design only. Parser,
migration and persistence implementation remain unapproved and unverified.
T01–T38 and their proposed test classifications are unchanged; no new test
execution or implementation PASS is implied by this approval.

Amendment checks: git diff --check and protected source/dependency/CI diff guard
exit 0. All three docs pass whitespace/newline/relative-link checks; D1–D9 and
T01–T38 row counts verified. No obsolete positive raw-byte preservation claim.
No lint/typecheck/unit/build rerun for docs-only amendments; no parser/migration
test or new 484-test result is claimed. Existing uncommitted design work is retained.

## FDS2-005 acceptance — 2026-11-07

Current status: **IMPLEMENTATION COMPLETE / CI VERIFIED**. Approved implementation
commit `3ec3f84aba872477759eb3e3e9c5437a36a3afbc` was pushed normally to main;
[Development Quality 42369209539](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42369209539)
completed/success on that exact head SHA on 2026-11-07. The quality job's install,
lint, typecheck, unit tests and production build all succeeded, verified through
GitHub API. The local review/commit-readiness statements below are historical,
superseded by this completed checkpoint; no new execution is claimed here.

Owner separately approved pure implementation. Entry: clean main at
`ed6c2bca3648b1ffab8e974902f3f72659827732`. Codex rechecked GitHub API:
[Development Quality 42366226565](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42366226565)
completed/success on that exact SHA. This baseline CI is not a run for new code.

Deliverables and matrix mapping: [Pure Schema v2](../docs/GAME-STATE-V2.md).
New core files: boundedJson.ts/test and gameStateV2.ts/test. No existing domain,
runtime, storage, test, dependency or CI file modified. FDS2-004 remains DESIGN
APPROVED; its full migration/parser/storage implementation is not marked PASS.

| Root command actually executed | Final result |
|---|---|
| pnpm.cmd run lint | PASS, exit 0 |
| pnpm.cmd run typecheck | PASS, exit 0 after diagnostic-only Node typing fix |
| pnpm.cmd run test | PASS, exit 0; 602 tests / 28 files, 118 new + all prior 484 after audit corrections |
| pnpm.cmd run build | PASS, exit 0 |
| git diff --check | PASS; new-file whitespace/newline/link checks also executed |

Failures and local parser timing/heap observations are recorded in the linked
report. No limits, type rules or legacy assertions were weakened. Pure portions
of T01–T16, T25, T27 and T29–T36 are covered as specified there; storage portions
and T17–T24/T26/T28/T37–T38 remain deferred, not PASS. No browser/device migration,
backup/recovery, CAS/transactions or production safety claims. At that local
checkpoint there was no commit/push and FDS2-006 had not started. The current
implementation/CI checkpoint is recorded above; pure scope remains unchanged.

### Targeted audit corrections — local review checkpoint

Initial suite: 582 tests. Audit requested typed dispatcher diagnostics and
invalid-revision classification, a genuine incompatible-item fixture, and
multi-item BigInt conservation. These three corrections now pass, with 20 new
cases (602 total). Additional checks assert exact parser offsets, mixed container
depth and escaped/surrogate key boundaries. Parser implementation is unchanged.
The initial corrective test for an unsafe numeric token expected a domain error;
it was fixed to retain the approved raw-gate invalid-json-number precedence.

Only gameStateV2.ts, its tests, boundedJson.test.ts and the implementation/Sprint
reports were edited in this correction pass. D1–D9/T01–T38, legacy sources/tests,
storage adapters, gameplay, dependencies and CI remain unchanged. Root lint,
typecheck, full tests, build and diff checks pass; storage/browser/concurrency
scenarios remain deferred. Historical correction checkpoint: **READY FOR OWNER
COMMIT REVIEW**, with no commit/push/merge at that time; subsequently committed
and CI verified as recorded above.

## FDS2-006 technical design — 2026-11-07

Entry: clean main at `3ec3f84aba872477759eb3e3e9c5437a36a3afbc`.
Codex verified GitHub API: [Development Quality 42369209539](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42369209539)
completed/success on that exact SHA. This closes FDS2-005's hosted CI gate;
its earlier commit-review statements above remain historical checkpoint records.

Deliverable: [Storage Migration Coordinator Design](../docs/STORAGE-MIGRATION-COORDINATOR-DESIGN.md).
Separate load/preparation/explicit commit/read-only reconciliation/recovery inspection
contracts; exact UTF-16 source/backup/target comparisons; immutable backup retention;
failure and crash matrix; local mutation gate and explicitly unenforced origin-wide
single-writer assumptions; production multi-writer gate remains BLOCKED.
No enumeration exists in SnapshotStorage: recovery requires a known explicit
backup reference. A lost receipt or process cannot silently clear uncertain state.

Test plan maps T01–T38, prioritizing T17–T24/T28/T37–T38 with fake storage operation
logs, injected faults/crash checkpoints and deterministic competing-writer barriers.
Native reload/quota/physical-device checks remain separately PLANNED / NOT TESTED.
No coordinator test is marked PASS. Historical FDS2-005 suite is 602 tests/28 files;
not rerun for documentation-only work. No source, adapter, dependency or CI change,
snapshot access, real migration, restore or gameplay integration.

Applicable documentation checks: git diff --check, whitespace/newline/relative
links, exact three-document scope, unchanged D1–D9/T01–T38 and protected-source
guards. Historical checkpoint: **FDS2-006 APPROVE WITH CHANGES — DESIGN REVIEW
ONLY**; amendments awaited owner review and no implementation approval/PASS was
granted. Final design approval is recorded below; implementation remains unauthorized.

Executed docs checks: git diff --check PASS, exit 0; whitespace/final-newline/
relative-link scans PASS for all three documents; exact file scope confirmed;
protected-source guard exit 0; original D1–D9/T01–T38 unchanged. No regression,
build or browser run for this documentation-only change.

### FDS2-006 architecture review amendments — design only

The amended specification defines all four ReconciliationResult variants with
typed causes, payloads, phase/disposition and explicit permitted-next-action rules.
Every read-only outcome leaves the mutation gate blocked. A verified retained
source permits only a fresh authorized matching-resolution retry; verified target
permits only explicit validated state adoption. Conflict/unknown permit neither.

inspectRecovery accepts an explicit BackupReference, validates one same-identity/r
backup, reconstructs deterministic preparation/receipt and reads current primary
for reconciliation, with at most two reads and no writes/removes. Missing reference
does not trigger enumeration or revision guessing. T21–T23 and T37 descriptions
are extended in the coordinator plan without changing approved group numbering
or S classification; original D1–D9/T01–T38 remain intact. All future tests remain
PLANNED / NOT EXECUTED. Owner outcome: **APPROVE WITH CHANGES, DESIGN ONLY**;
review amendments were ready for confirmation at that historical checkpoint,
not implementation PASS or coding approval.

### FDS2-006 final design approval — 2026-11-09

**FDS2-006 DESIGN APPROVED — 2026-11-09**. The owner accepted the technical
architecture, implementation planning and all three review amendments. This
supersedes the earlier conditional design-review status only. Four reconciliation
branches, typed causes/dispositions, blocked read-only gate, explicit retry/adoption,
known-reference recovery, exact UTF-16 comparisons and all safety boundaries remain
unchanged. D1–D9/T01–T38 are preserved; production multi-writer remains BLOCKED.
Coordinator implementation and native browser/fault QA remain unimplemented/
unverified and are not marked PASS. Owner authorized a local documentation-only
commit; no push, merge, snapshot access or next-ticket implementation is authorized.

### FDS2-006 subsequent implementation grant and local acceptance — 2026-11-09

Historical pre-audit checkpoint: **FDS2-006 PASS local — awaiting owner source review**.
The independent audit required corrections; the targeted-correction record below
supersedes its readiness and original busy-gate behavior. This later implementation
grant supersedes the historical design-only authorization above, without changing
D1–D9 or T01–T38. Verified baseline: clean main at
`7f9991ad260fbd739c3691911556c329f70498af`; baseline
[Development Quality 42589824538](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42589824538)
completed/success for the exact SHA. No hosted CI claim for the new local changes.

Files: new [coordinator](../apps/game/src/core/storageMigrationCoordinator.ts),
new [tests](../apps/game/src/core/storageMigrationCoordinator.test.ts), this backlog
and [design/evidence](../docs/STORAGE-MIGRATION-COORDINATOR-DESIGN.md#11-authorized-local-implementation-evidence--2026-11-09).
Only these four files changed. Protected domain/v1 APIs, adapters, existing tests,
gameplay, assets, dependencies and CI remain unchanged; no production entry-point
imports or native storage migration were added.

Root `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test`,
`pnpm.cmd run build` and `git diff --check`: PASS, exit 0. Actual suite:
**715 tests / 29 files**, including **113 new coordinator tests** and all 602
previous tests. Initial test-only syntax/readonly-helper errors were corrected;
no validation was relaxed. Editor diagnostics report no errors in the new files.

Fault tests cover T17–T24, T28 and T37–T38 with deterministic in-memory storage,
plus compatibility/parser/identity/string cases. Crash checkpoints and quota are
simulated. Native browser reload/quota/crash/eviction QA remains **NOT TESTED**.
Every read-only reconciliation remains blocked; explicit retry requires retained
source proof and renewed authorization. No adoption/restore/rollback operation.
The 128-identity per-instance gate bound does not provide cross-tab coordination;
race tests demonstrate that localStorage-style read/compare/write is not CAS.
Production multi-writer migration remains **BLOCKED**. Future v2 save/adoption,
durable startup gates and backup maintenance require separate approval.
No player snapshots accessed, no commit/push/merge and no FDS2-007 work.

### FDS2-006 targeted source-audit corrections — 2026-11-09

**READY FOR OWNER COMMIT REVIEW — PASS local**. Baseline unchanged:
`7f9991ad260fbd739c3691911556c329f70498af`, main. Exactly the same four files:
coordinator, its test, coordinator design/evidence and this backlog. Empty staging;
no protected source, v1 API, parser, adapter, gameplay, dependency or CI changes.

Owner-approved busy policy: active operations return a side-effect-free preflight
refusal, outside the four completed reconciliation outcomes; preserve previous
open/blocked state and retry evidence. Completed read-only reconciliation remains
blocked. Authorization failures report the existing validated identity's actual
gate without I/O or transitions; invalid identity conservatively reports blocked.
Safe pre-primary aborts preserve the prior gate; new attempts require fresh
authorization and backup verification, without reconciliation as a first-commit
prerequisite. Uncertain primary writes remain blocked, especially when backup
is missing/invalid; no automatic backup repair, reset, restore or adoption.

Different valid same-identity v1 at MAX_SAFE_INTEGER now reports source-changed
conflict with the underlying revision-overflow diagnostic and full source string,
after independent bounded parsing/strict v1 validation. No change to FDS2-005.

Three original reproductions failed before the fixes while the previous 715 tests
passed. Final measured suite: **758 tests / 29 files PASS**, 43 additional tests,
156 coordinator tests plus all 602 legacy tests. One existing busy assertion was
updated for the explicitly approved preflight semantics; no tests removed/skipped.
New coverage includes authorization/gate accuracy, paused load plus busy reconcile/
recovery, all pre-primary abort/retry positions, blocked-state/proof retention,
uncertain-write/unverifiable-backup safety, MAX/foreign/invalid primary cases via
both read-only paths, two aggregate migrations and exact escaped/reordered strings.

Root `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test`,
`pnpm.cmd run build`, `git diff --check`: PASS, exit 0. Whitespace/newline/relative
links, exact scope, protected-source/dependency/CI and unchanged D1–D9/T01–T38
guards pass. Detailed evidence: [coordinator corrections](../docs/STORAGE-MIGRATION-COORDINATOR-DESIGN.md#12-targeted-audit-corrections--2026-11-09).

Native browser and real quota/crash QA **NOT TESTED**. In-memory gate does not
survive process loss; known-reference inspection and separately approved recovery
policy remain necessary. Unverifiable backup after uncertain write requires manual
inspection. Production multi-writer remains **BLOCKED**. No player snapshot access,
new hosted CI, commit/push/merge or next-ticket work.

## FDS2-006 hosted implementation checkpoint — 2026-11-09

**IMPLEMENTATION COMPLETE / CI VERIFIED**. Owner accepted and authorized normal
push of `95b6ea2c88af66377e9e4a0556516072d7e1f85d`, parent
`7f9991ad260fbd739c3691911556c329f70498af`. The earlier local review/readiness
records are historical. [Development Quality 42596640896](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42596640896)
was verified through GitHub API as completed/success on that exact SHA; quality
install, lint, typecheck, unit tests and build succeeded. CI was independently
rechecked for FDS2-007 entry. The 758 tests / 29 files count is historical local
acceptance evidence, not a new regression run in this documentation task.
Native browser/quota/crash migration QA is still NOT TESTED. No production migration,
gameplay adoption or autosave approval; production multi-writer remains BLOCKED.

## FDS2-007 technical design — 2026-11-09

**FDS2-007 DESIGN APPROVED — 2026-11-09**; not IMPLEMENTATION PASS or BROWSER QA PASS.
Entry: clean main at `95b6ea2c88af66377e9e4a0556516072d7e1f85d`, empty staging,
exact baseline CI SUCCESS independently checked as above. No baseline mismatch.

Deliverable: [GameState Adoption & Native Browser QA Design](../docs/GAME-STATE-ADOPTION-AND-BROWSER-QA-DESIGN.md).
Inspected strict v1/v2 contracts, persistence/adapter ports, actual coordinator
including final audit amendments, and DOMContentLoaded -> Phaser -> Game Scene.
Production currently initializes transient gameplay directly; no persistent session
or Inventory consumer is connected. No runtime integration is introduced here.

Proposal: one application session owner, separate prepared/verified/active state,
explicit identity/provenance-bound read-only adoption with fresh exact primary
revalidation. Busy preflight preserves gates; completed reconciliation remains
blocked. No raw replacement, automatic candidate activation, implicit inventory
grant or death-drop from farm-main. No normal v2 saving supplied by adoption.
Fresh session starts history-unestablished and mutation-blocked; accepted v2 alone
does not prove a previous uncertain migration's acknowledgment. Known receipt or
BackupReference can support explicit target reconciliation; without it, inspection
only pending reviewed policy. No gate-clearing escape hatch or revision guessing.

Q01–Q16 plan covers independent native Chrome and physical iPhone separately,
dev vs separately built optimized QA harness, isolated fixture/key manifest,
reload/reopen, exact backup/target, corruption/catalog/revision, native access/quota,
interruption/reconciliation and deliberately isolated competing-writer races.
All cases **PLANNED / NOT TESTED**. Production/adoption harness is a future approved
deliverable; today's ordinary production entry does not expose those APIs.
No storage.clear, backup enumeration, unrelated cleanup or real player snapshots.

Draft work packages are separate: pure adoption contract/tests; application owner;
opt-in QA harness; native evidence; read-only application integration; normal v2
save/optional autosave; only then separately scoped farming. No follow-up ticket
ID, implementation, dependency, backend or gameplay is authorized by this plan.
Owner must approve strict startup availability policy, read-only scope, harness
packaging and actual device/quota/crash QA scope before coding.

Applicable checks: git diff --check, whitespace/final-newline/relative links,
exact two-document scope, protected-source/dependency/CI and D1–D9/T01–T38 guards.
No unit tests, build or browser tests rerun; no new execution inferred from the
758-test baseline. No commit, push, merge, snapshot access or actual migration.

Executed documentation checks: git diff --check PASS (exit 0); both documents
PASS whitespace/final-newline/relative links; exact two-file scope and empty
staging confirmed; protected-source/adapter/dependency/asset/CI/design guards
PASS, original D1–D9 and T01–T38 unchanged. No implementation or browser QA PASS.

### FDS2-007 final design approval and local documentation checkpoint — 2026-11-09

**FDS2-007 DESIGN APPROVED — 2026-11-09**. Final complete-document review satisfied
the owner's conditional approval: all twelve adoption/session/safety conditions
and Q01–Q16 checked, including shared environment/fixture/evidence/cleanup rules,
allowed/forbidden actions, diagnostics, exact-string reread and blocked persistent
mutations. No policy change or implementation exception was introduced.
The earlier DESIGN READY FOR OWNER REVIEW was the historical drafting checkpoint;
the current status is DESIGN APPROVED only. Q01–Q16 remain PLANNED / NOT TESTED;
758 tests is historical, with no regression/build/browser run in this docs task.
FDS2-001–006 records, D1–D9/T01–T38 and multi-writer BLOCKED remain intact.
Owner authorizes one local commit of the two documents after staged-diff checks;
no push, migration, harness, implementation or FDS2-008 work is authorized.

## FDS2-007A local pure-boundary checkpoint — 2026-11-09

Historical pre-audit checkpoint: **FDS2-007A PASS local — awaiting owner source review**.
The targeted correction below supersedes its readiness and issuance policy.
Separate subsequent owner
grant covers pure package A only; the historical FDS2-007 design approval remains
unchanged. Entry: clean main at `398a5feb91876ca2056fd3bc48df17a69fe133bd`;
GitHub API independently verified [Development Quality 42600268118](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42600268118)
completed/success on that exact SHA before implementation. No new-code hosted CI.

Only new [stateAdoption.ts](../apps/game/src/core/stateAdoption.ts), new
[stateAdoption.test.ts](../apps/game/src/core/stateAdoption.test.ts), this backlog
and [approved design / implementation evidence](../docs/GAME-STATE-ADOPTION-AND-BROWSER-QA-DESIGN.md#9-fds2-007a-pure-implementation-checkpoint--2026-11-09)
changed. Existing v1/v2/parser/coordinator/adapters/tests, runtime entry/gameplay,
assets, dependencies and CI remain untouched; original D1–D9/T01–T38 unchanged.

Exports evaluateAdoption, validateAdoptionAuthorization and validateAdoptionProposal
with strict session/history/captured-result types. Four decisions retained; only
proposal-eligible carries a complete frozen detached v2 snapshot with read-only
permission. Observation IDs correlate caller data, not storage proof or session
handles. All positively eligible evidence must match current confirmed history;
fresh accepted loads remain inspection-only and unresolved history blocks proposals.
Typed failures/offsets/issues preserved; no async/I/O/time/RNG, mutable inventory
authority, state publication, automatic migration/retry, reset/restore or adoption.

Final root lint/typecheck/test/build and git diff --check: **PASS, exit 0**.
Actual suite **883 tests / 30 files**, **125 new + all 758 baseline**, none skipped.
All mandatory decision/provenance/immutability/authorization/revision/session-policy
groups covered; bigint per-item conservation and parser/diagnostic edge cases.
Initial Node typing issue corrected with Vite raw source import, no dependency;
foreign-owner fixture fixed to be internally valid without weakening assertions.
Self-audit tightened stale-history matching, no object coercion, diagnostic retention
and inconsistent abort rejection; no blocking pure-contract issue remains.

Package B/C/D remain NOT STARTED: session handles/guards/generations, actual read-only
adoption and storage reread, harness and native QA are deferred. Q01–Q16 PLANNED /
NOT TESTED; native browser/quota/crash NOT TESTED; normal v2 saving NOT IMPLEMENTED;
production multi-writer migration BLOCKED. No player snapshot access, migration,
gameplay/autosave, commit/push/merge or FDS2-008 work. Await owner source review.

Final scope/whitespace/newline/relative-link checks PASS; exactly four intended
files, empty staging and unchanged protected tracked sources/dependencies/CI.
Original approved adoption design body, D1–D9/T01–T38 and Q01–Q16 preserved.
No existing runtime source imports the new boundary; editor diagnostics clear.

### FDS2-007A targeted P2 correction — 2026-11-09

**FDS2-007A READY FOR OWNER COMMIT REVIEW — PASS local**. Main baseline remains
`398a5feb91876ca2056fd3bc48df17a69fe133bd`; exactly the same four files and empty
staging. No new hosted CI result. No coordinator, adapter, legacy API, parser,
gameplay, dependency or CI changes; no snapshots accessed or migrated.

Three focused tests reproduced the audit finding before the fix: proposals from
confirmed history incorrectly survived a downgrade to unestablished for verified
commit, already-migrated reconciliation and known-reference recovery. Red run:
three expected invalidated/actual retained failures, all 883 old cases passing.

Proposal now requires detached/deep-frozen issuanceHistory using the validated
existing history union. Revalidation rejects malformed/contradictory issuance,
retains existing typed failures and requires exact issuance/current policy equality
before retaining a proposal. History loss, kind change, upgrade or material verified
observation change invalidates it; repeated old evidence cannot promote or retain
the old proposal across that change. Fresh evaluation can still produce a new
read-only proposal from internally valid verified operation evidence where the
approved matrix allows it. Fresh accepted v2 load alone stays inspection-only.

No boolean/storage-authenticity claim, clock, generation, revocation ledger or
session manager is added. A pure consistency function cannot authenticate new I/O
or recall caller-omitted policy changes; package B owns actual operation provenance,
opaque handles, generations and session lifetime. No reset/adoption/write authority.

Final full regression: **916 tests / 30 files PASS**, **33 additional cases**, all
883 prior tests retained, none skipped/deleted; **158 adoption tests**. Original
three reproductions remain unchanged and green. Added policy-change, replay,
malformed issuance, deep copy/freeze, fresh-eligibility and blocked negative tests;
revision diagnostics now assert exact aggregate/inventory paths. A test-only readonly
assignment typecheck error was corrected with Reflect.set, without relaxing types.
Root lint/typecheck/test/build and git diff --check PASS, exit 0. Whitespace/newline/
relative links, exact scope, empty staging and protected-source guards PASS.

Detailed current contract and evidence: [P2 correction](../docs/GAME-STATE-ADOPTION-AND-BROWSER-QA-DESIGN.md#targeted-p2-proposal-invalidation-correction--2026-11-09).
Prior FDS2-007 design approval, D1–D9/T01–T38 preserved. Q01–Q16 PLANNED / NOT TESTED;
native browser/quota/crash NOT TESTED; B/C/D and normal v2 save NOT IMPLEMENTED;
production multi-writer BLOCKED. No commit/push/merge or next-ticket work.
