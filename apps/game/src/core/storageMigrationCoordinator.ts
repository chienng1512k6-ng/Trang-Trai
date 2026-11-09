import { validateGameState, type GameState } from './gameState';
import { snapshotKey, SnapshotStorageError, type SnapshotIdentity, type SnapshotStorage, type StorageErrorCode } from './gameStatePersistence';
import { parseVersionedGameState, validateGameStateV2, type GameStateV2, type V2Failure } from './gameStateV2';
import { JSON_LIMITS, parseBoundedJson, type JsonFailure } from './boundedJson';
import { hasExactFields, isPlainDataRecord } from './items';

export interface MigrationReceipt {
    readonly identity: SnapshotIdentity; readonly sourceVersion: 1; readonly sourceRevision: number;
    readonly source: string; readonly state: GameStateV2; readonly target: string;
}
export interface BackupReference { readonly sourceVersion: 1; readonly sourceRevision: number }
export type CoordinatorCode = 'invalid-preparation' | 'backup-missing' | 'backup-conflict' | 'invalid-backup'
    | 'source-changed' | 'target-mismatch' | 'primary-missing' | 'busy' | 'recovery-reference-required'
    | 'invalid-reference' | 'approval-required' | 'forbidden' | 'competing-writer'
    | 'production-coordination-required' | 'reconciliation-required';
export type MigrationCause = { readonly kind: 'storage'; readonly code: StorageErrorCode }
    | { readonly kind: 'validation'; readonly failure: JsonFailure | V2Failure }
    | { readonly kind: 'coordinator'; readonly code: CoordinatorCode; readonly failure?: JsonFailure | V2Failure };
export type MigrationPhase = 'receipt-validation' | 'backup-read' | 'backup-write' | 'backup-validation'
    | 'primary-read' | 'primary-write' | 'primary-validation' | 'comparison' | 'complete';
type ReconciliationPhase = Exclude<MigrationPhase, 'backup-write' | 'primary-write'>;
interface ReconciliationContext {
    readonly identity: SnapshotIdentity | null; readonly backupReference: BackupReference | null;
    readonly phase: ReconciliationPhase; readonly mutationGate: 'blocked';
}
export type SourceRetainedResult = ReconciliationContext & {
    readonly status: 'source-confirmed-retained'; readonly primaryWrite: 'source-confirmed-retained';
    readonly receipt: MigrationReceipt; readonly sourceState: GameState; readonly observedPrimary: string;
    readonly cause: null; readonly permittedNextAction: 'explicitly-reauthorized-retry';
};
export type AlreadyMigratedResult = ReconciliationContext & {
    readonly status: 'already-migrated'; readonly primaryWrite: 'target-verified';
    readonly receipt: MigrationReceipt; readonly state: GameStateV2; readonly observedPrimary: string;
    readonly cause: null; readonly permittedNextAction: 'explicit-state-adoption';
};
export type ReconciliationFailure = ReconciliationContext & {
    readonly primaryWrite: 'unknown'; readonly observedPrimary: string | null; readonly cause: MigrationCause;
} & ({ readonly status: 'conflict'; readonly permittedNextAction: 'operator-review' }
    | { readonly status: 'commit-status-unknown'; readonly permittedNextAction: 'read-only-reconciliation-or-inspection' });
export type ReconciliationResult = SourceRetainedResult | AlreadyMigratedResult | ReconciliationFailure;
/** Refused before reconciliation starts; never a fifth completed outcome. */
export interface MigrationPreflightRefusal {
    readonly status: 'busy'; readonly phase: 'receipt-validation'; readonly primaryWrite: 'not-attempted';
    readonly identity: SnapshotIdentity | null; readonly backupReference: BackupReference | null;
    readonly mutationGate: 'open' | 'blocked'; readonly cause: { readonly kind: 'coordinator'; readonly code: 'busy' };
    readonly permittedNextAction: 'retry-after-active-operation';
}
export type ReconciliationAttemptResult = ReconciliationResult | MigrationPreflightRefusal;
export type RecoveryResult = { readonly status: 'receipt-reconstructed'; readonly receipt: MigrationReceipt;
    readonly reconciliation: ReconciliationResult; readonly mutationGate: 'blocked' }
    | { readonly status: 'recovery-rejected'; readonly identity: SnapshotIdentity | null;
        readonly backupReference: BackupReference | null; readonly phase: ReconciliationPhase;
        readonly cause: MigrationCause; readonly primaryWrite: 'unknown'; readonly mutationGate: 'blocked';
        readonly permittedNextAction: 'operator-review-or-correct-reference' };
export type RecoveryAttemptResult = RecoveryResult | MigrationPreflightRefusal;
export type PreparationResult = { readonly status: 'prepared'; readonly receipt: MigrationReceipt }
    | { readonly status: 'already-v2'; readonly state: GameStateV2; readonly source: string }
    | { readonly status: 'rejected'; readonly cause: MigrationCause };
export type VersionedLoadResult = { readonly status: 'missing' }
    | { readonly status: 'migration-required'; readonly receipt: MigrationReceipt }
    | { readonly status: 'accepted'; readonly state: GameStateV2; readonly source: string }
    | { readonly status: 'rejected'; readonly cause: MigrationCause; readonly source?: string }
    | { readonly status: 'storage-error'; readonly cause: Extract<MigrationCause, { kind: 'storage' }>; readonly phase: 'primary-read' };
interface CommitContext {
    readonly phase: MigrationPhase; readonly mutationGate: 'open' | 'blocked';
    readonly identity: SnapshotIdentity | null; readonly backupReference: BackupReference | null;
}
export type MigrationCommitResult = CommitContext & (
    { readonly status: 'committed' | 'already-migrated'; readonly primaryWrite: 'target-verified'; readonly state: GameStateV2; readonly cause: null }
    | { readonly status: 'aborted'; readonly primaryWrite: 'not-attempted' | 'source-confirmed-retained'; readonly cause: MigrationCause }
    | { readonly status: 'conflict' | 'commit-status-unknown'; readonly primaryWrite: 'not-attempted' | 'unknown'; readonly cause: MigrationCause });
export interface MigrationAuthorization {
    readonly ownerId: string; readonly approval: 'explicit-v1-to-v2';
    readonly operatingMode: 'local-single-writer'; readonly competingWriter: 'none-known' | 'known-or-suspected';
}
const coordinatorCause = (code: CoordinatorCode, failure?: JsonFailure | V2Failure): MigrationCause =>
    ({ kind: 'coordinator', code, ...(failure ? { failure } : {}) });
const validationCause = (failure: JsonFailure | V2Failure): MigrationCause => ({ kind: 'validation', failure });
const storageCause = (error: unknown): Extract<MigrationCause, { kind: 'storage' }> =>
    ({ kind: 'storage', code: error instanceof SnapshotStorageError ? error.code : 'storage-unavailable' });
function identityData(input: unknown): SnapshotIdentity | null {
    if (!hasExactFields(input, ['gameId', 'farmId', 'ownerId'])) return null;
    const id = input as unknown as SnapshotIdentity;
    return snapshotKey(id).ok ? { gameId: id.gameId, farmId: id.farmId, ownerId: id.ownerId } : null;
}
const invalidIdentity = (): MigrationCause => validationCause({ ok: false, code: 'invalid-identity' });
function referenceData(input: unknown): BackupReference | null {
    return hasExactFields(input, ['sourceVersion', 'sourceRevision']) && input.sourceVersion === 1
        && typeof input.sourceRevision === 'number' && Number.isSafeInteger(input.sourceRevision)
        && input.sourceRevision >= 0 && input.sourceRevision < Number.MAX_SAFE_INTEGER
        ? { sourceVersion: 1, sourceRevision: input.sourceRevision } : null;
}
function primaryKey(identity: SnapshotIdentity): string {
    const key = snapshotKey(identity); if (!key.ok) throw new Error('Internal validated identity required.'); return key.value;
}
function backupKey(receipt: Pick<MigrationReceipt, 'identity' | 'sourceRevision'>): string {
    return 'farm-development:game-state-backup:' + [receipt.identity.gameId, receipt.identity.farmId, receipt.identity.ownerId]
        .map(encodeURIComponent).join(':') + ':v1:r' + receipt.sourceRevision;
}
const reference = (receipt: MigrationReceipt): BackupReference => ({ sourceVersion: 1, sourceRevision: receipt.sourceRevision });
/** Pure preparation; never touches a storage instance. */
export function prepareMigration(source: string, identity: unknown): PreparationResult {
    const id = identityData(identity);
    if (!id) return { status: 'rejected', cause: invalidIdentity() };
    const result = parseVersionedGameState(source, id);
    if (!result.ok) return { status: 'rejected', cause: validationCause(result) };
    if (result.status === 'accepted') return { status: 'already-v2', state: result.state, source };
    return { status: 'prepared', receipt: { identity: id, sourceVersion: 1, sourceRevision: result.sourceRevision,
        source, state: result.state, target: result.target } };
}
/** Validate/rederive before any await. Only bounded domain DTOs are stringified. */
function captureReceipt(input: unknown): PreparationResult {
    const reject = (failure?: JsonFailure | V2Failure): PreparationResult => ({ status: 'rejected', cause: coordinatorCause('invalid-preparation', failure) });
    if (!hasExactFields(input, ['identity', 'sourceVersion', 'sourceRevision', 'source', 'state', 'target'])
        || typeof input.source !== 'string' || typeof input.target !== 'string' || input.target.length > JSON_LIMITS.input
        || !referenceData({ sourceVersion: input.sourceVersion, sourceRevision: input.sourceRevision })) return reject();
    const derived = prepareMigration(input.source, input.identity);
    if (derived.status !== 'prepared') return reject(derived.status === 'rejected' && derived.cause.kind === 'validation' ? derived.cause.failure : undefined);
    const candidate = validateGameStateV2(input.state), target = parseVersionedGameState(input.target, derived.receipt.identity);
    if (!candidate.ok) return reject(candidate);
    if (!target.ok) return reject(target);
    if (target.status !== 'accepted' || input.sourceRevision !== derived.receipt.sourceRevision
        || input.target !== derived.receipt.target || JSON.stringify(candidate.value) !== JSON.stringify(derived.receipt.state)
        || JSON.stringify(target.state) !== JSON.stringify(derived.receipt.state)) return reject();
    return derived;
}
type Gate = { active: boolean; blocked: boolean; generation: number; retry?: { source: string; target: string } };
/** Local bounds, not origin-wide coordination or durable state. Entries are never
 * evicted to bypass a blocked identity. Exhaustion returns busy without I/O. */
export const MAX_COORDINATOR_IDENTITIES = 128;
export class StorageMigrationCoordinator {
    readonly #gates = new Map<string, Gate>();
    constructor(private readonly storage: SnapshotStorage) {}
    #gate(id: SnapshotIdentity): Gate | null {
        const key = primaryKey(id), existing = this.#gates.get(key);
        if (existing) return existing;
        if (this.#gates.size >= MAX_COORDINATOR_IDENTITIES) return null;
        const gate: Gate = { active: false, blocked: false, generation: 0 };
        this.#gates.set(key, gate); return gate;
    }
    #block(gate: Gate) { gate.blocked = true; gate.generation++; delete gate.retry; }
    #busy(id: SnapshotIdentity | null, ref: BackupReference | null, gate: Gate | null): MigrationPreflightRefusal {
        return { status: 'busy', identity: id, backupReference: ref, phase: 'receipt-validation', primaryWrite: 'not-attempted',
            mutationGate: !gate || gate.blocked ? 'blocked' : 'open', cause: { kind: 'coordinator', code: 'busy' },
            permittedNextAction: 'retry-after-active-operation' };
    }
    async load(identity: unknown): Promise<VersionedLoadResult> {
        const id = identityData(identity);
        if (!id) return { status: 'rejected', cause: invalidIdentity() };
        const gate = this.#gate(id);
        if (!gate || gate.active) return { status: 'rejected', cause: coordinatorCause('busy') };
        gate.active = true;
        try {
            const source = await this.storage.read(primaryKey(id));
            if (source === null) return { status: 'missing' };
            const result = prepareMigration(source, id);
            if (result.status === 'prepared') return { status: 'migration-required', receipt: result.receipt };
            if (result.status === 'already-v2') return { status: 'accepted', state: result.state, source };
            return { ...result, source };
        } catch (error) { return { status: 'storage-error', phase: 'primary-read', cause: storageCause(error) }; }
        finally { gate.active = false; }
    }
    #failure(receipt: MigrationReceipt | null, phase: ReconciliationPhase, cause: MigrationCause,
        status: 'conflict' | 'commit-status-unknown' = 'commit-status-unknown', observedPrimary: string | null = null): ReconciliationFailure {
        const common = { identity: receipt?.identity ?? null, backupReference: receipt ? reference(receipt) : null,
            phase, cause, primaryWrite: 'unknown' as const, mutationGate: 'blocked' as const, observedPrimary };
        return status === 'conflict' ? { ...common, status, permittedNextAction: 'operator-review' }
            : { ...common, status, permittedNextAction: 'read-only-reconciliation-or-inspection' };
    }
    #backup(source: string | null, receipt: MigrationReceipt): MigrationCause | null {
        if (source === null) return coordinatorCause('backup-missing');
        const result = prepareMigration(source, receipt.identity);
        if (result.status === 'rejected') return result.cause;
        if (result.status !== 'prepared' || result.receipt.sourceRevision !== receipt.sourceRevision) return coordinatorCause('invalid-backup');
        return source === receipt.source ? null : coordinatorCause('backup-conflict');
    }
    #primary(source: string | null, receipt: MigrationReceipt): ReconciliationResult {
        if (source === null) return this.#failure(receipt, 'primary-validation', coordinatorCause('primary-missing'));
        const parsed = parseVersionedGameState(source, receipt.identity);
        if (!parsed.ok && parsed.code === 'revision-overflow') {
            // Preparation eligibility is narrower than v1 validity. Reuse the
            // bounded lexical gate before independently validating this observation.
            const raw = parseBoundedJson(source);
            const legacy = raw.ok ? validateGameState(raw.value) : null;
            if (legacy?.ok && legacy.value.metadata.revision === Number.MAX_SAFE_INTEGER) {
                const same = legacy.value.gameId === receipt.identity.gameId && legacy.value.farmId === receipt.identity.farmId
                    && legacy.value.ownerId === receipt.identity.ownerId;
                if (!same) return this.#failure(receipt, 'primary-validation', validationCause({ ok: false, code: 'identity-mismatch' }), 'commit-status-unknown', source);
                if (source !== receipt.source) return this.#failure(receipt, 'comparison', coordinatorCause('source-changed', parsed), 'conflict', source);
            }
        }
        if (!parsed.ok) return this.#failure(receipt, 'primary-validation', validationCause(parsed),
            parsed.code === 'unsupported-schema' || parsed.code === 'incompatible-registry' ? 'conflict' : 'commit-status-unknown', source);
        const common = { identity: receipt.identity, backupReference: reference(receipt), phase: 'complete' as const,
            mutationGate: 'blocked' as const, receipt, observedPrimary: source, cause: null };
        if (source === receipt.source && parsed.status === 'migration-required') {
            return { ...common, status: 'source-confirmed-retained', primaryWrite: 'source-confirmed-retained',
                sourceState: validateSource(receipt), permittedNextAction: 'explicitly-reauthorized-retry' };
        }
        if (source === receipt.target && parsed.status === 'accepted' && JSON.stringify(parsed.state) === JSON.stringify(receipt.state)) {
            return { ...common, status: 'already-migrated', primaryWrite: 'target-verified', state: parsed.state,
                permittedNextAction: 'explicit-state-adoption' };
        }
        return this.#failure(receipt, 'comparison', coordinatorCause(parsed.status === 'accepted' ? 'target-mismatch' : 'source-changed'), 'conflict', source);
    }
    async #observe(receipt: MigrationReceipt): Promise<ReconciliationResult> {
        let phase: ReconciliationPhase = 'backup-read';
        try {
            const backup = await this.storage.read(backupKey(receipt)); phase = 'backup-validation';
            const cause = this.#backup(backup, receipt);
            if (cause) return this.#failure(receipt, phase, cause, cause.kind === 'coordinator' && cause.code === 'backup-conflict' ? 'conflict' : 'commit-status-unknown');
            phase = 'primary-read'; return this.#primary(await this.storage.read(primaryKey(receipt.identity)), receipt);
        } catch (error) { return this.#failure(receipt, phase, storageCause(error)); }
    }
    #remember(result: ReconciliationResult, gate: Gate, generation: number) {
        if (result.status === 'source-confirmed-retained' && gate.generation === generation) {
            gate.retry = { source: result.receipt.source, target: result.receipt.target };
        }
    }
    async reconcile(input: unknown): Promise<ReconciliationAttemptResult> {
        const captured = captureReceipt(input);
        if (captured.status !== 'prepared') {
            const id = isPlainDataRecord(input) ? identityData(input.identity) : null;
            const gate = id ? this.#gate(id) : null;
            const ref = isPlainDataRecord(input) ? referenceData({ sourceVersion: input.sourceVersion, sourceRevision: input.sourceRevision }) : null;
            if (id && (!gate || gate.active)) return this.#busy(id, ref, gate);
            if (gate) this.#block(gate);
            return { ...this.#failure(null, 'receipt-validation', captured.status === 'rejected' ? captured.cause : coordinatorCause('invalid-preparation')),
                identity: id, backupReference: ref };
        }
        const receipt = captured.receipt, gate = this.#gate(receipt.identity);
        if (!gate || gate.active) return this.#busy(receipt.identity, reference(receipt), gate);
        gate.active = true; this.#block(gate); const generation = gate.generation;
        try { const result = await this.#observe(receipt); this.#remember(result, gate, generation); return result; }
        finally { gate.active = false; }
    }
    #retry(input: unknown, receipt: MigrationReceipt, gate: Gate): boolean {
        if (!gate.retry || gate.retry.source !== receipt.source || gate.retry.target !== receipt.target
            || !hasExactFields(input, ['identity', 'backupReference', 'phase', 'mutationGate', 'status', 'primaryWrite',
                'receipt', 'sourceState', 'observedPrimary', 'cause', 'permittedNextAction'])) return false;
        const prepared = captureReceipt(input.receipt), source = validateGameState(input.sourceState);
        return prepared.status === 'prepared' && source.ok && input.status === 'source-confirmed-retained'
            && input.phase === 'complete' && input.mutationGate === 'blocked' && input.primaryWrite === 'source-confirmed-retained'
            && input.permittedNextAction === 'explicitly-reauthorized-retry' && input.cause === null
            && input.observedPrimary === receipt.source && JSON.stringify(source.value) === JSON.stringify(validateSource(receipt))
            && JSON.stringify(identityData(input.identity)) === JSON.stringify(receipt.identity)
            && JSON.stringify(referenceData(input.backupReference)) === JSON.stringify(reference(receipt))
            && prepared.receipt.source === receipt.source && prepared.receipt.target === receipt.target;
    }
    async commit(input: unknown, authorization: unknown, retryResolution?: unknown): Promise<MigrationCommitResult> {
        const captured = captureReceipt(input);
        let receipt: MigrationReceipt | null = captured.status === 'prepared' ? captured.receipt : null;
        let phase: MigrationPhase = 'receipt-validation', disposition: 'not-attempted' | 'unknown' = 'not-attempted';
        // Consult existing bookkeeping only: reporting a rejected authorization
        // must not allocate, clear, block or otherwise change a gate.
        const id = receipt?.identity ?? (isPlainDataRecord(input) ? identityData(input.identity) : null);
        let gate: Gate | null = id ? this.#gates.get(primaryKey(id)) ?? null : null;
        const fail = (cause: MigrationCause, status: 'aborted' | 'conflict' | 'commit-status-unknown' = 'aborted'): MigrationCommitResult => {
            if (gate && status !== 'aborted') this.#block(gate);
            const base = { phase, cause, identity: id, backupReference: receipt ? reference(receipt) : null,
                mutationGate: !id || gate?.blocked ? 'blocked' as const : 'open' as const };
            return status === 'aborted' ? { ...base, status, primaryWrite: 'not-attempted' } : { ...base, status, primaryWrite: disposition };
        };
        if (!receipt) return fail(captured.status === 'rejected' ? captured.cause : coordinatorCause('invalid-preparation'));
        // Keep a nonnullable local capture across awaits; caller mutations cannot change it.
        const stable = receipt; receipt = stable;
        if (!hasExactFields(authorization, ['ownerId', 'approval', 'operatingMode', 'competingWriter'])
            || authorization.approval !== 'explicit-v1-to-v2') return fail(coordinatorCause('approval-required'));
        if (authorization.ownerId !== receipt.identity.ownerId) return fail(coordinatorCause('forbidden'));
        if (authorization.operatingMode !== 'local-single-writer') return fail(coordinatorCause('production-coordination-required'));
        if (authorization.competingWriter !== 'none-known') return fail(coordinatorCause('competing-writer'));
        gate = this.#gate(receipt.identity);
        if (!gate || gate.active) return fail(coordinatorCause('busy'));
        if (gate.blocked && !this.#retry(retryResolution, receipt, gate)) return fail(coordinatorCause('reconciliation-required'));
        gate.active = true; const generation = gate.generation; delete gate.retry;
        const verified = (state: GameStateV2, status: 'committed' | 'already-migrated'): MigrationCommitResult => {
            if (gate!.generation === generation) gate!.blocked = false;
            return { status, state, phase: 'complete', cause: null, primaryWrite: 'target-verified', identity: stable.identity,
                backupReference: reference(stable), mutationGate: gate!.blocked ? 'blocked' : 'open' };
        };
        try {
            phase = 'backup-read'; const key = backupKey(stable), backup = await this.storage.read(key);
            if (backup !== null && backup !== stable.source) return fail(coordinatorCause('backup-conflict'), 'conflict');
            if (backup === null) { phase = 'backup-write'; await this.storage.write(key, stable.source); }
            phase = 'backup-read'; const readback = await this.storage.read(key); phase = 'backup-validation';
            const backupFailure = this.#backup(readback, stable);
            if (backupFailure) return fail(backupFailure, backupFailure.kind === 'coordinator' && backupFailure.code === 'backup-conflict' ? 'conflict' : 'aborted');
            phase = 'primary-read'; const current = await this.storage.read(primaryKey(stable.identity));
            if (current === stable.target) {
                const result = this.#primary(current, stable);
                if (result.status === 'already-migrated') return verified(result.state, 'already-migrated');
                return fail(result.cause ?? coordinatorCause('target-mismatch'), 'conflict');
            }
            if (current !== stable.source) {
                const parsed = current === null ? null : parseVersionedGameState(current, stable.identity);
                return fail(coordinatorCause('source-changed', parsed && !parsed.ok ? parsed : undefined), 'conflict');
            }
            phase = 'primary-write'; disposition = 'unknown'; await this.storage.write(primaryKey(stable.identity), stable.target);
            phase = 'primary-read'; const after = await this.storage.read(primaryKey(stable.identity)); phase = 'primary-validation';
            const result = this.#primary(after, stable);
            if (result.status === 'already-migrated') return verified(result.state, 'committed');
            this.#block(gate); this.#remember(result, gate, gate.generation);
            if (result.status === 'source-confirmed-retained') return { status: 'aborted', phase, cause: coordinatorCause('target-mismatch'),
                primaryWrite: 'source-confirmed-retained', identity: stable.identity, backupReference: reference(stable), mutationGate: 'blocked' };
            return fail(result.cause, result.status);
        } catch (error) {
            const cause = storageCause(error);
            if (disposition === 'not-attempted') return fail(cause);
            this.#block(gate);
            const observed = await this.#observe(stable); this.#remember(observed, gate, gate.generation);
            if (observed.status === 'already-migrated') return { ...verified(observed.state, 'already-migrated'), mutationGate: 'blocked' };
            if (observed.status === 'source-confirmed-retained') return { status: 'aborted', phase, cause, primaryWrite: 'source-confirmed-retained',
                identity: stable.identity, backupReference: reference(stable), mutationGate: 'blocked' };
            phase = observed.phase; return fail(observed.cause, observed.status);
        } finally { gate.active = false; }
    }
    async inspectRecovery(identity: unknown, backupReference?: unknown): Promise<RecoveryAttemptResult> {
        const id = identityData(identity), ref = referenceData(backupReference);
        let phase: ReconciliationPhase = 'receipt-validation';
        const rejected = (cause: MigrationCause): RecoveryResult => ({ status: 'recovery-rejected', identity: id, backupReference: ref,
            phase, cause, primaryWrite: 'unknown', mutationGate: 'blocked', permittedNextAction: 'operator-review-or-correct-reference' });
        if (!id) return rejected(invalidIdentity());
        const gate = this.#gate(id);
        if (!gate || gate.active) return this.#busy(id, ref, gate);
        this.#block(gate);
        if (!ref) return rejected(coordinatorCause(backupReference === undefined ? 'recovery-reference-required' : 'invalid-reference'));
        gate.active = true; const generation = gate.generation;
        try {
            phase = 'backup-read'; const raw = await this.storage.read(backupKey({ identity: id, sourceRevision: ref.sourceRevision }));
            if (raw === null) return rejected(coordinatorCause('backup-missing'));
            phase = 'backup-validation'; const prepared = prepareMigration(raw, id);
            if (prepared.status === 'rejected') return rejected(prepared.cause);
            if (prepared.status !== 'prepared' || prepared.receipt.sourceRevision !== ref.sourceRevision) return rejected(coordinatorCause('invalid-backup'));
            const receipt = prepared.receipt;
            let result: ReconciliationResult;
            try { phase = 'primary-read'; result = this.#primary(await this.storage.read(primaryKey(id)), receipt); }
            catch (error) { result = this.#failure(receipt, phase, storageCause(error)); }
            this.#remember(result, gate, generation);
            return { status: 'receipt-reconstructed', receipt, reconciliation: result, mutationGate: 'blocked' };
        } catch (error) { return rejected(storageCause(error)); }
        finally { gate.active = false; }
    }
}
/** Projection from a rederived receipt preserves all v1 fields; no second parser. */
function validateSource(receipt: MigrationReceipt): GameState {
    const state = validateGameState({ schemaVersion: 1, ...receipt.identity, logicalTimeMs: receipt.state.logicalTimeMs,
        metadata: { ...receipt.state.metadata, revision: receipt.sourceRevision } });
    if (!state.ok) throw new Error('Internal v1 invariant.'); return state.value;
}
