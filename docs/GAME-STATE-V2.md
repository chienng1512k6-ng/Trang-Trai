# FDS2-005 — Pure Schema v2 & Migration Core

Status: **PASS local — 2026-11-07**, for pure domain scope only.
Approved baseline: main at `ed6c2bca3648b1ffab8e974902f3f72659827732`;
Development Quality [42366226565](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42366226565)
was independently checked through GitHub API: completed/success on that exact SHA.
Working tree was clean before implementation. No commit/push or workflow dispatch.

The owner separately authorized this implementation after
[FDS2-004 design approval](./INVENTORY-PERSISTENCE-DESIGN.md). D1–D9 and the
original T01–T38 classifications are unchanged. This is not storage migration,
backup/recovery, gameplay activation, multi-writer safety or browser acceptance.

## Separate contracts and catalog release

[gameStateV2.ts](../apps/game/src/core/gameStateV2.ts) defines GameStateV2 and
validateGameStateV2. Existing [gameState.ts](../apps/game/src/core/gameState.ts),
[inventory.ts](../apps/game/src/core/inventory.ts),
[items.ts](../apps/game/src/core/items.ts), v1 codec/adapters and their tests are
unchanged. No production entry imports the new domain modules.

```text
GameStateV2: all v1 identity/logicalTimeMs/metadata fields
  schemaVersion = 2
  itemRegistryVersion = 1
  inventory: InventoryState
    inventoryId = farm-main, ownerId = outer ownerId
    revision <= outer metadata.revision
    capacity 1..1000, dense slots, null-only empty slots
    stacks = registered itemId + positive safe integer quantity <= maxStack
```

Exact own enumerable data fields are required; extra fields, accessors, symbols,
non-plain records, invalid IDs/times/revisions, unknown items and conflicting
owners/container roles reject. Validation returns a detached DTO, never repairs
input. This is an ordinary-data contract, not a sandbox for hostile JS Proxies.

ITEM_REGISTRY_V1 is a separate immutable release snapshot built through the
existing ItemRegistry validator, not an alias to a future-changing prototype
catalog. It pins wood/stone/slime-gel at 99, seed at 50 and berry at 20; all are
stackable with existing categories/names. Changing a release requires a separately
reviewed catalog version/migration. Commands cannot inject definitions/limits.

farm-main is farm-scoped supply storage, **not a Player backpack**; character
death-drop rules MUST NOT affect it. No runtime inventory is installed here.

## Bounded raw JSON boundary

[boundedJson.ts](../apps/game/src/core/boundedJson.ts) uses an explicit container
stack and per-object decoded-key Sets. It parses strict JSON directly, creates
null-prototype records and compares keys case-sensitively by UTF-16 code units.
Escaped/literal equivalent names collide at every object depth, even inside
arrays or with equal values. Separate objects may reuse keys. No Unicode
normalization, inherited-key lookup, eval, regex-only duplicate detection or
JSON.parse reviver is used. String escapes, including lone surrogates, retain
JavaScript code-unit semantics. No unbounded recursion/BigInt arithmetic.

JSON_LIMITS implements all approved inclusive budgets: input 262144 code units;
depth 16 (root container 1); tokens 32768 (punctuation/key/value tokens);
nodes 16384 (root/containers/primitives, excluding keys); members/object 64;
elements/array 1000; decoded key/string 128/1024 code units; numeric lexeme 128
ASCII characters; absolute explicit decimal exponent 308. Length/allocation
checks happen incrementally. The first fatal diagnostic is code + source offset;
paths are omitted entirely, so no diagnostic can exceed the 256-unit path cap
or echo unbounded input. Parsing does not normalize the source string.

Numeric grammar is checked before bounded exact decimal digit/scale analysis.
Only mathematically integral values within signed MAX_SAFE_INTEGER pass before
Number conversion. Precision-losing fractions, overflow and underflow reject;
1.0/1e3/10e-1 may pass, and -0 follows field-specific zero rules. Over-budget
exponents reject even for zero. There is no rounding/coercion fallback.
Resource/lexical errors precede schema dispatch, catalog and domain validation.

parseBoundedJson returns either a value/source/metrics or one typed fatal
diagnostic. Metrics report tokens, nodes and maximum depth, not CPU/heap safety.
parseVersionedGameState adds typed unsupported-schema, incompatible-registry,
invalid-state, invalid-revision, revision-overflow and optional expected-identity outcomes.
State-validation failures retain typed issues with path/message. V2 classification
checks root shape/version/catalog before revision fields, outer before inner,
then ordinary envelope/inventory validation. Revision errors win over unrelated
field errors once the root gates pass; both malformed revision fields are reported
in that fixed order. Missing/malformed record shapes remain ordinary invalid-state.
Classification uses structural numeric checks, never diagnostic message matching.
The new v1 migration path retains legacy validation issues and classifies the
metadata.revision issue by its field path; the original v1 API is unchanged.
Inventory diagnostic paths are prefixed with inventory. Raw lexical errors still
win: an unsafe numeric token is invalid-json-number before revision validation.
Existing v1 parsing remains deliberately unchanged: duplicate/rounded/over-budget
text it previously accepted may now reject only in the new path.

## Preparation and aggregate transitions

prepareV1Migration validates v1, rejects MAX_SAFE_INTEGER revision and returns
a detached v2 candidate: g=r+1, inventory revision 0, exactly 20 explicit nulls.
The migration default is a frozen specification literal, independent of any
future creation default. IDs, logical time and both logical timestamps remain
unchanged. No RNG, wall clock, reward or starter grant is used.

parseVersionedGameState retains the exact original stored-string sequence.
Valid v1 returns migration-required with sourceVersion/sourceRevision and a stable
serialized target. Metadata ordering is explicit; equivalent v1 member orders
produce the same target. Valid v2 returns accepted without another conversion or
revision increment. Optional expected identity is exact game/farm/owner data.
Neither result means storage commit, gameplay activation or exactly-once delivery.

applyAggregateInventoryCommand accepts an exact wrapper with gameId, farmId,
ownerId, expectedGameStateRevision and existing inventoryCommand. Authority is
separate caller context, with existing explicit source/sink authorization for
add/remove. The outer and inner expected revisions are checked separately.
One successful existing inventory operation increments i and g once, preserves
logicalTimeMs/creation time and sets updatedAtLogicalMs to current logicalTimeMs.
Failure/no-op returns no candidate and changes neither revision nor input.
Both counters are checked for exhaustion before producing a candidate.
No generic raw replacement command exists.

advanceLogicalTimeV2 requires a separate schema-2 clock command, reuses the v1
logical-time policy after validating v2 and carries the detached inventory through
unchanged. Only g increments; logical time must strictly increase. None of this
supplies authentication, source entitlement, atomic CAS, durable idempotency or
server authority. Two callers with the same old state may each form candidates.

## Test evidence and deferred matrix

[gameStateV2.test.ts](../apps/game/src/core/gameStateV2.test.ts) and
[boundedJson.test.ts](../apps/game/src/core/boundedJson.test.ts) add **118 tests**,
including 20 targeted audit-correction cases beyond the initial 98.
Final full suite: **602 tests / 28 files**, including all original 484 tests.

| Approved matrix | Implemented evidence / remaining scope |
|---|---|
| T01 N | All legacy tests rerun unchanged, including 351 Sprint 1, 39 state, 44 persistence and 50 inventory tests |
| T02–T14 P | Preservation/defaults/frozen input, deterministic target, repeated v2 load, full 1000-slot round trip, strict shape/catalog/quantity/revision rules, all five operations, source/sink grants, stale tokens, failed/no-op operations, clock and overflow boundaries |
| T15 P | Eight forced operations plus 400 seeded operations across multiple catalog items and all five mutation types; Map/itemId/BigInt ledger checked after every step, exact grants/removals, rejected aggregate/ledger unchanged; 1000-slot multi-item trace reaches MAX_SAFE_INTEGER revisions and atomically rejects a MAX_SAFE_INTEGER-sized grant; pinned stacks remain at most 99 |
| T16 P/S, T25 P/S, T36 P/S | Pure duplicate/schema/catalog/new-vs-legacy compatibility cases tested; storage portions remain deferred |
| T27 P | Exact source formatting/code units and stable candidate serialization tested; no backup write or commit comparison is claimed |
| T29–T35 P | Escaped keys/prototype names, every parser budget, numeric edges, strict grammar, diagnostic bounds and 200 seeded differential valid documents; exact fatal offsets, mixed depth 16/17 and escaped/surrogate key 128/129-code-unit boundaries |
| T17–T24 S, T28 S, T37–T38 S | NOT IMPLEMENTED / NOT TESTED for v2: storage/coordinator, backup/conflicts/crash/readback/recovery/concurrency and production coordination gate |
| T26 B | NOT TESTED: no browser storage/reload or real-device migration QA |

An initial run exposed fixture escape lint errors and an incorrect token-count
expectation with empty arrays; these were corrected without relaxing parser
limits/assertions. Another duplicate fixture used pre-mutation revision 8 instead
of actual revision 9 and was corrected. A diagnostic import of node:process failed
the app's typecheck (no Node typings); it was replaced with the existing performance
clock and optional runtime heap API, without adding dependencies or compiler flags.

### Targeted audit corrections

The pre-commit audit found lost dispatcher diagnostics (P2), an empty-target fixture
mislabelled as incompatible (P3), and single-item-only conservation (P3). The pure
v2 failure result now preserves issues and classifies invalid/cross revision fields
as invalid-revision with metadata.revision/inventory.revision paths. Tests cover
ordinary/mixed errors, legacy error preservation, unchanged valid behavior, frozen
invalid input and zero calls to a mock localStorage surface. The incompatible merge
fixture now has Wood and Stone in occupied slots and asserts exact error, slots,
ordering, both revisions and full aggregate preservation; empty-slot remains separate.
Multi-item ledger tests cover all five accepted operation types and failure atomicity.

The first corrective run had one fixture expectation failure: an unsafe numeric
token must fail the raw gate as invalid-json-number, while direct domain validation
returns invalid-revision. The expectation was corrected to preserve this approved
precedence; no parser implementation, limit or architecture decision changed.
All three corrections and additional parser tests now pass locally. Status:
**READY FOR OWNER COMMIT REVIEW**, not committed or approved for release.

Executed root commands: pnpm.cmd run lint, pnpm.cmd run typecheck,
pnpm.cmd run test, pnpm.cmd run build and git diff --check: PASS, exit 0.
New files additionally scanned for whitespace/final newline and document links.
Protected tracked sources/tests/assets/adapters/manifests/lockfile/CI unchanged.
Production app/Phaser chunk hashes match the recorded Sprint 1 baseline; new
modules are unwired. No new hosted CI or browser/gameplay QA is claimed.

### Local parser resource observation

Node 26.13.0 on this Windows development host, Vitest focused diagnostic command:

```text
pnpm.cmd --dir apps/game exec vitest run src/core/boundedJson.test.ts -t "records local" --silent=false --reporter=dot
```

20 alternating accepted/late-rejected scans, 262144 input code units each, with
the 32768-token structural fixture padded to the input limit: mean **15.248 ms**,
p95 **19.628 ms**, observed heap-used delta **+17290640 bytes** across the mixed
loop. This is an actual local observation, not a browser/phone/production benchmark,
peak allocation bound, portable latency promise or evidence of a leak. GC and
test-runner activity affect heap delta; parser counters bound application work,
not the VM allocator or previously acquired source string. Other tests cover
the 16384-node bound and the one-over rejections independently.

## Remaining gates

No storage adapters, primary/backup keys, migration commits, recovery UX, multi-tab
coordination, UI, gameplay or backend have been integrated. Existing v1 save/load
still rejects v2. Never pass a candidate to that API or interpret pure acceptance
as saved/authoritative. Production multi-writer migration remains BLOCKED by D8.
Native browser fault/quota/reload testing, transactional storage and security
review remain separate later approval gates. No FDS2-006 implementation.
