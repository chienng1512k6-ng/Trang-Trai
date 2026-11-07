# Sprint 2 — State and authority foundations

Scope is intentionally small; owner authorizes **FDS2-001 only** at this time.
No Sprint 2 gameplay/economy/backend/save system is implied by these contracts.
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
| FDS2-002 — Persistence Architecture | 001 | Draft: design versioned snapshot validation/migration and persistence seam; decide explicit untrusted local vs authoritative service boundaries before implementation; no backend by assumption | DRAFT / NOT AUTHORIZED |
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

**FDS2-001 PASS for the contract scope.** FDS2-002/003 remain draft and require
separate authorization. No real-device/production behavior change is claimed.
