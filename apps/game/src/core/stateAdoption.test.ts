import { describe, expect, it } from 'vitest';
import sourceText from './stateAdoption.ts?raw';
import { evaluateAdoption, validateAdoptionAuthorization, validateAdoptionProposal,
    type AdoptionProposal, type AdoptionSessionSummary } from './stateAdoption';
import { parseVersionedGameState, applyAggregateInventoryCommand, type GameStateV2 } from './gameStateV2';
import type { MigrationReceipt, MigrationCommitResult, ReconciliationResult, MigrationCause } from './storageMigrationCoordinator';

const id = { gameId: 'qa-game', farmId: 'farm-a', ownerId: 'owner-a' };
const observationId = 'obs-1';
const legacy = () => ({ schemaVersion: 1, ...id, logicalTimeMs: 100,
    metadata: { revision: 7, createdAtLogicalMs: 10, updatedAtLogicalMs: 80 } });
function receipt(source = JSON.stringify(legacy())): MigrationReceipt {
    const p = parseVersionedGameState(source, id);
    if (!p.ok || p.status !== 'migration-required') throw new Error('Invalid fixture');
    return { identity: { ...id }, sourceVersion: 1, sourceRevision: p.sourceRevision, source, target: p.target, state: p.state };
}
function fresh(): AdoptionSessionSummary { return { identity: { ...id }, lifecycle: 'open', observationId, history: { status: 'unestablished' } }; }
const loaded = (state = receipt().state, source = JSON.stringify(state)) => ({ kind: 'load', observationId, result: { status: 'accepted', state, source } });
const confirmed = (state = receipt().state, source = JSON.stringify(state)): AdoptionSessionSummary =>
    ({ ...fresh(), history: { status: 'confirmed-in-live-session', lastVerified: { state, source } } });
function commit(r = receipt(), status: 'committed' | 'already-migrated' = 'committed') {
    const result: MigrationCommitResult = { status, state: r.state, identity: r.identity, backupReference: { sourceVersion: 1, sourceRevision: r.sourceRevision },
        phase: 'complete', primaryWrite: 'target-verified', mutationGate: 'open', cause: null };
    return { kind: 'commit', observationId, receipt: r, result };
}
function reconciled(r = receipt()) {
    const result: ReconciliationResult = { status: 'already-migrated', state: r.state, receipt: r, identity: r.identity,
        backupReference: { sourceVersion: 1, sourceRevision: r.sourceRevision }, phase: 'complete', primaryWrite: 'target-verified',
        mutationGate: 'blocked', cause: null, observedPrimary: r.target, permittedNextAction: 'explicit-state-adoption' };
    return { kind: 'reconciliation', observationId, receipt: r, result };
}
function recovered(r = receipt()) { return { kind: 'recovery', observationId, reference: { sourceVersion: 1, sourceRevision: r.sourceRevision },
    result: { status: 'receipt-reconstructed', receipt: r, reconciliation: reconciled(r).result, mutationGate: 'blocked' } }; }
const storageCause: MigrationCause = { kind: 'storage', code: 'storage-unavailable' };
const failed = (cause: MigrationCause = storageCause) => ({ kind: 'failure', observationId, cause });
function proposal(summary: unknown = fresh(), evidence: unknown = commit()): AdoptionProposal {
    const p = evaluateAdoption(summary, evidence); if (p.status !== 'proposal-eligible') throw new Error('Expected fixture proposal'); return p;
}
function nonempty(): GameStateV2 {
    let state = receipt().state;
    for (const [itemId, quantity] of [['wood', 25], ['stone', 98], ['berry', 20]] as const) {
        const r = applyAggregateInventoryCommand(state, { ...id, expectedGameStateRevision: state.metadata.revision,
            inventoryCommand: { type: 'addItem', inventoryId: 'farm-main', expectedRevision: state.inventory.revision, itemId, quantity } },
        { ownerId: id.ownerId, authorizedQuantityChange: { type: 'addItem', itemId, quantity } });
        if (!r.ok) throw new Error('Invalid item fixture'); state = r.state;
    } return state;
}
function totals(state: GameStateV2) {
    const sums = new Map<string, bigint>();
    for (const slot of state.inventory.slots) if (slot) sums.set(slot.itemId, (sums.get(slot.itemId) ?? 0n) + BigInt(slot.quantity));
    return sums;
}
const authorization = () => ({ ownerId: id.ownerId, approval: 'explicit-adopt-verified-state', operatingMode: 'local-single-writer', competingWriter: 'none-known' });
function noCandidate(result: ReturnType<typeof evaluateAdoption>) {
    expect(result.status).not.toBe('proposal-eligible'); expect(result.mutationPermission).toBe('blocked');
    for (const field of ['state', 'exactPrimary', 'identity', 'adoptedState']) expect(result).not.toHaveProperty(field);
}

describe('A: complete pure decision matrix', () => {
    it('missing never creates a farm or inventory', () => {
        const r = evaluateAdoption(fresh(), { kind: 'load', observationId, result: { status: 'missing' } });
        expect(r).toEqual({ status: 'inspection-only', reason: 'missing-primary', mutationPermission: 'blocked' }); noCandidate(r);
    });
    it('v1 returns only the deterministic uncommitted migration receipt', () => {
        const r = receipt(), before = JSON.stringify(r);
        const decision = evaluateAdoption(fresh(), { kind: 'load', observationId, result: { status: 'migration-required', receipt: r } });
        expect(decision).toEqual({ status: 'migration-required', receipt: r, mutationPermission: 'blocked' });
        noCandidate(decision); expect(JSON.stringify(r)).toBe(before);
        if (decision.status !== 'migration-required') throw new Error('Expected migration');
        expect(decision.receipt).not.toBe(r); expect(decision.receipt.state.inventory.slots).toEqual(Array(20).fill(null));
        expect(decision.receipt.state.metadata.revision).toBe(8); expect(decision.receipt.sourceRevision).toBe(7);
    });
    it('fresh accepted v2 is inspection-only even with nonempty inventory', () => {
        const state = nonempty(), result = evaluateAdoption(fresh(), loaded(state));
        expect(result).toEqual({ status: 'inspection-only', reason: 'unestablished-history', mutationPermission: 'blocked' }); noCandidate(result);
    });
    it('confirmed live load preserves complete nonempty inventory, counters and times', () => {
        const s = nonempty(), raw = JSON.stringify(s), result = proposal(confirmed(s), loaded(s));
        expect(result).toMatchObject({ identity: id, evidenceKind: 'load', observationId, state: s, exactPrimary: raw, mutationPermission: 'read-only' });
        expect(totals(result.state)).toEqual(totals(s)); expect(result.state.metadata).toEqual(s.metadata);
    });
    it.each(['committed', 'already-migrated'] as const)('matching %s commit only plans a proposal', status => {
        const r = receipt(), p = proposal(fresh(), commit(r, status)); expect(p.state).toEqual(r.state);
        expect(p.exactPrimary).toBe(r.target); expect(p.evidenceKind).toBe('commit'); expect(p.status).not.toBe('adopted-read-only');
    });
    it('completed reconciliation permits only a read-only proposal without changing blocked result', () => {
        const e = reconciled(), before = JSON.stringify(e), p = proposal(fresh(), e);
        expect(p.evidenceKind).toBe('reconciliation'); expect(e.result.mutationGate).toBe('blocked'); expect(JSON.stringify(e)).toBe(before);
    });
    it('known-reference recovery supports a proposal, not backup authenticity', () => {
        const e = recovered(), p = proposal(fresh(), e); expect(p.evidenceKind).toBe('recovery');
        expect(p).not.toHaveProperty('authenticated'); expect(p).not.toHaveProperty('historicalAcknowledgment');
    });
    it('source-retained reconciliation never proposes its v2 candidate', () => {
        const r = receipt(), result = { ...reconciled(r).result, status: 'source-confirmed-retained', primaryWrite: 'source-confirmed-retained',
            sourceState: legacy(), observedPrimary: r.source, permittedNextAction: 'explicitly-reauthorized-retry' };
        const { state: _state, ...retained } = result; void _state;
        const d = evaluateAdoption(fresh(), { kind: 'reconciliation', observationId, receipt: r, result: retained });
        expect(d).toMatchObject({ status: 'inspection-only', reason: 'source-retained' }); noCandidate(d);
    });
    it.each(['conflict', 'commit-status-unknown'] as const)('retains %s cause and blocks stale eligibility', status => {
        const r = receipt(), cause: MigrationCause = { kind: 'coordinator', code: status === 'conflict' ? 'source-changed' : 'primary-missing' };
        const result = { identity: id, backupReference: { sourceVersion: 1, sourceRevision: 7 }, phase: 'comparison', mutationGate: 'blocked',
            status, primaryWrite: 'unknown', observedPrimary: null, cause,
            permittedNextAction: status === 'conflict' ? 'operator-review' : 'read-only-reconciliation-or-inspection' };
        const d = evaluateAdoption(confirmed(), { kind: 'reconciliation', observationId, receipt: r, result });
        expect(d).toEqual({ status: 'rejected', cause, mutationPermission: 'blocked' }); noCandidate(d);
    });
    it.each(['open', 'blocked'])('busy preserves caller gate %s and provides no new proposal', mutationGate => {
        const e = { kind: 'reconciliation', observationId, receipt: receipt(), result: { status: 'busy', phase: 'receipt-validation', primaryWrite: 'not-attempted',
            identity: id, backupReference: { sourceVersion: 1, sourceRevision: 7 }, mutationGate,
            cause: { kind: 'coordinator', code: 'busy' }, permittedNextAction: 'retry-after-active-operation' } };
        const before = JSON.stringify(e), d = evaluateAdoption(confirmed(), e);
        expect(d).toMatchObject({ status: 'inspection-only', reason: 'busy' }); noCandidate(d); expect(JSON.stringify(e)).toBe(before);
    });
    it.each(['open', 'blocked'])('definite abort preserves previous %s gate and safe retry classification', mutationGate => {
        const e = commit(), { state: _state, ...base } = e.result; void _state;
        const result = { ...base, status: 'aborted', phase: 'backup-write', primaryWrite: 'not-attempted', mutationGate, cause: storageCause };
        const d = evaluateAdoption(fresh(), { ...e, result }); expect(d).toMatchObject({ reason: 'pre-primary-abort', cause: storageCause });
        noCandidate(d); expect(result.mutationGate).toBe(mutationGate);
    });
    it('storage failure is rejected, not missing, and diagnostics are detached', () => {
        const e = { kind: 'load', observationId, result: { status: 'storage-error', phase: 'primary-read', cause: storageCause } };
        expect(evaluateAdoption(fresh(), e)).toEqual({ status: 'rejected', cause: storageCause, mutationPermission: 'blocked' });
    });
});

describe('B: strict provenance and complete-state consistency', () => {
    it.each([
        (r: MigrationReceipt) => ({ ...r, sourceVersion: 2 }), (r: MigrationReceipt) => ({ ...r, sourceRevision: 6 }),
        (r: MigrationReceipt) => ({ ...r, target: r.target + ' ' }), (r: MigrationReceipt) => ({ ...r, target: '{' }),
        (r: MigrationReceipt) => ({ ...r, source: '{' }), (r: MigrationReceipt) => ({ ...r, extra: true }),
        (r: MigrationReceipt) => ({ ...r, identity: { ...id, farmId: 'foreign' } }),
        (r: MigrationReceipt) => ({ ...r, state: { ...r.state, logicalTimeMs: 101 } }),
        (r: MigrationReceipt) => ({ ...r, state: { ...r.state, metadata: { ...r.state.metadata, revision: 9 } } }),
    ])('rejects altered receipt %j without any candidate', tamper => {
        const r = receipt(), e = { ...commit(r), receipt: tamper(r) }, before = JSON.stringify(e);
        const d = evaluateAdoption(fresh(), e); expect(d.status).toBe('rejected'); noCandidate(d); expect(JSON.stringify(e)).toBe(before);
    });
    it.each([
        { state: { ...receipt().state, logicalTimeMs: 101 } }, { identity: { ...id, ownerId: 'foreign' } },
        { backupReference: { sourceVersion: 1, sourceRevision: 6 } }, { phase: 'primary-write' },
        { cause: storageCause }, { primaryWrite: 'unknown' }, { mutationGate: 'writable' }, { verified: true },
    ])('rejects inconsistent commit result %j', patch => {
        const e = commit(); noCandidate(evaluateAdoption(fresh(), { ...e, result: { ...e.result, ...patch } }));
        expect(evaluateAdoption(fresh(), { ...e, result: { ...e.result, ...patch } }).status).toBe('rejected');
    });
    it('rejects status-only claims and verified booleans', () => {
        for (const e of [{ kind: 'commit', observationId, result: { status: 'committed', verified: true } },
            { kind: 'load', observationId, result: { status: 'accepted', verified: true, state: receipt().state } }]) {
            expect(evaluateAdoption(fresh(), e)).toMatchObject({ status: 'rejected', cause: { code: 'invalid-evidence' } });
        }
    });
    it.each([
        { observedPrimary: ' ' + receipt().target }, { permittedNextAction: 'explicitly-reauthorized-retry' },
        { mutationGate: 'open' }, { receipt: { ...receipt(), sourceRevision: 8 } },
        { backupReference: { sourceVersion: 1, sourceRevision: 8 } }, { state: nonempty() },
    ])('reconciliation target requires exact complete matching evidence %j', patch => {
        const e = reconciled(); expect(evaluateAdoption(fresh(), { ...e, result: { ...e.result, ...patch } }).status).toBe('rejected');
    });
    it.each([null, { sourceVersion: 1, sourceRevision: 6 }, { sourceVersion: 2, sourceRevision: 7 }, { sourceVersion: 1, sourceRevision: Infinity }])('rejects unknown/mismatched recovery reference %j', reference => {
        noCandidate(evaluateAdoption(fresh(), { ...recovered(), reference })); expect(evaluateAdoption(fresh(), { ...recovered(), reference }).status).toBe('rejected');
    });
    it('requires independently consistent outer and embedded receipts after reconstruction', () => {
        const e = recovered(), wrong = { ...e, result: { ...e.result, reconciliation: { ...e.result.reconciliation, receipt: { ...receipt(), sourceRevision: 6 } } } };
        expect(evaluateAdoption(fresh(), wrong).status).toBe('rejected');
    });
    it.each(['commit', 'reconciliation', 'recovery'])('older %s evidence cannot inherit a newer confirmed observation', kind => {
        const evidence = kind === 'commit' ? commit() : kind === 'reconciliation' ? reconciled() : recovered();
        expect(evaluateAdoption(confirmed(nonempty()), evidence)).toMatchObject({ status: 'rejected', cause: { code: 'source-changed' } });
    });
    it('does not inherit history for newer or textually different accepted loads', () => {
        for (const e of [loaded(nonempty()), loaded(receipt().state, ' ' + receipt().target)]) {
            expect(evaluateAdoption(confirmed(), e)).toMatchObject({ status: 'rejected', cause: { code: 'source-changed' } });
        }
    });
    it('preserves escaped and reordered raw v2 text when it exactly matches confirmed evidence', () => {
        const s = nonempty(), raw = '\r\n' + JSON.stringify(s).replace('"gameId"', '"game\\u0049d"') + '\n';
        expect(proposal(confirmed(s, raw), loaded(s, raw)).exactPrimary).toBe(raw);
    });
});

describe('C: immutable, deterministic observations and diagnostic copies', () => {
    it('deep-freezes detached proposals without freezing inputs or changing later decisions', () => {
        const state = nonempty(), summary = confirmed(state), evidence = loaded(state), before = JSON.stringify({ summary, evidence });
        const p = proposal(summary, evidence), repeated = proposal(summary, evidence);
        expect(p).toEqual(repeated); expect(p).not.toBe(repeated); expect(p.state.inventory.slots).not.toBe(state.inventory.slots);
        expect(p.state.metadata).not.toBe(state.metadata); expect(p.state.inventory.slots[0]).not.toBe(state.inventory.slots[0]);
        expect(Object.isFrozen(state)).toBe(false); expect(JSON.stringify({ summary, evidence })).toBe(before);
        expect(Object.isFrozen(p)).toBe(true); expect(Object.isFrozen(p.state.metadata)).toBe(true);
        expect(Object.isFrozen(p.state.inventory.slots)).toBe(true); expect(Object.isFrozen(p.state.inventory.slots[0])).toBe(true);
        expect(Reflect.set(p.state.inventory.slots[0]!, 'quantity', 1)).toBe(false);
        expect(Reflect.set(p.state.metadata, 'revision', 0)).toBe(false); expect(Reflect.set(p, 'mutationPermission', 'write')).toBe(false);
        Reflect.set(state.inventory.slots[0]!, 'quantity', 1); Reflect.set(state.metadata, 'revision', 100);
        expect(totals(p.state)).toEqual(new Map([['wood', 25n], ['stone', 98n], ['berry', 20n]]));
        expect(p.state.metadata.revision).toBe(11);
        expect(evaluateAdoption(summary, evidence)).not.toEqual(p); expect(proposal(confirmed(repeated.state), loaded(repeated.state))).toMatchObject({ state: repeated.state });
    });
    it('detaches and freezes nested failure issues, not caller diagnostics', () => {
        const c = { kind: 'validation' as const, failure: { ok: false as const, code: 'invalid-revision' as const,
            issues: [{ path: 'inventory.revision', message: 'bad revision' }] } };
        const r = evaluateAdoption(fresh(), failed(c)); expect(r).toMatchObject({ status: 'rejected', cause: c });
        c.failure.issues[0].path = 'changed'; expect(r).toMatchObject({ cause: { failure: { issues: [{ path: 'inventory.revision' }] } } });
    });
    it('does not invoke accessors, coercion hooks or retain unexpected fields', () => {
        const explode = () => { throw new Error('Unexpected user code'); };
        const getter = Object.defineProperty({ ...fresh() }, 'history', { enumerable: true, get: explode });
        expect(evaluateAdoption(getter, commit()).status).toBe('rejected');
        expect(evaluateAdoption({ ...fresh(), lifecycle: { toString: explode } }, commit()).status).toBe('rejected');
        expect(evaluateAdoption(fresh(), { ...commit(), kind: { toString: explode } }).status).toBe('rejected');
        expect(evaluateAdoption(fresh(), { ...loaded(), verified: true }).status).toBe('rejected');
    });
});

describe('D: explicit read-only authorization policy, never adoption or saving', () => {
    it.each([
        [undefined, 'invalid-authorization'], [{ ...authorization(), approval: 'explicit-v1-to-v2' }, 'invalid-authorization'],
        [{ ...authorization(), approval: true }, 'invalid-authorization'], [{ ...authorization(), ownerId: 'foreign' }, 'wrong-owner'],
        [{ ...authorization(), competingWriter: 'known' }, 'competing-writer'], [{ ...authorization(), competingWriter: 'known-or-suspected' }, 'competing-writer'],
        [{ ...authorization(), operatingMode: 'production-multi-writer' }, 'unsupported-operating-mode'],
        [{ ...authorization(), canWrite: true }, 'invalid-authorization'],
    ])('refuses %j with %s', (input, expected) => {
        expect(validateAdoptionAuthorization(id, input)).toEqual({ ok: false, cause: { kind: 'adoption', code: expected }, mutationPermission: 'blocked' });
    });
    it('accepts explicit matching approval only for read-only policy', () => {
        expect(validateAdoptionAuthorization(id, authorization())).toEqual({ ok: true, mutationPermission: 'read-only' });
        expect(validateAdoptionAuthorization({ ...id, farmId: '../bad' }, authorization()).ok).toBe(false);
    });
});

describe('E: strict parser, complete state and revision edges', () => {
    it.each([
        ['{', 'malformed-json'], ['{"schemaVersion":99}', 'unsupported-schema'],
        [receipt().target.replace('"itemRegistryVersion":1', '"itemRegistryVersion":99'), 'incompatible-registry'],
        [receipt().target.replace('"revision":8', '"revision":8,"revision":8'), 'duplicate-json-key'],
        [receipt().target.replace('"revision":8', '"revision":9007199254740993'), 'invalid-json-number'],
        [receipt().target.replace('"logicalTimeMs":100', '"logicalTimeMs":1e-308'), 'invalid-json-number'],
        [' '.repeat(JSON_LIMIT), 'parse-limit-exceeded'],
    ])('preserves raw failure %s / %s', (raw, expected) => {
        const d = evaluateAdoption(fresh(), loaded(receipt().state, raw));
        expect(d).toMatchObject({ status: 'rejected', cause: { kind: 'validation', failure: { code: expected } } }); noCandidate(d);
        if (expected === 'malformed-json') expect(d).toMatchObject({ cause: { failure: { offset: 1 } } });
    });
    it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid DTO revision %s with its exact path', revision => {
        const state = receipt().state;
        for (const [invalid, path] of [
            [{ ...state, metadata: { ...state.metadata, revision } }, 'metadata.revision'],
            [{ ...state, inventory: { ...state.inventory, revision } }, 'inventory.revision'],
        ] as const) {
            const d = evaluateAdoption(fresh(), loaded(invalid, receipt().target));
            expect(d).toMatchObject({ status: 'rejected', cause: { kind: 'validation', failure: { code: 'invalid-revision', issues: [{ path }] } } }); noCandidate(d);
        }
    });
    it('rejects cross-revision violation and mismatched logical timestamp', () => {
        const state = receipt().state;
        expect(evaluateAdoption(fresh(), loaded({ ...state, inventory: { ...state.inventory, revision: 9 } }, receipt().target)))
            .toMatchObject({ cause: { failure: { code: 'invalid-revision', issues: [{ path: 'inventory.revision' }] } } });
        expect(evaluateAdoption(fresh(), loaded({ ...state, metadata: { ...state.metadata, updatedAtLogicalMs: 90 } }, receipt().target)))
            .toMatchObject({ cause: { code: 'source-changed' } });
    });
    it('supports last safe migration counter without incrementing it again and preserves overflow diagnostic', () => {
        const source = JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: Number.MAX_SAFE_INTEGER - 1 } });
        const p = proposal(fresh(), commit(receipt(source))); expect(p.state.metadata.revision).toBe(Number.MAX_SAFE_INTEGER);
        const overflow = source.replace(String(Number.MAX_SAFE_INTEGER - 1), String(Number.MAX_SAFE_INTEGER));
        expect(evaluateAdoption(fresh(), { kind: 'load', observationId, result: { status: 'migration-required', receipt: { ...receipt(), source: overflow } } }))
            .toMatchObject({ status: 'rejected', cause: { failure: { code: 'revision-overflow' } } });
    });
    it('preserves maximum capacity and bigint per-item quantities at safe revision limits', () => {
        const state: GameStateV2 = { ...nonempty(), metadata: { ...nonempty().metadata, revision: Number.MAX_SAFE_INTEGER },
            inventory: { ...nonempty().inventory, capacity: 1000, revision: Number.MAX_SAFE_INTEGER,
                slots: Array.from({ length: 1000 }, (_, index) => ({ itemId: index % 2 ? 'wood' : 'stone', quantity: 99 })) } };
        const p = proposal(confirmed(state), loaded(state)); expect(totals(p.state)).toEqual(new Map([['wood', 49500n], ['stone', 49500n]]));
        expect(p.state).toEqual(state); expect(p.state.inventory.revision).toBe(Number.MAX_SAFE_INTEGER);
    });
});
const JSON_LIMIT = 262145;

describe('issuance history binding without application session ownership', () => {
    const operations = [['commit', commit()], ['reconciliation', reconciled()], ['recovery', recovered()]] as const;
    function blocked(result: ReturnType<typeof validateAdoptionProposal>) {
        expect(result.status).toBe('invalidated'); expect(result).not.toHaveProperty('proposal');
        if (result.status !== 'invalidated') throw new Error('Expected blocked invalidation');
        noCandidate(result.decision);
    }
    it.each(operations)('retains unchanged confirmed %s policy without changing authority', (_kind, evidence) => {
        const summary = confirmed(), p = proposal(summary, evidence);
        expect(validateAdoptionProposal(p, summary, evidence)).toEqual({ status: 'retained', proposal: p });
        expect(p.issuanceHistory).toEqual(summary.history); expect(p.mutationPermission).toBe('read-only');
    });
    it.each(operations)('does not promote an unestablished %s proposal when history becomes confirmed', (_kind, evidence) => {
        const p = proposal(fresh(), evidence), result = validateAdoptionProposal(p, confirmed(), evidence);
        blocked(result);
        expect(result).toMatchObject({ decision: { status: 'rejected', cause: { kind: 'adoption', code: 'policy-changed' } } });
        expect(p.issuanceHistory).toEqual({ status: 'unestablished' });
    });
    it.each(operations)('new %s evaluation remains eligible after downgrade but does not retain the old proposal', (_kind, evidence) => {
        const p = proposal(confirmed(), evidence), current = fresh();
        blocked(validateAdoptionProposal(p, current, evidence));
        blocked(validateAdoptionProposal(p, current, evidence)); // Replaying the same result cannot repair the old policy.
        const newlyEvaluated = proposal(current, evidence);
        expect(newlyEvaluated.issuanceHistory).toEqual({ status: 'unestablished' });
        expect(newlyEvaluated.exactPrimary).toBe(p.exactPrimary); expect(newlyEvaluated.observationId).toBe(p.observationId);
        expect(newlyEvaluated.mutationPermission).toBe('read-only');
        expect(validateAdoptionProposal(newlyEvaluated, current, evidence).status).toBe('retained');
        expect(newlyEvaluated).not.toHaveProperty('authenticated'); // Pure consistency cannot attest that new I/O happened.
    });
    it.each(['closed', 'invalidated', 'unresolved'] as const)('confirmed proposal is blocked by current %s policy', changed => {
        const summary = confirmed(), evidence = commit(), p = proposal(summary, evidence);
        const current = changed === 'unresolved' ? { ...summary, history: { status: 'unresolved', cause: storageCause } }
            : { ...summary, lifecycle: changed };
        const result = validateAdoptionProposal(p, current, evidence); blocked(result);
        expect(result).toMatchObject({ decision: { status: 'inspection-only', reason: changed === 'unresolved' ? 'unresolved-history' : 'session-' + changed } });
        if (changed === 'unresolved') expect(result).toMatchObject({ decision: { cause: storageCause } });
    });
    it('binds history kind even with identical observation ID, stored string and complete state', () => {
        const summary = confirmed(), evidence = commit(), p = proposal(summary, evidence);
        if (summary.history.status !== 'confirmed-in-live-session') throw new Error('Expected confirmed history');
        const current = { ...summary, history: { ...summary.history, status: 'reconciled-current-target' } };
        const result = validateAdoptionProposal(p, current, evidence); blocked(result);
        expect(result).toMatchObject({ decision: { cause: { code: 'policy-changed' } } });
        const next = proposal(current, evidence);
        expect(next.exactPrimary).toBe(p.exactPrimary); expect(next.state).toEqual(p.state); expect(next.observationId).toBe(p.observationId);
    });
    it.each(['source', 'metadata', 'inventory'] as const)('changed material history %s invalidates an existing proposal', field => {
        const evidence = commit(), p = proposal(confirmed(), evidence), state = receipt().state;
        const current = field === 'source' ? confirmed(state, ' ' + receipt().target)
            : field === 'metadata' ? confirmed({ ...state, metadata: { ...state.metadata, revision: 9 } }) : confirmed(nonempty());
        blocked(validateAdoptionProposal(p, current, evidence));
    });
    it.each([
        undefined, null, {}, { status: 'unresolved', cause: storageCause }, { status: 'confirmed-in-live-session' },
        { status: 'unestablished', verified: true }, { status: 'confirmed-in-live-session', lastVerified: { source: '{', state: receipt().state } },
        confirmed(nonempty()).history,
        { status: 'confirmed-in-live-session', lastVerified: { source: ' ' + receipt().target, state: receipt().state } },
    ])('rejects malformed or contradictory issuance history %j', issuanceHistory => {
        const result = validateAdoptionProposal({ ...proposal(confirmed(), commit()), issuanceHistory }, confirmed(), commit());
        blocked(result); expect(result).toMatchObject({ decision: { status: 'rejected', cause: { kind: 'adoption', code: 'invalid-proposal' } } });
    });
    it('rejects missing issuance metadata and impossible load-issued unestablished policy', () => {
        const { issuanceHistory: _history, ...missing } = proposal(); void _history;
        blocked(validateAdoptionProposal(missing, fresh(), commit()));
        const p = proposal(confirmed(), loaded());
        const result = validateAdoptionProposal({ ...p, issuanceHistory: { status: 'unestablished' } }, confirmed(), loaded());
        blocked(result); expect(result).toMatchObject({ decision: { cause: { code: 'invalid-proposal' } } });
    });
    it('detaches and deeply freezes issuance history without freezing or mutating the caller', () => {
        const state = nonempty(), summary = confirmed(state), evidence = loaded(state), before = JSON.stringify({ summary, evidence });
        const p = proposal(summary, evidence), history = p.issuanceHistory;
        if (history.status !== 'confirmed-in-live-session') throw new Error('Expected confirmed history');
        expect(history).not.toBe(summary.history); expect(history.lastVerified.state).not.toBe(state);
        expect(history.lastVerified.state.inventory.slots).not.toBe(state.inventory.slots);
        expect(history.lastVerified.state.inventory.slots[0]).not.toBe(state.inventory.slots[0]);
        for (const value of [history, history.lastVerified, history.lastVerified.state, history.lastVerified.state.metadata,
            history.lastVerified.state.inventory, history.lastVerified.state.inventory.slots, history.lastVerified.state.inventory.slots[0]]) {
            expect(Object.isFrozen(value)).toBe(true);
        }
        expect(Object.isFrozen(summary.history)).toBe(false); expect(Object.isFrozen(state.inventory.slots)).toBe(false);
        expect(JSON.stringify({ summary, evidence })).toBe(before);
        expect(Reflect.set(history, 'status', 'unestablished')).toBe(false);
        expect(Reflect.set(history.lastVerified.state.inventory.slots[0]!, 'quantity', 1)).toBe(false);
        Reflect.set(state.inventory.slots[0]!, 'quantity', 1); Reflect.set(state.metadata, 'revision', 100);
        expect(Reflect.set(summary, 'history', { status: 'unestablished' })).toBe(true); // Caller mutation cannot rewrite captured policy.
        expect(history.status).toBe('confirmed-in-live-session'); expect(history.lastVerified.state.metadata.revision).toBe(11);
        expect(totals(history.lastVerified.state)).toEqual(new Map([['wood', 25n], ['stone', 98n], ['berry', 20n]]));
        blocked(validateAdoptionProposal(p, summary, evidence));
    });
    it.each([
        ['missing', { kind: 'load', observationId, result: { status: 'missing' } }, 'inspection-only'],
        ['storage failure', failed(), 'rejected'],
        ['stale observation', { ...commit(), observationId: 'obs-2' }, 'rejected'],
    ])('negative %s keeps blocked restrictions and never exposes a proposal', (_name, evidence, status) => {
        const decision = evaluateAdoption(confirmed(), evidence); expect(decision.status).toBe(status); noCandidate(decision);
        if (_name === 'storage failure') expect(decision).toEqual({ status: 'rejected', cause: storageCause, mutationPermission: 'blocked' });
        if (_name === 'stale observation') expect(decision).toMatchObject({ cause: { kind: 'adoption', code: 'stale-observation' } });
    });
});

describe('captured negative coordinator outcomes and strict diagnostics', () => {
    it('closed or unresolved policy cannot erase a captured typed storage failure', () => {
        for (const summary of [{ ...fresh(), lifecycle: 'closed' }, { ...fresh(), history: { status: 'unresolved', cause: { kind: 'coordinator', code: 'primary-missing' } } }]) {
            expect(evaluateAdoption(summary, failed())).toEqual({ status: 'rejected', cause: storageCause, mutationPermission: 'blocked' });
        }
    });
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 100])('rejects invalid nested item quantity %s without clamping or repair', quantity => {
        const good = nonempty(), state = { ...good, inventory: { ...good.inventory, slots: [{ itemId: 'wood', quantity }, ...good.inventory.slots.slice(1)] } };
        const d = evaluateAdoption(fresh(), loaded(state, JSON.stringify(good)));
        expect(d).toMatchObject({ status: 'rejected', cause: { failure: { code: 'invalid-state', issues: [{ path: 'inventory.slots[0]' }] } } });
        noCandidate(d); expect(Object.is(state.inventory.slots[0]!.quantity, quantity)).toBe(true);
    });
    it('retains rejected load parser diagnostics including offsets, without treating it as a snapshot', () => {
        const parsed = parseVersionedGameState('{', id); if (parsed.ok) throw new Error('Expected parse failure');
        const cause: MigrationCause = { kind: 'validation', failure: parsed };
        expect(evaluateAdoption(fresh(), { kind: 'load', observationId, result: { status: 'rejected', source: '{', cause } }))
            .toEqual({ status: 'rejected', cause, mutationPermission: 'blocked' });
    });
    it.each(['conflict', 'commit-status-unknown'] as const)('commit %s preserves nested cause and never supplies its candidate', status => {
        const e = commit(), { state: _state, ...result } = e.result; void _state;
        const d = evaluateAdoption(fresh(), { ...e, result: { ...result, status, mutationGate: 'blocked', primaryWrite: 'unknown', phase: 'primary-validation', cause: storageCause } });
        expect(d).toEqual({ status: 'rejected', cause: storageCause, mutationPermission: 'blocked' }); noCandidate(d);
    });
    it('positively retained source after a failed commit remains retry-only and blocked', () => {
        const e = commit(), { state: _state, ...result } = e.result; void _state;
        expect(evaluateAdoption(fresh(), { ...e, result: { ...result, status: 'aborted', primaryWrite: 'source-confirmed-retained',
            mutationGate: 'blocked', phase: 'primary-read', cause: storageCause } }))
            .toEqual({ status: 'inspection-only', reason: 'source-retained', cause: storageCause, mutationPermission: 'blocked' });
    });
    it('rejects contradictory safe-abort/write-phase evidence', () => {
        const e = commit(), { state: _state, ...result } = e.result; void _state;
        expect(evaluateAdoption(fresh(), { ...e, result: { ...result, status: 'aborted', primaryWrite: 'not-attempted', phase: 'primary-write', cause: storageCause } }))
            .toMatchObject({ status: 'rejected', cause: { code: 'invalid-evidence' } });
    });
    it.each(['backup-missing', 'invalid-backup', 'backup-conflict', 'recovery-reference-required'] as const)('recovery rejection %s cannot promote a valid-looking primary', name => {
        const reference = name === 'recovery-reference-required' ? null : { sourceVersion: 1, sourceRevision: 7 };
        const cause: MigrationCause = { kind: 'coordinator', code: name };
        const result = { status: 'recovery-rejected', identity: id, backupReference: reference, phase: 'backup-validation', cause,
            primaryWrite: 'unknown', mutationGate: 'blocked', permittedNextAction: 'operator-review-or-correct-reference' };
        const d = evaluateAdoption(fresh(), { kind: 'recovery', observationId, reference, result });
        expect(d).toEqual({ status: 'rejected', cause, mutationPermission: 'blocked' }); noCandidate(d);
    });
    it('reconstructed recovery with an unknown primary remains rejected rather than already-migrated', () => {
        const e = recovered(), result = { identity: id, backupReference: e.reference, phase: 'primary-read', mutationGate: 'blocked',
            status: 'commit-status-unknown', primaryWrite: 'unknown', observedPrimary: null, cause: storageCause,
            permittedNextAction: 'read-only-reconciliation-or-inspection' };
        expect(evaluateAdoption(fresh(), { ...e, result: { ...e.result, reconciliation: result } }))
            .toEqual({ status: 'rejected', cause: storageCause, mutationPermission: 'blocked' });
    });
    it.each(['gameId', 'farmId', 'ownerId'] as const)('foreign load %s cannot use a confirmed observation', field => {
        const original = nonempty(), state = { ...original, [field]: 'foreign',
            inventory: { ...original.inventory, ownerId: field === 'ownerId' ? 'foreign' : original.ownerId } };
        expect(evaluateAdoption(confirmed(nonempty()), loaded(state))).toMatchObject({ status: 'rejected', cause: { failure: { code: 'identity-mismatch' } } });
    });
    it.each([
        { kind: 'storage', code: 'invented' }, { kind: 'validation', failure: { ok: true, code: 'invalid-state' } },
        { kind: 'validation', failure: { ok: false, code: 'invalid-revision', issues: [] } },
        { kind: 'validation', failure: { ok: false, code: 'invalid-revision', issues: [{ path: 'x'.repeat(257), message: 'bad' }] } },
        { kind: 'coordinator', code: 'busy', arbitrary: true }, { kind: 'validation', failure: { ok: false, code: 'malformed-json', offset: -1 } },
    ])('rejects invalid diagnostic shape rather than echoing it: %j', cause => {
        expect(evaluateAdoption(fresh(), { kind: 'failure', observationId, cause })).toMatchObject({ status: 'rejected', cause: { kind: 'adoption', code: 'invalid-evidence' } });
    });
    it('rejects an altered recovery busy reference without changing caller input', () => {
        const reference = { sourceVersion: 1, sourceRevision: 7 };
        const result = { status: 'busy', phase: 'receipt-validation', primaryWrite: 'not-attempted', identity: id,
            backupReference: { ...reference, sourceRevision: 6 }, mutationGate: 'open', cause: { kind: 'coordinator', code: 'busy' },
            permittedNextAction: 'retry-after-active-operation' };
        const evidence = { kind: 'recovery', observationId, reference, result }, before = JSON.stringify(evidence);
        expect(evaluateAdoption(fresh(), evidence).status).toBe('rejected'); expect(JSON.stringify(evidence)).toBe(before);
    });
});

describe('F: pure session-policy inputs and proposal invalidation', () => {
    it.each([
        ['commit', commit()], ['reconciliation', reconciled()], ['recovery', recovered()],
    ])('P2: invalidates confirmed-to-unestablished %s proposal with unchanged evidence', (_kind, evidence) => {
        const summary = confirmed(), before = JSON.stringify({ summary, evidence });
        const p = proposal(summary, evidence);
        const current = { ...summary, history: { status: 'unestablished' } };
        const result = validateAdoptionProposal(p, current, evidence);
        expect(result.status).toBe('invalidated');
        expect(result).not.toHaveProperty('proposal');
        if (result.status !== 'invalidated') throw new Error('Expected invalidated proposal');
        noCandidate(result.decision);
        expect(JSON.stringify({ summary, evidence })).toBe(before);
    });
    it.each(['closed', 'invalidated'] as const)('never proposes for %s session', lifecycle => {
        const d = evaluateAdoption({ ...fresh(), lifecycle }, commit()); expect(d).toMatchObject({ status: 'inspection-only', reason: 'session-' + lifecycle }); noCandidate(d);
    });
    it.each([commit(), reconciled(), recovered(), loaded()])('unresolved history overrides otherwise eligible %j', evidence => {
        const summary = { ...confirmed(), history: { status: 'unresolved', cause: storageCause } };
        expect(evaluateAdoption(summary, evidence)).toEqual({ status: 'inspection-only', reason: 'unresolved-history', cause: storageCause, mutationPermission: 'blocked' });
    });
    it.each([{}, { ...fresh(), verified: true }, { ...fresh(), observationId: '' }, { ...fresh(), history: { status: 'confirmed-in-live-session' } }])('rejects invalid session shape %j', summary => {
        expect(evaluateAdoption(summary, commit())).toMatchObject({ status: 'rejected', cause: { code: 'invalid-session' } });
    });
    it('retains only the same exact proposal under current matching observations', () => {
        const p = proposal(), validated = validateAdoptionProposal(p, fresh(), commit());
        expect(validated).toEqual({ status: 'retained', proposal: p });
        if (validated.status !== 'retained') throw new Error('Expected retained'); expect(validated.proposal).not.toBe(p);
    });
    it.each([
        { ...fresh(), lifecycle: 'closed' }, { ...fresh(), lifecycle: 'invalidated' },
        { ...fresh(), identity: { ...id, farmId: 'farm-b' } }, { ...fresh(), observationId: 'obs-2' },
        { ...fresh(), history: { status: 'unresolved', cause: storageCause } },
    ])('invalidates a previously eligible proposal for changed session %j', summary => {
        const r = validateAdoptionProposal(proposal(), summary, commit()); expect(r.status).toBe('invalidated'); expect(r).not.toHaveProperty('proposal');
    });
    it('failure supersedes successful evidence without publishing any replacement', () => {
        const p = proposal(), before = JSON.stringify(p), r = validateAdoptionProposal(p, fresh(), failed());
        expect(r).toEqual({ status: 'invalidated', decision: { status: 'rejected', cause: storageCause, mutationPermission: 'blocked' } });
        expect(JSON.stringify(p)).toBe(before);
    });
    it('invalidates changed raw primary, state and provenance even with equal identity', () => {
        const state = nonempty(), p = proposal(confirmed(state), loaded(state));
        for (const evidence of [loaded(state, ' ' + JSON.stringify(state)), loaded({ ...state, logicalTimeMs: 101 }), loaded(receipt().state)]) {
            expect(validateAdoptionProposal(p, confirmed(state), evidence).status).toBe('invalidated');
        }
        expect(validateAdoptionProposal(proposal(), fresh(), reconciled()).status).toBe('invalidated');
    });
    it('rejects tampered proposals and preserves pure inputs', () => {
        const p = proposal(), before = JSON.stringify(p);
        for (const invalid of [{ ...p, mutationPermission: 'write' }, { ...p, extra: true }, { ...p, exactPrimary: '{}' }, { ...p, state: nonempty() }]) {
            expect(validateAdoptionProposal(invalid, fresh(), commit()).status).toBe('invalidated');
        } expect(JSON.stringify(p)).toBe(before);
    });
    it('contains no application session, storage, browser, clock or network runtime imports/calls', () => {
        const source = sourceText;
        expect(source).not.toMatch(/\b(?:window|document|localStorage|fetch|setTimeout|setInterval)\b|Date\.now|Math\.random|new StorageMigrationCoordinator|async\s|await\s/);
        const runtimeImports = source.split('\n').filter(line => line.startsWith('import ') && !line.startsWith('import type '));
        expect(runtimeImports.every(line => !/storageMigrationCoordinator|gameStatePersistence|phaser|storage\//.test(line))).toBe(true);
        expect(Object.keys(proposal()).sort()).toEqual(['evidenceKind', 'exactPrimary', 'identity', 'issuanceHistory', 'mutationPermission', 'observationId', 'state', 'status']);
    });
});
