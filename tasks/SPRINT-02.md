# Sprint 2 — State and authority foundations

Scope is intentionally small; FDS2-001 is complete and the owner now authorizes
**FDS2-002 only**. No gameplay/economy/backend/autosave system is implied by the
explicit envelope storage seam. FDS2-003 remains unapproved.
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
| FDS2-003 — Item & Inventory Rules | 001, approved 002 | Draft: item definitions, integer quantities/capacity, atomic add/remove and replay rules; no shop/loot/currency rewards by assumption | DRAFT / NOT AUTHORIZED |

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
FDS2-003 still requires separate authorization. No real-device/production behavior
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
