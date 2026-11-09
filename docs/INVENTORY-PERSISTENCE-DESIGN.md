# FDS2-004 — Persistent Inventory Schema & Migration Design

Status: **FDS2-004 DESIGN APPROVED — 2026-11-07** (design only).
The owner accepted D1–D9 and all three completed review amendments. Schema,
migration and revision proposals are retained. Implementation remains unapproved:
this document specifies future acceptance tests, not working v2 validation,
migration or persistence. No production contract changes or implementation PASS.

Subsequent scope update: the owner separately authorized FDS2-005 pure validators,
bounded parsing, migration preparation and aggregate transitions. Its implementation
and measured evidence are recorded in [Pure Schema v2](./GAME-STATE-V2.md).
The approval/check records below describe FDS2-004 at its design checkpoint;
D1–D9 and T01–T38 are preserved. Storage/coordinator/recovery implementation and
production multi-writer migration remain outside that later pure-core approval.

FDS2-006 now specifies the explicit storage boundary in
[Storage Migration Coordinator Design](./STORAGE-MIGRATION-COORDINATOR-DESIGN.md),
**FDS2-006 DESIGN APPROVED — 2026-11-09**, not approved for implementation. It preserves
D1–D9 and T01–T38; proposed storage/fault/browser scenarios are not executed tests.
Review amendments define exact reconciliation outcomes and blocked-gate permissions,
plus read-only receipt reconstruction from one explicit validated backup reference.
They add no automatic migration, restore, enumeration, CAS or gameplay adoption.

## 1. Inspected baseline and compatibility constraints

Repository was clean on main at merge commit
`8e91c51a71fbf85d0acd0420c53d1f9d9d1fff9d`, containing FDS2-001–003.
Codex verified Development Quality
[42356114273](https://github.com/chienng1512k6-ng/Trang-Trai/actions/runs/42356114273)
completed/success for this exact SHA before drafting. The sandbox network request
failed; approved read-only GitHub API retry succeeded. No push or dispatch.

| Existing source | Actual contract to preserve |
|---|---|
| [gameState.ts](../apps/game/src/core/gameState.ts) | Exact v1 fields; schemaVersion=1; ID grammar; nonnegative safe-integer time/revision; created <= updated <= logicalTime; detached validation; clock transition increments aggregate revision once |
| [inventory.ts](../apps/game/src/core/inventory.ts) | Separate inventoryId/ownerId/revision/capacity/slots; default 20, budget 1–1000; null-only empties; pure atomic mutations; own revision +1 per success; no-op/failure unchanged |
| [items.ts](../apps/game/src/core/items.ts) | Immutable composition-time registry, five sample items; no catalog version field currently; unknown IDs/over-limit stacks invalid |
| [gameStatePersistence.ts](../apps/game/src/core/gameStatePersistence.ts) | v1-only JSON codec; same schema-independent key per game/farm/owner; expected revision; replacement +1; creation/time rollback checks; unsupported/corrupt stored strings block writes |
| [InMemorySnapshotStorage.ts](../apps/game/src/storage/InMemorySnapshotStorage.ts) / [BrowserLocalStorageAdapter.ts](../apps/game/src/storage/BrowserLocalStorageAdapter.ts) | Async string port; per-key read/write/remove; failed-write preservation assumption; no transaction/CAS, backup manager or migration |

Current GameState v1 **rejects inventory and schema 2**. Current save cannot
perform this migration by passing a proposed v2 object. Current JSON.parse also
cannot report duplicate raw object keys: it retains the last value. These are
explicit integration gaps, not features this design claims are already present.
The prior regression record is 484 tests/26 files; it is not rerun or relabeled
as a migration test result during this documentation-only task.

References: [GDD](./GDD-V1.0.md), [architecture](./ARCHITECTURE.md),
[state/authority](./GAME-STATE-AUTHORITY.md),
[persistence](./PERSISTENCE-ARCHITECTURE.md), [items/inventory](./ITEM-INVENTORY.md).

## 2. Proposed ownership and schema v2

**D1 review decision: retain** one farm-scoped supply inventory in the
game/farm aggregate, owned by GameState.ownerId. It is NOT a Player-carried
backpack or owner-global inventory shared across farms. GDD death/drop rules
apply to carried items; **farm-main MUST NOT be subject to character death-drop
rules**. Death/knockout/recovery must not remove or drop farm-main contents. A
Player backpack, carried-item drops, transfers and shared ownership are separate
later designs; they cannot reinterpret this container without a new review.

Proposed shape only (not a TypeScript production declaration):

```text
GameStateV2
  schemaVersion: 2
  gameId, farmId, ownerId: existing ID strings
  logicalTimeMs: existing nonnegative safe integer
  metadata:
    revision, createdAtLogicalMs, updatedAtLogicalMs: existing numeric fields
  itemRegistryVersion: 1
  inventory: existing InventoryState DTO
    inventoryId: "farm-main"
    ownerId: exactly outer ownerId
    revision: nonnegative safe integer
    capacity: integer in [1,1000]
    slots: dense array of exactly capacity entries
      null OR { itemId: registered ID, quantity: positive safe integer }
```

All fields above are **required**; no optional extension bag or nullable inventory.
Strict validators reject unknown fields at every record boundary. Preserve all
v1 identity, time and metadata field names/units. Do not embed item definitions,
display names, prices, authority permits, credentials, Phaser objects, DOM/input,
camera, animation, AI, combat HP/cooldowns or transient pending writes.

inventoryId="farm-main" is a **scoped role ID**, not globally unique. Its complete
identity is (gameId,farmId,ownerId,inventoryId). This avoids concatenating arbitrary
64-character IDs into a new ID that violates the existing 64-character grammar.
No hashing, random ID generator or lookup service is needed. The aggregate boundary
must compare game/farm/owner before calling the existing inventory boundary:
inventoryId plus owner alone cannot distinguish two farms belonging to one owner.
D1 records this scoped identity choice; globally unique inventory IDs would need
a separate change request rather than an implicit expansion of this design.

Use the existing primary snapshot key unchanged:
`farm-development:game-state:<encoded gameId>:<encoded farmId>:<encoded ownerId>`.
Inventory is inside that one snapshot, not written under a second live key.
Do not store separate copies of inventory in runtime/persistence as competing truth.

### Catalog pinning and validation

Propose required itemRegistryVersion=1, a trusted immutable catalog release tag,
distinct from schemaVersion and either revision. No tag exists in current registry
code: a future task must explicitly associate version 1 with the five definitions
and exact stack rules recorded in [ITEM-INVENTORY](./ITEM-INVENTORY.md).
Resolve registry by the trusted tag BEFORE validateInventoryState; do not use an
arbitrary client-provided registry or whichever default catalog happens to ship.

For initial v2, only registry version 1 is supported. Retain old supported catalog
definitions unchanged if a later release introduces a new tag. Unknown registry
tag -> incompatible-registry. Unknown item ID within a known catalog -> reject
the entire candidate as invalid-inventory/unknown-item; preserve the original stored string.
Do not discard stacks, clamp quantities, rename items, change stackability or
substitute placeholders automatically. A removed/renamed item or smaller maxStack
requires a separate reviewed catalog migration with quantity/capacity tests.
No migration of item content is part of v1->v2 because v1 has no inventory.

Full validation reuses existing envelope and inventory invariants and additionally
checks matching owners/scoped container ID, known catalog, and
`inventory.revision <= metadata.revision`. This relation is necessary, not proof
of a legitimate history. A standalone snapshot cannot prove which items were earned
or that counters represent real commits. No equality between the two revisions
is required, and item counts must not be inferred from revisions.

## 3. Deterministic v1 -> v2 migration specification

Separate **pure preparation** from **explicit storage commit**. A loader may report
migration-required and an in-memory candidate; it must not write or install that
candidate as the committed gameplay state just because load was called.

For a validated v1 source with aggregate revision r:

1. Validate raw input/version/identity without modifying it. Reject any conflicting
   inventory field on claimed v1; v1 never defined one, so guessing its meaning
   could overwrite valuable data. Missing required v1 fields is an error.
2. Reject revision r=MAX_SAFE_INTEGER: r+1 cannot be represented. No wrap/reset.
3. Copy all v1 gameId/farmId/ownerId, logicalTimeMs and both metadata logical
   timestamps exactly. Create a separate object/array, never mutate the source.
4. Set schemaVersion=2, itemRegistryVersion=1 and metadata.revision=r+1.
5. Create inventoryId="farm-main", ownerId=source.ownerId, inventory.revision=0,
   capacity=20 and **20 explicit nulls**. No seeds, resources, reward or starter items.
   The migration default 20 is frozen in the migration specification; it must not
   change if a future configurable creation default changes.
6. Validate the complete proposed v2 against pinned registry 1 and target identity.
   Produce candidate plus non-persistent receipt: source version/revision and
   original stored string for commit comparison/backup, not an extra authoritative DTO.

**D2 review decision retained:** migration consumes one aggregate revision as
an explicit representation commit; it does not consume an inventory mutation.
All v1 gameplay values/identity/time remain unchanged; r is preserved in the
original snapshot/receipt while new representation uses r+1. The existing +1
replacement rule motivates this choice. Alternative "preserve r" needs an explicit
migration-specific save exception and is not proposed as an unnoticed API change.
metadata.updatedAtLogicalMs stays unchanged: migration is not elapsed gameplay.

Conceptual fixture: v1 revision 7, logicalTimeMs 100, created 0, updated 80 -> v2
revision 8 with the same identity/100/0/80, inventory revision 0 and 20 nulls.
No wall clock, RNG, UI, backend, account lookup or file path determines the result.

### Idempotency and source preservation

Same validated v1 + fixed target/catalog policy -> structurally identical candidate.
Retrying preparation does not keep incrementing a candidate: input remains v1/r.
A valid v2 is accepted unchanged and is never run through v1->v2 again. Migration
dispatcher behavior for versions >2 is reject; no downgrade or partial acceptance.
Versions <=0, missing/non-integer version and unrecognized old versions also reject.

This is deterministic conversion, **not exactly-once storage commit**. If a previous
commit's acknowledgment was lost, require the exact prepared target string and
validated candidate/identity to match current primary. Equal -> already-migrated outcome without a
second write/revision bump. Different/newer valid v2 -> conflict/reload, never
reinitialize its inventory. Still-original v1 -> preparation/commit can be retried.
Ambiguous/corrupt primary -> recovery policy below; no blind retry.

"Preserve valid v1 data" covers fields actually declared by v1, including IDs,
logical time and timestamps. V1 has no saved Player position/combat/inventory data
to reconstruct. Unknown extra legacy data is rejected and retained for review,
not stripped under a claim of compatibility. This design does not certify all
previously JSON-parseable text as safe: duplicate raw keys need the stricter gate
described in section 6.

## 4. Revision consistency and aggregate mutation boundary

metadata.revision is the commit/version token for the **complete persisted local
aggregate**. Inventory.revision remains the subordinate domain token used by
FDS2-003. Neither is a second storage authority or server-authenticated history.
The committed local aggregate is the single source for runtime inventory views.

| Transition | Aggregate revision | Inventory revision | Time/data policy |
|---|---:|---:|---|
| New explicitly created v2 | 0 | 0 | Empty inventory; caller chooses valid logical time |
| Migration from valid v1/r | r+1 | 0 | Preserve v1 times/identity; empty inventory |
| One accepted inventory operation | g+1 | i+1 | Use result of existing operation; same capacity/catalog/owner; no implicit clock advance |
| Accepted non-inventory/clock change | g+1 | unchanged | Inventory fields must be unchanged; explicit time policy only |
| Rejected/no-op operation | unchanged | unchanged | No candidate write or side effects |
| Ordinary load/serialization | unchanged | unchanged | No repairs or wall-clock adjustments |

For inventory operations, set aggregate.updatedAtLogicalMs to current logicalTimeMs
(which is >= prior updatedAt), preserving creation time. The operation does not
advance logicalTimeMs. For migration, preserve updatedAt as specified separately.
Check both counters for overflow BEFORE forming any result. A clock update must
preserve nested inventory rather than projecting v2 through a v1 validator that
would reject/drop it.

Proposed aggregate request wraps the existing InventoryCommand with target
gameId/farmId and expectedGameStateRevision. The inner expectedRevision remains
expectedInventoryRevision semantically. Do not overload a single field for both.
Validate owner via separate authority context; require exact source/sink authorization
for add/remove as FDS2-003 already does. Check both expected tokens and target
identities before invoking a primitive. A stale outer token rejects even if the
inventory token still matches (e.g. a clock-only commit). A stale inner token also
rejects independently. Unknown command definition/quantity overrides remain invalid.

Call the existing pure inventory boundary once, embed its complete returned DTO
in a new aggregate, increment aggregate revision once, validate the whole result.
Do not increment inventory a second time during serialization/save. Do not write
inventory and root metadata separately or combine separately committed add/remove
steps into a supposed atomic crafting transaction.

### Domain atomicity, persistence and concurrency are different

Domain atomicity means invalid operations return neither partial slots nor partial
revision updates; the original aggregate remains unchanged. For the first future
integration, allow one pending aggregate operation per local caller: stage one
candidate, save it against the captured committed baseline, and publish it as
committed only after success. On definite failure, retain original committed
state; expose the error rather than pretending the mutation was saved. Ambiguous
acknowledgment requires reconciliation, not another grant/removal.

Before save, validate candidate and stored baseline against their declared versions
and registry. Compare expected outer/inner revisions, same identities/catalog/
creation epoch, +1 outer increment and the permitted inventory delta. Comparing
counters alone cannot validate arbitrary client-authored next-state contents:
derive normal candidates through authorized aggregate transitions, not a raw
"replace my inventory" command. Loads validate structure, not historic provenance.

Write the full serialized aggregate as **one primary key value**; that prevents
application-induced root/inventory split-key updates. The port's failed-write
preservation assumption is required. This is not crash-proof durability, multi-key
transactions, atomic cross-tab CAS, authentication or a server-side transaction.
Read/compare/write and readback have race windows. Two tabs/callers may still both
pass checks; even a matching readback is not proof no later writer will win.
No multi-tab-safe claim is allowed without a separately approved coordinator or
transactional store. A future server must provide authoritative validation and
transactional compare-and-swap/idempotency; that service is out of scope here.

### D8 concurrency scope and production gate

The local-prototype proposal assumes **one writer per aggregate identity across
the entire origin**, not merely one pending call in each tab. One application
instance serializes its own normal mutations, saves, migration and recovery
attempts. The operator must close other writers (tabs, windows, workers, old app
versions and development tools) before an explicit migration attempt. No storage
event, lock, writer election or cross-tab exclusion currently enforces that
assumption. Read-only inspection is allowed only if it does not write or trigger
migration. If a competing writer is known/suspected, refuse/defer migration and
preserve snapshots; a reread conflict also aborts. An undetected competitor can
still win a race: source-string equality/readback is detection, not prevention.

Single-writer operation is a limited prototype operating assumption, **not
transactional safety, multi-tab CAS, guaranteed crash durability or a production
multi-writer migration design**. Normal save vs migration, migration vs migration
and backup creation vs another writer all have race windows. A backup "write if
absent" is not atomic either; a key described as immutable is a policy in the
supported single-writer workflow, not enforced against other JavaScript callers.

**Production multi-writer migration remains BLOCKED** until separately approved
coordination or transactional storage defines writer exclusion, fencing/recovery,
atomic preconditions, conflict behavior and failure tests. Backend transactions
are one future option, not a service implemented or simulated here. Passing
single-writer tests must not remove this gate or be labeled multi-writer-safe.

## 5. Future migration commit, backup and rollback protocol

No part of this protocol is executed in FDS2-004. A future version-aware adapter
coordinator may reuse SnapshotStorage read/write/remove, but must NOT pass v2
through the existing v1-only GameStatePersistence.save implementation.

Propose one immutable migration backup slot:
`farm-development:game-state-backup:<encoded gameId>:<encoded farmId>:<encoded ownerId>:v1:r<sourceRevision>`.
It contains the **exact stored JSON string returned by SnapshotStorage.read**,
not reserialized source, under an isolated backup namespace. Backups contain no
extra credentials and remain untrusted local
data. Additional storage use can cause quota failure; no auto-pruning is approved.

### Stored-string equality is not raw-byte preservation

SnapshotStorage and native localStorage expose JavaScript strings, not original
file/network bytes or the browser's internal on-disk encoding. "Exact source"
means the same ordered UTF-16 code units, compared with strict string equality
(`===`) at this adapter boundary. It preserves whitespace, member order, escape
spellings, numeric lexemes and line endings present in that string. Do not trim,
normalize Unicode/newlines, parse/stringify or pretty-print the source backup.
Validation scans a separate view of the string and does not modify it.

This does **not** preserve or certify a prior UTF-8 byte sequence, BOM stripped
before storage, original file encoding, disk bytes, cryptographic authenticity
or crash durability. No raw-byte claim is made. A future file/export adapter must
specify its own encoding/BOM/error policy; exact source bytes would require a
separate byte-oriented capture/contract. Identical parsed objects can have
different stored strings and must not pass the source/backup comparison.

Comparison rules: backup reuse/readback and primary-before-write use exact source
string equality; primary-after-write uses exact equality with the **single target
string serialized before the write**, plus independent v2 validation. A valid v2
with equivalent data but a different string is not proof that this write succeeded;
return conflict/unknown and retain both representations for review. Commit-retry
reconciliation may classify already-migrated only after exact expected target
string match, valid same identity/version/revisions and full candidate match.
Preparation must therefore produce a stable target serialization order. This
does not require original source formatting to appear in v2; only the backup
retains that source formatting. No comparison supplies CAS or byte durability.

Commit preconditions: explicit caller decision, target identity verified, valid
source/candidate, and the D8 single-writer operating assumption. Other writers
must be closed; this operator policy is not an enforceable lock. Production
multi-writer execution is blocked as specified above.

1. Capture the source stored string and validate/prepare the candidate and stable
   target string without I/O writes.
2. Read the backup key. Missing -> write the exact source string; existing
   string-identical, separately valid source -> reuse. Different string -> backup-conflict,
   abort. Never overwrite a previous backup to make the check pass.
3. Read backup back and independently validate v1 schema/identity/revision, plus
   exact string equality with the captured source. Any read/quota/verification error
   aborts before primary replacement. The original primary is still untouched.
4. Reread primary; require exact captured source string. A changed or newly incompatible
   primary aborts with source-changed; preserve both copies. This is best effort,
   not CAS: a writer can still intervene after this read.
5. Write the prepared complete v2 target string to the original primary key once. Never remove primary first.
   Never call generic reset or change namespaces to hide unsupported data.
6. Read back, require exact prepared target string equality, independently validate
   version/registry/identity/revisions and compare full candidate contents. Confirm
   committed only if all succeed. Retain v1 backup after success.
7. If outcome is uncertain, stop mutations and report commit-status-unknown.
   Preserve backup and whatever primary exists for inspection. A retry reconciles
   as section 3 specifies. Do not blindly restore old v1 over a possibly newer v2.

| Failure point | Required outcome / retained data |
|---|---|
| Invalid source or preparation failure | Reject; original stored string unchanged; no new inventory applied |
| Backup access/write/quota/readback failure | Abort; never touch primary; retain any preexisting backup |
| Crash after backup but before primary write | Original v1 remains; deterministic retry reuses verified backup |
| Definite primary write failure with conforming adapter | Old primary remains; backup retained; candidate uncommitted |
| Crash after primary write but before acknowledgment | Primary may be valid v2; reconcile exact candidate before treating retry as a new mutation |
| Truncated write / faulty adapter / corrupt readback | Contract violation or corruption, not normal success; primary rejected, backup offered only after separate validation |
| Another writer changes primary | Conflict/unknown; never automatic rollback over another writer |

Recovery is an explicit result: recovery-available lists only separately validated
same-identity backups and their versions/revisions; primary is NOT overwritten on
load. Unknown registry/invalid backup is never accepted merely because primary is
bad. Owner must approve exporting/preserving the bad primary before any separate
restore action. That restore needs a reviewed workflow and confirmation of the
specific backup/rollback boundary, no concurrent writer, and the same write/readback
checks. It may lose changes newer than the backup; it must disclose that rollback
and preserve the original stored string, never fabricate items or bump counters to conceal it.
No automatic restore/downgrade, delete or paid-item recovery guarantee is proposed.
Full restore UX/tooling is a separate deferred task, not silently bundled integration.

## 6. Validation, duplicate data and explicit outcomes

| Input condition | Proposed outcome | Data treatment |
|---|---|---|
| Primary absent | missing | Caller decides new game; no implicit creation |
| Valid v1 + safe revision + approved migration policy | migration-required with prepared v2 | Preserve original; do not write on load |
| Valid v2 + supported catalog/identity | accept unchanged | No revision/time change |
| Unknown future/old schema or catalog | reject incompatible | No downgrade, fallback reset or overwrite |
| Missing fields, bad owner/container, extra/conflicting fields | reject invalid-state/inventory | Preserve stored string and report paths |
| Holes/undefined/slot length mismatch/capacity outside 1–1000 | reject invalid-inventory | No fill/trim/resize |
| Unknown item, nonpositive/fractional/nonfinite/unsafe quantity or stack >maxStack | reject invalid-inventory | No deletion, clamping or restacking |
| Malformed counter, inventory revision > aggregate revision | reject invalid-revision | No counter guessing/reset |
| Revision token differs from current committed baseline | reject conflict | Reload/reconcile, not blind resubmit |
| Corrupt/malformed/truncated primary | reject corrupt; recovery-available if a backup validates separately | Never create empty inventory or prefer arbitrary backup automatically |

Duplicate item IDs in the static registry are invalid as today. Two inventory
slots holding the same itemId are **valid separate stacks**, not duplicates to
deduplicate. Preserve slot order and exact quantities. Multiple inventories,
duplicate role containers, a second root inventory copy or mismatched owner data
are invalid for this single-container schema.

### D7 bounded duplicate-key-aware parsing specification

This is the required **future new version-aware path**, not the existing v1 codec.
Before calling JSON.parse or building a complete DTO, a JSON-aware bounded scan
must validate grammar, the limits below, decoded-key uniqueness and numeric-token
representability. A conforming single-pass parser could perform the same checks;
parser selection is an implementation review item, not permission to weaken them.
No regex-only duplicate detector, eval, unbounded recursion or JSON.parse reviver
is acceptable. A reviver cannot recover duplicates that JSON.parse already lost.

Maintain a separate Set of decoded property names for **each object**, including
objects nested in arrays. Compare decoded JavaScript strings (UTF-16 code units)
exactly, case-sensitively, without locale/case folding or Unicode normalization.
Thus `"inventory"` and `"invent\u006fry"`, escaped/literal equivalent names, and
equivalent surrogate-pair representations collide in the same object. Repeated
decoded names reject even when values are equal. The same key in distinct objects
is allowed. Canonically equivalent but differently encoded Unicode sequences
are not normalized into duplicates; later strict schema validation still rejects
unknown field names. Use Sets/own-data traversal, never inherited-key lookup or
assignment that could interpret `__proto__` as prototype mutation.

#### Deterministic parser resource budgets

All bounds are inclusive. Exceeding any bound returns parse-limit-exceeded,
without partial acceptance, storage writes, repairs, truncation or fallback to an
unbounded parser. Limits apply equally to primary and backup validation and to
v1 inputs entering the **new** migration path. Existing v1 APIs are not changed.

| Resource | Maximum | Counting rule |
|---|---:|---|
| Stored input string | 262,144 UTF-16 code units | Check `string.length` before scanning or decoding; this is not a byte/file-size promise |
| Open object/array nesting | 16 | Root container depth=1; each nested object/array adds 1, including containers inside arrays |
| Lexical tokens | 32,768 | Each punctuation token, string (key or value), number, true/false/null counts once; whitespace is scanned within the input bound |
| Values/nodes | 16,384 | Count root plus each object/array or primitive value once; keys are separately bounded strings/tokens |
| Members of one object | 64 | Count member occurrences, including duplicates before rejection; key Set is bounded accordingly |
| Elements of one array | 1,000 | Count all element positions; schema may reject otherwise valid arrays or lengths |
| One decoded property name | 128 UTF-16 code units | Stop while decoding escapes, not after constructing an unbounded string |
| One decoded string value | 1,024 UTF-16 code units | Same incremental rule; IDs still have stricter domain limit 64 |
| One numeric lexeme | 128 ASCII characters | Includes sign, fraction, exponent marker/sign/digits |
| Absolute explicit decimal exponent | 308 | Parse bounded digits; reject over-limit exponent without constructing huge powers/integers |

These budgets fit the proposed 1,000-slot envelope with declared small fields;
they do not expand capacity or authorize extra schema fields. Valid JSON within
budgets is still subject to complete schema/identity/registry validation. No
comments, trailing commas, extra trailing values, unescaped control characters,
malformed escape sequences or leading BOM are accepted, consistent with the
intended strict JSON grammar. JSON whitespace alone is not an empty/new snapshot.
String escape handling follows JSON/JavaScript code-unit semantics (including
escaped lone surrogates); it must not silently replace/normalize code units.
ASCII IDs and known field names remain stricter than this lexical allowance.

Scan at most the bounded input, stop on first fatal error and avoid superlinear
rescanning. An explicit bounded container stack is preferred. No allocation,
Set, decoded string, numeric conversion or diagnostic may grow beyond these
associated budgets; diagnostics are bounded codes/paths, not copied input dumps.
Return only the first fatal error, with code and source offset; diagnostic paths
are limited to 256 UTF-16 code units. If a full path would exceed that, report
offset/code without a path rather than allocating/truncating a copy of source data.
The implementation must test worst-case accepted and rejected inputs and report
allocation/latency observations. These deterministic counters are not a portable
hard millisecond deadline or exact process-heap cap; runtime/allocator overhead
and already-acquired localStorage strings remain outside a parser-only guarantee.

#### JSON numbers, precision and compatibility

All numeric fields in the proposed v1/v2 snapshot contracts are integers. Before
conversion, analyze each bounded JSON numeric lexeme as an **exact decimal value**:
it must be mathematically integral and within [-9007199254740991,9007199254740991].
Check sign/digits/decimal scale/exponent with bounded decimal arithmetic; do not
first round to Number and then rely solely on Number.isSafeInteger. The exponent
limit prevents unbounded power construction; no unbounded BigInt allocation is
permitted. A lexically valid but nonintegral/out-of-safe-range number returns
invalid-json-number. Domain validation then rejects negative counters, zero
quantities and other field-specific violations. No numeric strings are coerced.

Examples: `1`, `1.0`, `1e3`, `10e-1` are exact integers and may pass the numeric
gate; context still decides whether each value is valid. `9007199254740993`,
`9007199254740991.1`, `1.0000000000000001`, `1e-324` and `1.5` reject, even if
Number conversion would round/underflow some into apparently valid integers.
`1e309` and `0e999999999` exceed the exponent budget and reject as limit errors.
`-0` is mathematical zero and follows existing field rules (zero counters allowed,
zero quantities rejected); output JSON serialization may spell it `0`. The exact
source spelling remains in the preserved source backup, not in normalized v2 JSON.

After these checks, Number conversion must be finite/safe and schema validation
must still pass. Serialization preserves accepted integer **values** and contract
fields; it does not preserve numeric spelling, negative-zero spelling, key order
or whitespace from the source. That textual information is retained only by the
exact stored-string backup. No raw-byte preservation claim is implied.

Error precedence in the new path: input/resource budget and lexical checks,
including duplicates/numeric tokens, before version dispatch; then schema/catalog,
identity and domain invariants. Unsupported versions that pass lexical checks
are rejected explicitly, never migrated speculatively. A bad future-schema string
may therefore fail a lexical limit before version classification; it is preserved
and never accepted in either case.

This gate deliberately narrows compatibility relative to the existing JSON.parse
path: ambiguous duplicate keys, precision-losing numerals, excessive exponents,
depth or size that an older client accepted must now reject in the new migration
path. Do not claim every previously parseable snapshot migrates. Preserve the
exact stored string, report the reason, and require separately reviewed recovery/
conversion for such data; never coerce or silently reset. Legacy FDS2-001–003 APIs,
their current numeric validation, errors and tests remain unchanged. No parser,
dependency, v2 validator or runtime gate is implemented in this review amendment.

## 7. Authority and trust boundaries

| Boundary | Required treatment |
|---|---|
| Registry | Trusted immutable versioned config; snapshot/command cannot redefine item, limit or entitlement |
| Inventory command | Intent only; exact whitelist, target aggregate/container and both revision preconditions |
| Source/sink context | Independently derived authorized change; never copy client quantity into authorization; local context remains forgeable |
| Snapshot/localStorage/backup | Untrusted editable data; validate structure and identity; no proof of ownership, legitimate history, freshness or paid rights |
| Aggregate transition | One candidate from existing domain rules; no partial update or second position/combat writer |
| Future backend | Authenticate owner, authorize actual source/reward/cost, resolve registry, enforce transactions/idempotency and authoritative time |

No authentication, networking, entitlement service, offline catch-up, encryption
or server-authoritative gameplay is implemented by adding a schema. Restoring a
local backup is not an authoritative recovery operation for a commercial economy.

## 8. Proposed test matrix and acceptance gates

These are specifications, **not new tests executed or migration safety proven**.
N = existing checks runnable now; P = pure tests to implement after approval;
S = storage/coordinator tests deferred to approved integration; B = later browser QA.

| ID / phase | Scenario | Required assertion |
|---|---|---|
| T01 N | Existing v1 validation, transitions, codec/storage and inventory tests | Preserve current 484-test baseline; no change to strict v1 semantics |
| T02 P | Valid v1 with distinct logical/created/updated values and long valid IDs | Migrate all identities/times exactly; root r+1; no ID truncation |
| T03 P | Inventory initialization | farm-main, matching owner, revision 0, capacity 20, exactly 20 nulls, no starter grant |
| T04 P | Same v1 twice, frozen input, alternate future creation default | Same target values; no input mutation; migration default stays 20 |
| T05 P | Valid v2 passed through dispatcher repeatedly | Accept unchanged; no reinitialization/revision bump |
| T06 P | Valid nonempty v2 round trip | Preserve every slot/item/quantity, both revisions and timestamps; pinned catalog used |
| T07 P | Missing fields, v1 claiming inventory, unknown extras, wrong owner/container | Reject; never strip or repair data |
| T08 P | NaN/Infinity/fractions/negative/unsafe fields, revision MAX | Reject invalid numbers; v1 MAX migration overflow leaves source unchanged |
| T09 P | Unknown item/tag, changed maxStack or stackability | Reject using versioned registry; no loss/clamp/reinterpretation |
| T10 P | Wrong slot counts, holes, undefined, zero stacks, repeated valid item stacks | Invalid shapes rejected; multiple same-item slots preserved |
| T11 P | i>g, stale g only, stale i only, wrong game/farm/owner | Separate conflict/invalid outcomes; no mutation/write |
| T12 P | All five accepted operations | Existing quantity invariants; i+1 and g+1 exactly once |
| T13 P | Full/over-remove/incompatible/no-op/unauthorized/overflow operation | Identical root, inventory, revisions and times; no candidate commit |
| T14 P | Clock-only change and serialization | g+1/i unchanged for change; no nested data loss; codec alone increments neither |
| T15 P | Seeded mixed operations and many-slot large safe quantities | BigInt per-item conservation; deterministic replay, no duplication/loss |
| T16 P/S | Duplicate JSON properties including escaped names at nested depth | New raw gate rejects ambiguity; no regex/reviver false assurance |
| T17 S | v1 source under wrong identity key; many game/farm/owner keys | Reject mismatch; isolate primary and backup slots, including same farm-main role |
| T18 S | Backup missing, identical or conflicting; quota/access failure | Create/reuse only exact verified backup; abort conflict; primary untouched |
| T19 S | Source changes after preparation/before commit | Abort compare mismatch; do not overwrite newer snapshot |
| T20 S | Partial/failed write, bad adapter, corrupt/truncated readback | No success acknowledgment; source backup retained; no blind rollback |
| T21 S | Crash before/after primary replacement; acknowledgment lost | Original or validated target reconciled; no second conversion/grant |
| T22 S | Valid backup vs invalid/foreign/incompatible backup | Offer only separately valid same-identity recovery; no automatic restore |
| T23 S | Corrupt primary + valid backup, or newer primary than backup | Preserve exact stored strings; recovery requires explicit decision and rollback disclosure |
| T24 S | Concurrent writers in two service instances/tabs | Demonstrate remaining race; never label revision compare as CAS |
| T25 P/S | Future schema and unknown catalog | Reject explicitly and preserve stored string; older v1 client refuses v2 |
| T26 B | Native storage reload, migration retry, blocked/quota storage | Check actual supported browsers separately; no emulation-as-phone claims |
| T27 P | Stored source whitespace, CRLF/LF, escape spellings, member/numeric ordering; parsed-equivalent but different strings | Backup/read-compare preserves UTF-16 sequence; unequal strings are conflict, not byte-equivalence or source-equality |
| T28 S | Primary target readback differs only textually from prepared target | Do not acknowledge the write from structural equality alone; classify conflict/unknown and retain original/backup |
| T29 P | Duplicate keys at root, nested metadata/inventory, objects inside arrays; equal and unequal repeated values | Reject repeated decoded keys at every object depth; repeated keys in separate objects allowed |
| T30 P | Escaped vs literal keys, escaped backslash/quote, surrogate pairs, case and Unicode normalization variants, __proto__ | Correct decoded-key comparison without normalization/prototype effects or false positives |
| T31 P | Input length 262144/262145; depth 16/17; tokens 32768/32769; nodes 16384/16385 | At-bound lexical inputs pass that budget; one over returns parse-limit-exceeded, no write/partial DTO; schema acceptance is a separate assertion |
| T32 P | Members 64/65, array elements 1000/1001, decoded keys 128/129 and string values 1024/1025; escape-heavy inputs and long error paths | Incremental bounded allocation; first-error/offset and 256-unit path policy; lexical-budget tests separate from stricter domain limits |
| T33 P | Numeric lexeme 128/129 characters, exponent +/-308 and +/-309, giant exponent digit strings | Enforce deterministic limits before expensive conversion; do not silently accept 0 with over-budget exponent |
| T34 P | Safe integer boundaries, overflow, precision-losing fraction, tiny underflow, -0, 1.0/1e3/10e-1 | Exact decimal integer gate before Number; no rounded numeric acceptance; field validation remains separate |
| T35 P | BOM, whitespace-only, invalid escapes/control chars, trailing text/comma/comments, truncated containers | Strict JSON rejection; no parser fallback, mutation or source-string normalization |
| T36 P/S | Formerly accepted v1 raw strings outside new budgets or with duplicate/rounded numbers | New path rejects and preserves source; legacy v1 API regression behavior unchanged |
| T37 S | Single instance serializes save/migration/recovery; known competing writer; backup key race | Honor single-writer assumption, refuse/defer known competition; race test explicitly demonstrates absence of CAS |
| T38 S | Production multi-writer rollout attempted without separately approved coordination/store | Gate remains blocked regardless of single-writer test success; no transactional safety claim |

Runnable now: repository inspection, existing regression if requested, whitespace/
relative-link validation. For this documentation-only change, run git diff --check
and document checks; do not invent new migration test results. The previous 484
tests remain historical evidence until actually rerun. After implementation, require
lint/typecheck/all tests/build, the pure matrix, then storage fault tests and browser
checks relevant to the approved integration. Test counts must be measured again.

## 9. Architecture review decisions D1–D9

Owner outcome: **FDS2-004 DESIGN APPROVED — 2026-11-07** (design only).
The owner accepted D1–D9, including all three completed review amendments,
retaining the schema/migration/revision model and the decisions recorded below.
It is not approval to implement, add a parser dependency, migrate data or release
production multi-writer persistence. Implementation conformance remains unverified.

| Decision | Recorded design decision | Scope / remaining consequence |
|---|---|---|
| D1 Container semantics | Retain farm-scoped supply inventory / scoped farm-main ID; explicitly NOT a Player backpack | Character death-drop rules MUST NOT affect it; carried storage/ownership transfers need separate design |
| D2 Migration revision | Retain r+1 outer, inventory 0; source r retained in source snapshot/receipt | No revision reset, gameplay clock advance or hidden exception to +1 replacement policy |
| D3 Compatibility API | Retain explicit V2/version-aware path; preserve legacy v1 APIs/constants/contracts/tests | New strict load path may reject ambiguous/over-budget old strings; cannot silently change legacy behavior |
| D4 Catalog versioning | Retain required immutable catalog tag 1 and fail-closed item/tag validation | Removed items/changed limits require separately reviewed catalog migration |
| D5 Missing inventory on v2 | Retain rejection; only valid v1 migration initializes empty inventory | No silent repair/default inventory on corrupt v2 |
| D6 Backup/commit | Amend to exact stored-string preservation/comparison, verified backup + prepared target readback; same primary key | No raw-byte claim, atomic backup creation or multi-key transaction; quota/retention risks remain |
| D7 Duplicate/raw numeric parsing | Amend with section 6 decoded-key detection at every depth, explicit limits and exact numeric-token policy | Parser selection and conformance tests deferred; no regex/reviver shortcut, implicit dependency or implementation approval |
| D8 Concurrency | Amend to one writer per aggregate across the origin for local prototype; no multi-tab CAS/transaction guarantee | Production multi-writer migration BLOCKED pending separately approved coordination or transactional storage |
| D9 Recovery | Retain separately validated backup offer and explicit separately scoped restore | No automatic rollback/delete; preserves source string and discloses potentially lost newer changes |

Implementation remains **blocked on explicit implementation authorization** and
review of parser/coordinator conformance. Production multi-writer migration has
the additional separate D8 coordination/storage gate. No existing code is changed.
Unknown item failures intentionally favor preservation/inspection over availability.
Backup quota, untrusted rollback history, registry evolution and mixed old/new tabs
remain risks; none is solved just by increasing schemaVersion.

Proposed next work, all unapproved and not new Sprint commitments:

1. Separately approve implementation scope and
   parser selection/conformance plan without weakening D1–D9.
2. Pure V2 validation/version dispatch + deterministic migration preparation and
   aggregate inventory transition; implement P tests, preserve legacy v1 API tests.
3. Separate explicit storage migration coordinator/backup/fault-recovery reporting;
   implement S tests and scoped native browser checks. No gameplay autosave.
4. Only then separately approve gameplay/load/reset/restore UX and production
   browser/device testing. Economy/backend and carried inventory remain later scope.

No code or migration implementation is accepted by this document. Do not mark
FDS2-004 PASS implementation, auto-merge or start the proposed follow-up work.

## 10. Checks actually executed for this design

- `git status --short`, `git log -3 --oneline`, `git rev-parse HEAD`: inspected;
  clean baseline noted in section 1; final changes are these three documents only.
- `git diff --exit-code 8b6c497 HEAD --` the six inspected domain/storage files:
  exit 0; their source matches the pre-interruption inventory commit inspection.
- `git diff --exit-code -- apps/game package.json pnpm-lock.yaml pnpm-workspace.yaml .github`:
  exit 0; no runtime source/assets, dependencies, schema, adapters or CI changes.
- `git diff --check`: PASS, exit 0. Separate scan of all three new/changed docs
  found no trailing whitespace, missing final newline or broken relative links.
- Lint/typecheck/unit/build **NOT RERUN**: documentation-only changes, as scoped.
  484 tests is the previous recorded FDS2-003 result, not a new run here.
- Migration, storage fault injection, v2 round trips and browser/device QA
  **NOT TESTED / NOT IMPLEMENTED**; section 8 is a future test plan.

Historical amendment review: owner's APPROVE WITH CHANGES was recorded; D1–D9
now retain the schema/migration/revision design with stored-string terminology,
bounded parsing/numeric compatibility and explicit single-writer/production gates.
The working tree already contained the uncommitted design documents before this
amendment; they are continued here without touching other code. Final docs-only
checks are recorded in the Sprint ticket; parser tests T27–T38 remain planned,
not executed. The prior 484 tests are not claimed as a fresh regression.
Amendment documentation checks passed: git diff --check; protected source/
dependency/CI diff guard; whitespace/newline/relative links in all three documents;
nine D1–D9 rows and 38 proposed test groups; no obsolete positive raw-byte
preservation wording found. These checks did not run any parser/migration code.

Final design approval checkpoint — 2026-11-07: the owner accepted the design,
D1–D9 and all three review amendments. This supersedes the historical conditional
review status above. Documentation checks verify this status update only, not
parser, migration or persistence implementation safety. T01–T38 retain their
proposed classifications; no implementation PASS or implementation authorization.
No merge, commit or push.
