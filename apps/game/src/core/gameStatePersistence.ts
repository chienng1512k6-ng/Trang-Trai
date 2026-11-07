import { GAME_STATE_SCHEMA_VERSION, isGameStateId, validateGameState, type GameState, type ValidationIssue } from './gameState';

/** Asynchronous raw-string seam; implementations must preserve old data on failed writes. */
export interface SnapshotStorage {
    read(key: string): Promise<string | null>;
    write(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}
export type StorageErrorCode = 'quota-exceeded' | 'storage-unavailable';
export class SnapshotStorageError extends Error {
    constructor(readonly code: StorageErrorCode) { super(code); this.name = 'SnapshotStorageError'; }
}
export type PersistenceErrorCode = StorageErrorCode | 'invalid-state' | 'invalid-identity'
    | 'malformed-json' | 'unsupported-schema' | 'identity-mismatch' | 'invalid-revision'
    | 'revision-mismatch' | 'non-advancing-state';
export interface PersistenceFailure {
    readonly ok: false;
    readonly code: PersistenceErrorCode;
    readonly issues?: readonly ValidationIssue[];
}
export type PersistenceResult<T> = { readonly ok: true; readonly value: T } | PersistenceFailure;
export interface SnapshotIdentity { readonly gameId: string; readonly farmId: string; readonly ownerId: string }
export type SnapshotLoadResult = { readonly ok: true; readonly status: 'missing' }
    | { readonly ok: true; readonly status: 'found'; readonly state: GameState } | PersistenceFailure;
export const SNAPSHOT_NAMESPACE = 'farm-development:game-state:';

export function snapshotKey(identity: SnapshotIdentity): PersistenceResult<string> {
    if (![identity.gameId, identity.farmId, identity.ownerId].every(isGameStateId)) return { ok: false, code: 'invalid-identity' };
    // Encode each component: colons inside IDs cannot collide with delimiters.
    // Schema is deliberately NOT in the key: unsupported snapshots must block overwrites.
    return { ok: true, value: SNAPSHOT_NAMESPACE + [identity.gameId, identity.farmId, identity.ownerId].map(encodeURIComponent).join(':') };
}

export function serializeGameState(input: unknown): PersistenceResult<string> {
    const validated = validateGameState(input);
    return validated.ok ? { ok: true, value: JSON.stringify(validated.value) }
        : { ok: false, code: 'invalid-state', issues: validated.issues };
}
export function deserializeGameState(raw: string): PersistenceResult<GameState> {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { ok: false, code: 'malformed-json' }; }
    if (typeof parsed === 'object' && parsed !== null && 'schemaVersion' in parsed
        && typeof parsed.schemaVersion === 'number' && Number.isSafeInteger(parsed.schemaVersion)
        && parsed.schemaVersion !== GAME_STATE_SCHEMA_VERSION) return { ok: false, code: 'unsupported-schema' };
    const validated = validateGameState(parsed);
    return validated.ok ? validated : { ok: false, code: 'invalid-state', issues: validated.issues };
}

function sameIdentity(a: SnapshotIdentity, b: SnapshotIdentity) {
    return a.gameId === b.gameId && a.farmId === b.farmId && a.ownerId === b.ownerId;
}
function storageFailure(error: unknown): PersistenceFailure {
    return { ok: false, code: error instanceof SnapshotStorageError ? error.code : 'storage-unavailable' };
}

/** Explicit calls only. No autosave, clock, repair, migration, fallback creation or listeners.
 * Read/compare/write is best effort, NOT atomic CAS across tabs/concurrent calls. */
export class GameStatePersistence {
    constructor(private readonly storage: SnapshotStorage) {}
    async load(identity: SnapshotIdentity): Promise<SnapshotLoadResult> {
        const key = snapshotKey(identity);
        if (!key.ok) return key;
        try {
            const raw = await this.storage.read(key.value);
            if (raw === null) return { ok: true, status: 'missing' };
            const decoded = deserializeGameState(raw);
            if (!decoded.ok) return decoded;
            return sameIdentity(identity, decoded.value) ? { ok: true, status: 'found', state: decoded.value }
                : { ok: false, code: 'identity-mismatch' };
        } catch (error) { return storageFailure(error); }
    }
    /** null means create only when absent; number must match stored revision.
     * Revisions/time are produced by domain transitions, never invented by save. */
    async save(input: unknown, expectedRevision: number | null): Promise<PersistenceResult<GameState>> {
        const encoded = serializeGameState(input);
        if (!encoded.ok) return encoded;
        // Snapshot the validated DTO before any await so caller mutations cannot alter the write.
        const decoded = deserializeGameState(encoded.value);
        if (!decoded.ok) return decoded;
        const next = decoded.value;
        if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) return { ok: false, code: 'invalid-revision' };
        const current = await this.load(next);
        if (!current.ok) return current;
        if (current.status === 'missing') {
            if (expectedRevision !== null) return { ok: false, code: 'revision-mismatch' };
        } else {
            if (expectedRevision === null || current.state.metadata.revision !== expectedRevision) return { ok: false, code: 'revision-mismatch' };
            if (expectedRevision === Number.MAX_SAFE_INTEGER || next.metadata.revision !== expectedRevision + 1
                || next.metadata.createdAtLogicalMs !== current.state.metadata.createdAtLogicalMs
                || next.logicalTimeMs < current.state.logicalTimeMs
                || next.metadata.updatedAtLogicalMs < current.state.metadata.updatedAtLogicalMs) return { ok: false, code: 'non-advancing-state' };
        }
        const key = snapshotKey(next);
        if (!key.ok) return key;
        try { await this.storage.write(key.value, encoded.value); return { ok: true, value: next }; }
        catch (error) { return storageFailure(error); }
    }
    /** Destructive only for the exact identity, explicitly requested; no clear-all/reset-on-error. */
    async remove(identity: SnapshotIdentity): Promise<PersistenceResult<undefined>> {
        const key = snapshotKey(identity);
        if (!key.ok) return key;
        try { await this.storage.remove(key.value); return { ok: true, value: undefined }; }
        catch (error) { return storageFailure(error); }
    }
}
