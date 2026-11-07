# Sprint 2 — State and authority foundations

Scope is intentionally small; FDS2-001–003 are complete. The owner now authorizes
**FDS2-005 pure core only**, following FDS2-004 design approval. Production storage
migration/integration, UI, economy, gameplay and backend are not authorized.
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
| FDS2-005 — Pure Schema v2 & Migration Core | 004 design approval + exact baseline CI green | Separate v2 validator, pinned catalog, strict bounded raw parser, deterministic preparation and pure aggregate inventory/clock transitions; legacy v1 contracts unchanged; no storage integration | **PASS local — 2026-11-07; 602 tests / 28 files; READY FOR OWNER COMMIT REVIEW** |

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
backup/recovery, CAS/transactions or production safety claims. No commit/push;
FDS2-006 not started. **FDS2-005 PASS local for the approved pure scope only.**

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
scenarios remain deferred. **READY FOR OWNER COMMIT REVIEW**. No commit/push/merge.
