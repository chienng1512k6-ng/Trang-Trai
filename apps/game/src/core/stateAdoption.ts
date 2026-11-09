import { isGameStateId, validateGameState } from './gameState';
import { hasExactFields, isPlainDataRecord } from './items';
import { parseVersionedGameState, validateGameStateV2, type GameStateV2, type V2Failure } from './gameStateV2';
import { JSON_LIMITS, type JsonFailure } from './boundedJson';
import type { SnapshotIdentity } from './gameStatePersistence';
import type { BackupReference, MigrationCause, MigrationReceipt, MigrationCommitResult,
    ReconciliationAttemptResult, RecoveryAttemptResult, VersionedLoadResult } from './storageMigrationCoordinator';

export interface CommittedObservation { readonly source: string; readonly state: GameStateV2 }
export type AdoptionHistory = { readonly status: 'unestablished' }
    | { readonly status: 'confirmed-in-live-session' | 'reconciled-current-target'; readonly lastVerified: CommittedObservation }
    | { readonly status: 'unresolved'; readonly cause: MigrationCause };
/** observationId correlates caller-captured inputs; it proves neither freshness
 * nor I/O. Package B owns issuance, ordering and real session lifetime. */
export interface AdoptionSessionSummary {
    readonly identity: SnapshotIdentity; readonly lifecycle: 'open' | 'closed' | 'invalidated';
    readonly observationId: string; readonly history: AdoptionHistory;
}
export type CapturedAdoptionEvidence = { readonly observationId: string } & (
    { readonly kind: 'load'; readonly result: VersionedLoadResult }
    | { readonly kind: 'commit'; readonly receipt: MigrationReceipt; readonly result: MigrationCommitResult }
    | { readonly kind: 'reconciliation'; readonly receipt: MigrationReceipt; readonly result: ReconciliationAttemptResult }
    | { readonly kind: 'recovery'; readonly reference: BackupReference | null; readonly result: RecoveryAttemptResult }
    | { readonly kind: 'failure'; readonly cause: MigrationCause });
export type AdoptionCode = 'invalid-session' | 'invalid-evidence' | 'wrong-target' | 'source-changed'
    | 'stale-observation' | 'policy-changed' | 'invalid-proposal' | 'invalid-authorization' | 'wrong-owner'
    | 'competing-writer' | 'unsupported-operating-mode';
export type AdoptionCause = MigrationCause | { readonly kind: 'adoption'; readonly code: AdoptionCode };
export type InspectionReason = 'missing-primary' | 'unestablished-history' | 'unresolved-history'
    | 'source-retained' | 'busy' | 'pre-primary-abort' | 'session-closed' | 'session-invalidated';
export type AdoptionProposal = { readonly status: 'proposal-eligible'; readonly identity: SnapshotIdentity;
    readonly observationId: string; readonly exactPrimary: string; readonly state: GameStateV2;
    /** Detached issuance policy, not proof of I/O, freshness or session ownership. */
    readonly issuanceHistory: Exclude<AdoptionHistory, { readonly status: 'unresolved' }>;
    readonly evidenceKind: 'load' | 'commit' | 'reconciliation' | 'recovery'; readonly mutationPermission: 'read-only' };
export type AdoptionDecision = AdoptionProposal
    | { readonly status: 'inspection-only'; readonly reason: InspectionReason; readonly mutationPermission: 'blocked'; readonly cause?: MigrationCause }
    | { readonly status: 'migration-required'; readonly receipt: MigrationReceipt; readonly mutationPermission: 'blocked' }
    | { readonly status: 'rejected'; readonly cause: AdoptionCause; readonly mutationPermission: 'blocked' };
export interface AdoptionAuthorization {
    readonly ownerId: string; readonly approval: 'explicit-adopt-verified-state';
    readonly operatingMode: 'local-single-writer'; readonly competingWriter: 'none-known';
}
export type AdoptionAuthorizationResult = { readonly ok: true; readonly mutationPermission: 'read-only' }
    | { readonly ok: false; readonly cause: AdoptionCause; readonly mutationPermission: 'blocked' };

const own = Object.prototype.hasOwnProperty;
const counter = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const oneOf = (value: unknown, choices: readonly string[]): value is string => typeof value === 'string' && choices.includes(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b); // Validated canonical DTOs only.
const code = (value: AdoptionCode): AdoptionCause => ({ kind: 'adoption', code: value });
const reject = (cause: AdoptionCause): Extract<AdoptionDecision, { status: 'rejected' }> => ({ status: 'rejected', cause, mutationPermission: 'blocked' });
const inspect = (reason: InspectionReason, cause?: MigrationCause): AdoptionDecision =>
    ({ status: 'inspection-only', reason, mutationPermission: 'blocked', ...(cause ? { cause } : {}) });
/** Only applied to newly detached, bounded DTOs, never to caller-owned objects. */
function freeze<T>(value: T): T {
    if (typeof value === 'object' && value !== null) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    return value;
}
function identity(input: unknown): SnapshotIdentity | null {
    return hasExactFields(input, ['gameId', 'farmId', 'ownerId']) && [input.gameId, input.farmId, input.ownerId].every(isGameStateId)
        ? { gameId: input.gameId as string, farmId: input.farmId as string, ownerId: input.ownerId as string } : null;
}
function ref(input: unknown): BackupReference | null {
    return hasExactFields(input, ['sourceVersion', 'sourceRevision']) && input.sourceVersion === 1
        && counter(input.sourceRevision) && input.sourceRevision < Number.MAX_SAFE_INTEGER
        ? { sourceVersion: 1, sourceRevision: input.sourceRevision } : null;
}
const reference = (r: MigrationReceipt): BackupReference => ({ sourceVersion: 1, sourceRevision: r.sourceRevision });
const validation = (failure: JsonFailure | V2Failure): MigrationCause => ({ kind: 'validation', failure });

/** Copy only declared diagnostic fields. No stringify of unvalidated records,
 * accessors or unbounded arbitrary error graphs. Existing validators fit bounds. */
function failure(input: unknown): JsonFailure | V2Failure | null {
    if (!isPlainDataRecord(input) || input.ok !== false || typeof input.code !== 'string') return null;
    if (['malformed-json', 'duplicate-json-key', 'parse-limit-exceeded', 'invalid-json-number'].includes(input.code)) {
        return hasExactFields(input, ['ok', 'code', 'offset']) && counter(input.offset)
            ? { ok: false, code: input.code as JsonFailure['code'], offset: input.offset } : null;
    }
    if (input.code === 'invalid-state' || input.code === 'invalid-revision') {
        if (!hasExactFields(input, ['ok', 'code', 'issues']) || !Array.isArray(input.issues)
            || input.issues.length < 1 || input.issues.length > 2048 || Reflect.ownKeys(input.issues).length !== input.issues.length + 1) return null;
        const issues: { path: string; message: string }[] = [];
        for (let i = 0; i < input.issues.length; i++) {
            const descriptor = Object.getOwnPropertyDescriptor(input.issues, String(i));
            const issue: unknown = descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
            if (!hasExactFields(issue, ['path', 'message']) || typeof issue.path !== 'string' || issue.path.length > JSON_LIMITS.path
                || typeof issue.message !== 'string' || issue.message.length > JSON_LIMITS.string) return null;
            issues.push({ path: issue.path, message: issue.message });
        }
        return { ok: false, code: input.code, issues };
    }
    return ['unsupported-schema', 'incompatible-registry', 'revision-overflow', 'identity-mismatch', 'invalid-identity'].includes(input.code)
        && hasExactFields(input, ['ok', 'code']) ? { ok: false, code: input.code as Exclude<V2Failure['code'], 'invalid-state' | 'invalid-revision'> } : null;
}
function cause(input: unknown): MigrationCause | null {
    if (!isPlainDataRecord(input)) return null;
    if (input.kind === 'storage') return hasExactFields(input, ['kind', 'code'])
        && (input.code === 'quota-exceeded' || input.code === 'storage-unavailable') ? { kind: 'storage', code: input.code } : null;
    if (input.kind === 'validation') {
        const f = hasExactFields(input, ['kind', 'failure']) ? failure(input.failure) : null;
        return f ? validation(f) : null;
    }
    const codes: readonly string[] = ['invalid-preparation', 'backup-missing', 'backup-conflict', 'invalid-backup', 'source-changed',
        'target-mismatch', 'primary-missing', 'busy', 'recovery-reference-required', 'invalid-reference', 'approval-required',
        'forbidden', 'competing-writer', 'production-coordination-required', 'reconciliation-required'];
    if (input.kind !== 'coordinator' || typeof input.code !== 'string' || !codes.includes(input.code)) return null;
    const nested = own.call(input, 'failure');
    if (!hasExactFields(input, nested ? ['kind', 'code', 'failure'] : ['kind', 'code'])) return null;
    const f = nested ? failure(input.failure) : null; if (nested && !f) return null;
    return { kind: 'coordinator', code: input.code as Extract<MigrationCause, { kind: 'coordinator' }>['code'], ...(f ? { failure: f } : {}) };
}
type Checked<T> = { ok: true; value: T } | { ok: false; cause: AdoptionCause };
const bad = (value: AdoptionCode = 'invalid-evidence'): Checked<never> => ({ ok: false, cause: code(value) });
function observed(source: unknown, state: unknown, id: SnapshotIdentity): Checked<CommittedObservation> {
    if (typeof source !== 'string') return bad();
    const parsed = parseVersionedGameState(source, id);
    if (!parsed.ok) return { ok: false, cause: validation(parsed) };
    if (parsed.status !== 'accepted') return bad();
    const dto = validateGameStateV2(state);
    if (!dto.ok) return { ok: false, cause: validation(dto) };
    if (!same(dto.value, parsed.state)) return bad('source-changed');
    return { ok: true, value: { source, state: parsed.state } };
}
function receipt(input: unknown, id: SnapshotIdentity): Checked<MigrationReceipt> {
    if (!hasExactFields(input, ['identity', 'sourceVersion', 'sourceRevision', 'source', 'state', 'target']) || typeof input.source !== 'string') return bad();
    const ri = identity(input.identity), rr = ref({ sourceVersion: input.sourceVersion, sourceRevision: input.sourceRevision });
    if (!ri || !rr) return bad(); if (!same(ri, id)) return bad('wrong-target');
    const parsed = parseVersionedGameState(input.source, id);
    if (!parsed.ok) return { ok: false, cause: validation(parsed) };
    if (parsed.status !== 'migration-required') return bad();
    const target = observed(input.target, input.state, id); if (!target.ok) return target;
    if (input.target !== parsed.target || rr.sourceRevision !== parsed.sourceRevision || !same(target.value.state, parsed.state)) return bad('source-changed');
    return { ok: true, value: { identity: ri, ...rr, source: input.source, target: parsed.target, state: parsed.state } };
}
function session(input: unknown): Checked<AdoptionSessionSummary> {
    if (!hasExactFields(input, ['identity', 'lifecycle', 'observationId', 'history']) || !isGameStateId(input.observationId)
        || !oneOf(input.lifecycle, ['open', 'closed', 'invalidated'])) return bad('invalid-session');
    const id = identity(input.identity), h = input.history;
    if (!id || !isPlainDataRecord(h)) return bad('invalid-session');
    let history: AdoptionHistory;
    if (h.status === 'unestablished' && hasExactFields(h, ['status'])) history = { status: 'unestablished' };
    else if (h.status === 'unresolved' && hasExactFields(h, ['status', 'cause'])) {
        const c = cause(h.cause); if (!c) return bad('invalid-session'); history = { status: 'unresolved', cause: c };
    } else if ((h.status === 'confirmed-in-live-session' || h.status === 'reconciled-current-target')
        && hasExactFields(h, ['status', 'lastVerified']) && hasExactFields(h.lastVerified, ['source', 'state'])) {
        const o = observed(h.lastVerified.source, h.lastVerified.state, id); if (!o.ok) return o;
        history = { status: h.status, lastVerified: o.value };
    } else return bad('invalid-session');
    return { ok: true, value: { identity: id, lifecycle: input.lifecycle as AdoptionSessionSummary['lifecycle'], observationId: input.observationId, history } };
}
type Classified = { kind: 'positive'; observed: CommittedObservation; evidenceKind: AdoptionProposal['evidenceKind'] }
    | { kind: 'decision'; decision: AdoptionDecision };
const decided = (decision: AdoptionDecision): Checked<Classified> => ({ ok: true, value: { kind: 'decision', decision } });
const positive = (o: CommittedObservation, evidenceKind: AdoptionProposal['evidenceKind']): Checked<Classified> => ({ ok: true, value: { kind: 'positive', observed: o, evidenceKind } });
const readPhases = ['receipt-validation', 'backup-read', 'backup-validation', 'primary-read', 'primary-validation', 'comparison', 'complete'];
const allPhases = [...readPhases, 'backup-write', 'primary-write'];
function context(r: Record<string, unknown>, id: SnapshotIdentity, mr?: MigrationReceipt): boolean {
    const ri = identity(r.identity), rr = ref(r.backupReference);
    return (r.identity === null || ri !== null) && (r.backupReference === null || rr !== null)
        && (ri === null || same(ri, id)) && (!mr || (same(ri, id) && same(rr, reference(mr))));
}
function busy(r: Record<string, unknown>, id: SnapshotIdentity): Checked<Classified> {
    return hasExactFields(r, ['status', 'phase', 'primaryWrite', 'identity', 'backupReference', 'mutationGate', 'cause', 'permittedNextAction'])
        && r.status === 'busy' && r.phase === 'receipt-validation' && r.primaryWrite === 'not-attempted' && context(r, id)
        && (r.mutationGate === 'open' || r.mutationGate === 'blocked') && same(cause(r.cause), { kind: 'coordinator', code: 'busy' })
        && r.permittedNextAction === 'retry-after-active-operation' ? decided(inspect('busy')) : bad();
}
function reconciliation(r: unknown, mr: MigrationReceipt, id: SnapshotIdentity, kind: 'reconciliation' | 'recovery'): Checked<Classified> {
    if (!isPlainDataRecord(r)) return bad(); if (r.status === 'busy') return kind === 'reconciliation' && context(r, id, mr) ? busy(r, id) : bad();
    if (!context(r, id, mr) || !oneOf(r.phase, readPhases) || r.mutationGate !== 'blocked') return bad();
    const common = ['identity', 'backupReference', 'phase', 'mutationGate', 'status', 'primaryWrite', 'observedPrimary', 'cause', 'permittedNextAction'];
    if (r.status === 'already-migrated' || r.status === 'source-confirmed-retained') {
        const target = r.status === 'already-migrated';
        if (!hasExactFields(r, [...common, 'receipt', target ? 'state' : 'sourceState']) || r.phase !== 'complete' || r.cause !== null
            || !context(r, id, mr) || r.primaryWrite !== (target ? 'target-verified' : 'source-confirmed-retained')
            || r.permittedNextAction !== (target ? 'explicit-state-adoption' : 'explicitly-reauthorized-retry')) return bad();
        const nested = receipt(r.receipt, id); if (!nested.ok) return nested;
        if (!same(nested.value, mr)) return bad('source-changed');
        if (target) {
            if (r.observedPrimary !== mr.target) return bad('source-changed');
            const o = observed(r.observedPrimary, r.state, id); if (!o.ok) return o;
            return same(o.value.state, mr.state) ? positive(o.value, kind) : bad('source-changed');
        }
        const v1 = validateGameState(r.sourceState);
        if (!v1.ok) return bad();
        const old = v1.value, meta = mr.state.metadata;
        const matches = old.gameId === id.gameId && old.farmId === id.farmId && old.ownerId === id.ownerId
            && old.logicalTimeMs === mr.state.logicalTimeMs && old.metadata.revision === mr.sourceRevision
            && old.metadata.createdAtLogicalMs === meta.createdAtLogicalMs && old.metadata.updatedAtLogicalMs === meta.updatedAtLogicalMs;
        return r.observedPrimary === mr.source && matches ? decided(inspect('source-retained')) : bad('source-changed');
    }
    if ((r.status !== 'conflict' && r.status !== 'commit-status-unknown') || !hasExactFields(r, common)
        || r.primaryWrite !== 'unknown' || (r.observedPrimary !== null && typeof r.observedPrimary !== 'string')
        || r.permittedNextAction !== (r.status === 'conflict' ? 'operator-review' : 'read-only-reconciliation-or-inspection')) return bad();
    const c = cause(r.cause); return c ? decided(reject(c)) : bad();
}
function classify(e: Record<string, unknown>, id: SnapshotIdentity): Checked<Classified> {
    if (e.kind === 'failure') { const c = cause(e.cause); return hasExactFields(e, ['kind', 'observationId', 'cause']) && c ? decided(reject(c)) : bad(); }
    const fields = ['kind', 'observationId', 'result', ...(e.kind === 'commit' || e.kind === 'reconciliation' ? ['receipt'] : e.kind === 'recovery' ? ['reference'] : [])];
    if (!oneOf(e.kind, ['load', 'commit', 'reconciliation', 'recovery']) || !hasExactFields(e, fields) || !isPlainDataRecord(e.result)) return bad();
    const r = e.result;
    if (e.kind === 'load') {
        if (r.status === 'missing') return hasExactFields(r, ['status']) ? decided(inspect('missing-primary')) : bad();
        if (r.status === 'migration-required') {
            if (!hasExactFields(r, ['status', 'receipt'])) return bad(); const mr = receipt(r.receipt, id);
            return mr.ok ? decided({ status: 'migration-required', receipt: mr.value, mutationPermission: 'blocked' }) : mr;
        }
        if (r.status === 'accepted') {
            if (!hasExactFields(r, ['status', 'source', 'state'])) return bad(); const o = observed(r.source, r.state, id);
            return o.ok ? positive(o.value, 'load') : o;
        }
        const c = cause(r.cause);
        if (r.status === 'rejected' && hasExactFields(r, own.call(r, 'source') ? ['status', 'cause', 'source'] : ['status', 'cause'])
            && (!own.call(r, 'source') || typeof r.source === 'string') && c) return decided(reject(c));
        return r.status === 'storage-error' && hasExactFields(r, ['status', 'cause', 'phase']) && r.phase === 'primary-read'
            && c?.kind === 'storage' ? decided(reject(c)) : bad();
    }
    if (e.kind === 'recovery') {
        const rr = ref(e.reference);
        if (e.reference !== null && !rr) return bad();
        if (r.status === 'busy') return same(ref(r.backupReference), rr) ? busy(r, id) : bad();
        if (r.status === 'recovery-rejected') {
            if (!hasExactFields(r, ['status', 'identity', 'backupReference', 'phase', 'cause', 'primaryWrite', 'mutationGate', 'permittedNextAction'])
                || !context(r, id) || !same(ref(r.backupReference), rr) || !oneOf(r.phase, readPhases)
                || r.primaryWrite !== 'unknown' || r.mutationGate !== 'blocked' || r.permittedNextAction !== 'operator-review-or-correct-reference') return bad();
            const c = cause(r.cause); return c ? decided(reject(c)) : bad();
        }
        if (!rr || !hasExactFields(r, ['status', 'receipt', 'reconciliation', 'mutationGate']) || r.status !== 'receipt-reconstructed' || r.mutationGate !== 'blocked') return bad();
        const mr = receipt(r.receipt, id); if (!mr.ok) return mr;
        return same(rr, reference(mr.value)) ? reconciliation(r.reconciliation, mr.value, id, 'recovery') : bad();
    }
    const mr = receipt(e.receipt, id); if (!mr.ok) return mr;
    if (e.kind === 'reconciliation') return reconciliation(r, mr.value, id, 'reconciliation');
    const common = ['status', 'state', 'phase', 'cause', 'primaryWrite', 'identity', 'backupReference', 'mutationGate'];
    if (!context(r, id, mr.value) || !oneOf(r.phase, allPhases) || (r.mutationGate !== 'blocked' && r.mutationGate !== 'open')) return bad();
    if (r.status === 'committed' || r.status === 'already-migrated') {
        if (!hasExactFields(r, common) || r.phase !== 'complete' || r.cause !== null || r.primaryWrite !== 'target-verified') return bad();
        const o = observed(mr.value.target, r.state, id); return o.ok ? positive(o.value, 'commit') : o;
    }
    if (!hasExactFields(r, common.filter(k => k !== 'state')) || !oneOf(r.status, ['aborted', 'conflict', 'commit-status-unknown'])) return bad();
    const c = cause(r.cause); if (!c) return bad();
    if (r.status === 'aborted') return r.primaryWrite === 'not-attempted' && !oneOf(r.phase, ['primary-write', 'primary-validation', 'complete']) ? decided(inspect('pre-primary-abort', c))
        : r.primaryWrite === 'source-confirmed-retained' && r.mutationGate === 'blocked' ? decided(inspect('source-retained', c)) : bad();
    return (r.primaryWrite === 'not-attempted' || r.primaryWrite === 'unknown') && r.mutationGate === 'blocked' ? decided(reject(c)) : bad();
}

/** Pure consistency decision. Does not prove any captured I/O happened, issue a
 * session handle, change a gate, perform adoption, increment time or allow writes. */
export function evaluateAdoption(sessionSummary: unknown, capturedEvidence: unknown): AdoptionDecision {
    const s = session(sessionSummary); if (!s.ok) return freeze(reject(s.cause));
    if (!isPlainDataRecord(capturedEvidence) || !isGameStateId(capturedEvidence.observationId)) return freeze(reject(code('invalid-evidence')));
    if (capturedEvidence.observationId !== s.value.observationId) return freeze(reject(code('stale-observation')));
    const c = classify(capturedEvidence, s.value.identity); if (!c.ok) return freeze(reject(c.cause));
    // A closed/unresolved policy must not erase an already captured typed failure.
    // It still cannot expose a proposal or restore any mutation permission.
    if (c.value.kind === 'decision' && c.value.decision.status === 'rejected') return freeze(c.value.decision);
    if (s.value.lifecycle !== 'open') return freeze(inspect(s.value.lifecycle === 'closed' ? 'session-closed' : 'session-invalidated'));
    if (s.value.history.status === 'unresolved') return freeze(inspect('unresolved-history', s.value.history.cause));
    if (c.value.kind === 'decision') return freeze(c.value.decision);
    const { observed: o, evidenceKind } = c.value;
    if (s.value.history.status !== 'unestablished') {
        if (o.source !== s.value.history.lastVerified.source || !same(o.state, s.value.history.lastVerified.state)) return freeze(reject(code('source-changed')));
    } else if (evidenceKind === 'load') return freeze(inspect('unestablished-history'));
    return freeze({ status: 'proposal-eligible', identity: { ...s.value.identity }, observationId: s.value.observationId,
        evidenceKind, exactPrimary: o.source, state: o.state, issuanceHistory: s.value.history, mutationPermission: 'read-only' });
}

export function validateAdoptionAuthorization(target: unknown, input: unknown): AdoptionAuthorizationResult {
    const id = identity(target);
    const denied = (c: AdoptionCode): AdoptionAuthorizationResult => freeze({ ok: false, cause: code(c), mutationPermission: 'blocked' });
    if (!id || !hasExactFields(input, ['ownerId', 'approval', 'operatingMode', 'competingWriter']) || input.approval !== 'explicit-adopt-verified-state') return denied('invalid-authorization');
    if (input.ownerId !== id.ownerId) return denied('wrong-owner');
    if (input.operatingMode !== 'local-single-writer') return denied('unsupported-operating-mode');
    if (input.competingWriter !== 'none-known') return denied('competing-writer');
    return freeze({ ok: true, mutationPermission: 'read-only' });
}

/** Reevaluate a previous pure proposal against current caller-captured evidence.
 * No handle/generation ownership or automatic replacement/adoption is implied. */
export function validateAdoptionProposal(proposal: unknown, summary: unknown, evidence: unknown):
    { readonly status: 'retained'; readonly proposal: AdoptionProposal }
    | { readonly status: 'invalidated'; readonly decision: Exclude<AdoptionDecision, AdoptionProposal> } {
    const invalid = (c: AdoptionCause) => freeze({ status: 'invalidated' as const, decision: reject(c) });
    if (!hasExactFields(proposal, ['status', 'identity', 'observationId', 'exactPrimary', 'state', 'evidenceKind', 'mutationPermission', 'issuanceHistory'])
        || proposal.status !== 'proposal-eligible' || proposal.mutationPermission !== 'read-only'
        || !isGameStateId(proposal.observationId) || !oneOf(proposal.evidenceKind, ['load', 'commit', 'reconciliation', 'recovery'])) return invalid(code('invalid-proposal'));
    const id = identity(proposal.identity); if (!id) return invalid(code('invalid-proposal'));
    const o = observed(proposal.exactPrimary, proposal.state, id); if (!o.ok) return invalid(o.cause);
    // Reuse strict history validation/copying. Impossible issuance policies cannot
    // establish a proposal, even when the current capture looks eligible.
    const issued = session({ identity: id, lifecycle: 'open', observationId: proposal.observationId, history: proposal.issuanceHistory });
    if (!issued.ok || issued.value.history.status === 'unresolved') return invalid(code('invalid-proposal'));
    const history = issued.value.history;
    if (history.status === 'unestablished' ? proposal.evidenceKind === 'load'
        : history.lastVerified.source !== o.value.source || !same(history.lastVerified.state, o.value.state)) return invalid(code('invalid-proposal'));
    const next = evaluateAdoption(summary, evidence);
    if (next.status !== 'proposal-eligible') return freeze({ status: 'invalidated', decision: next });
    // A fresh decision may be eligible without retaining an earlier proposal.
    // Any history change requires a separately evaluated proposal rather than
    // retaining the old DTO. Package B owns actual session provenance.
    if (!same(history, next.issuanceHistory)) return invalid(code('policy-changed'));
    if (!same(next.identity, id) || next.observationId !== proposal.observationId || next.exactPrimary !== o.value.source
        || !same(next.state, o.value.state) || next.evidenceKind !== proposal.evidenceKind) return invalid(code('source-changed'));
    return freeze({ status: 'retained', proposal: next });
}
