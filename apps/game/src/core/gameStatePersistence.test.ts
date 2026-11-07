import { describe, expect, it } from 'vitest';
import { advanceLogicalTime, type GameState } from './gameState';
import { deserializeGameState, GameStatePersistence, serializeGameState, snapshotKey, type SnapshotStorage } from './gameStatePersistence';
import { InMemorySnapshotStorage } from '../storage/InMemorySnapshotStorage';
import { BrowserLocalStorageAdapter, type LocalStorageLike } from '../storage/BrowserLocalStorageAdapter';

const initial = (): GameState => ({ schemaVersion: 1, gameId: 'game:one', farmId: 'farm-1', ownerId: 'owner-1',
    logicalTimeMs: 100, metadata: { revision: 0, createdAtLogicalMs: 0, updatedAtLogicalMs: 100 } });
function nextState(time = 200) {
    const state = initial();
    const result = advanceLogicalTime(state, { schemaVersion: 1, type: 'advance-logical-time', operationId: 'op-1',
        gameId: state.gameId, farmId: state.farmId, expectedRevision: 0 }, { ownerId: state.ownerId, logicalTimeMs: time });
    if (!result.ok) throw new Error('Fixture transition failed');
    return result.state;
}
function key(state = initial()) {
    const result = snapshotKey(state); if (!result.ok) throw new Error('Fixture identity failed'); return result.value;
}
class StorageMock implements LocalStorageLike {
    readonly values = new Map<string, string>();
    fail?: 'read' | 'write' | 'remove';
    errorName = 'SecurityError';
    private check(operation: typeof this.fail) {
        if (this.fail === operation) { const error = new Error('storage operation failed'); error.name = this.errorName; throw error; }
    }
    getItem(key: string) { this.check('read'); return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.check('write'); this.values.set(key, value); }
    removeItem(key: string) { this.check('remove'); this.values.delete(key); }
}
const adapters: [string, () => SnapshotStorage][] = [
    ['in-memory', () => new InMemorySnapshotStorage()],
    ['browser mock', () => { const mock = new StorageMock(); return new BrowserLocalStorageAdapter(() => mock); }],
];

describe('GameState serialization boundary', () => {
    it('round-trips exact persistent fields and logical times without wall-clock updates', () => {
        const state = Object.freeze({ ...initial(), metadata: Object.freeze(initial().metadata) });
        const encoded = serializeGameState(state);
        if (!encoded.ok) throw new Error('Expected success');
        expect(JSON.parse(encoded.value)).toEqual(state);
        expect(deserializeGameState(encoded.value)).toEqual({ ok: true, value: state });
        expect(serializeGameState(state)).toEqual(encoded);
    });
    it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses invalid numeric state %s', value => {
        for (const input of [{ ...initial(), logicalTimeMs: value },
            { ...initial(), metadata: { ...initial().metadata, revision: value } }]) {
            expect(serializeGameState(input)).toMatchObject({ ok: false, code: 'invalid-state' });
        }
    });
    it('rejects runtime/renderer data instead of dropping it silently', () => {
        for (const extra of [{ sprite: {} }, { camera: {} }, { combat: { hp: 5 } }, { secret: 'not-a-real-token' }]) {
            expect(serializeGameState({ ...initial(), ...extra })).toMatchObject({ ok: false, code: 'invalid-state' });
        }
    });
    it.each(['{', '', 'undefined', '{"logicalTimeMs":NaN}'])('identifies malformed JSON %s', raw => {
        expect(deserializeGameState(raw)).toEqual({ ok: false, code: 'malformed-json' });
    });
    it.each([0, 2, 99])('identifies unsupported schema %s explicitly', schemaVersion => {
        expect(deserializeGameState(JSON.stringify({ ...initial(), schemaVersion }))).toEqual({ ok: false, code: 'unsupported-schema' });
    });
    it.each(['null', '[]', '{}', '{"schemaVersion":"1"}', JSON.stringify({ ...initial(), ownerId: ' ' }),
        JSON.stringify(initial()).replace('"logicalTimeMs":100', '"logicalTimeMs":1e999')])('rejects parsed invalid state %s', raw => {
        expect(deserializeGameState(raw)).toMatchObject({ ok: false, code: 'invalid-state' });
    });
    it('imports the domain and both adapters in Node without browser globals or Phaser mocks', () => {
        expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
        let providerCalls = 0;
        new BrowserLocalStorageAdapter(() => { providerCalls++; throw new Error('unavailable'); });
        expect(providerCalls).toBe(0);
    });
});

describe.each(adapters)('%s persistence adapter', (_name, createStorage) => {
    it('distinguishes missing, saves and reloads through a new service without aliasing caller state', async () => {
        const storage = createStorage(), persistence = new GameStatePersistence(storage);
        expect(await persistence.load(initial())).toEqual({ ok: true, status: 'missing' });
        const input = initial();
        const saved = await persistence.save(input, null);
        expect(saved).toEqual({ ok: true, value: initial() });
        expect(await new GameStatePersistence(storage).load(input)).toEqual({ ok: true, status: 'found', state: initial() });
        Object.assign(input.metadata, { revision: 99 });
        expect(await persistence.load(initial())).toEqual({ ok: true, status: 'found', state: initial() });
    });
    it('separates game, farm and owner identities including delimiter characters', async () => {
        const persistence = new GameStatePersistence(createStorage());
        const states = [initial(), { ...initial(), gameId: 'other-game' }, { ...initial(), farmId: 'other-farm' },
            { ...initial(), ownerId: 'other-owner' }, { ...initial(), gameId: 'a:b', farmId: 'c' },
            { ...initial(), gameId: 'a', farmId: 'b:c' }];
        expect(new Set(states.map(s => key(s))).size).toBe(states.length);
        for (const state of states) expect((await persistence.save(state, null)).ok).toBe(true);
        for (const state of states) expect(await persistence.load(state)).toEqual({ ok: true, status: 'found', state });
    });
    it('checks expected revision and persists the domain-produced next revision without changing time', async () => {
        const persistence = new GameStatePersistence(createStorage());
        expect(await persistence.save(initial(), 0)).toEqual({ ok: false, code: 'revision-mismatch' });
        await persistence.save(initial(), null);
        expect(await persistence.save(nextState(), null)).toEqual({ ok: false, code: 'revision-mismatch' });
        expect(await persistence.save(nextState(), 1)).toEqual({ ok: false, code: 'revision-mismatch' });
        expect(await persistence.save(nextState(), 0)).toEqual({ ok: true, value: nextState() });
        expect(await persistence.save(nextState(), 0)).toEqual({ ok: false, code: 'revision-mismatch' });
        expect(await persistence.load(initial())).toEqual({ ok: true, status: 'found', state: nextState() });
    });
    it('rejects rollback, unchanged/skipped revision and changed creation epoch without overwriting', async () => {
        const storage = createStorage(), persistence = new GameStatePersistence(storage);
        await persistence.save(initial(), null);
        for (const state of [initial(), { ...nextState(), metadata: { ...nextState().metadata, revision: 2 } },
            { ...nextState(), logicalTimeMs: 99, metadata: { ...nextState().metadata, updatedAtLogicalMs: 99 } },
            { ...nextState(), metadata: { ...nextState().metadata, updatedAtLogicalMs: 99 } },
            { ...nextState(), metadata: { ...nextState().metadata, createdAtLogicalMs: 1 } }]) {
            expect(await persistence.save(state, 0)).toEqual({ ok: false, code: 'non-advancing-state' });
        }
        expect(await storage.read(key())).toBe(JSON.stringify(initial()));
    });
    it('refuses invalid save/revision arguments and preserves existing bytes', async () => {
        const storage = createStorage(), persistence = new GameStatePersistence(storage);
        await persistence.save(initial(), null);
        expect(await persistence.save({ ...initial(), logicalTimeMs: NaN }, 0)).toMatchObject({ ok: false, code: 'invalid-state' });
        for (const revision of [-1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
            expect(await persistence.save(nextState(), revision)).toEqual({ ok: false, code: 'invalid-revision' });
        }
        expect(await storage.read(key())).toBe(JSON.stringify(initial()));
    });
    it('never deletes or overwrites corrupt, unsupported or wrong-identity snapshots on load/save', async () => {
        const storage = createStorage(), persistence = new GameStatePersistence(storage);
        const cases = [['{broken', 'malformed-json'], [JSON.stringify({ ...initial(), schemaVersion: 2 }), 'unsupported-schema'],
            [JSON.stringify({ ...initial(), logicalTimeMs: -1 }), 'invalid-state'],
            [JSON.stringify({ ...initial(), farmId: 'another-farm' }), 'identity-mismatch']];
        for (const [raw, code] of cases) {
            await storage.write(key(), raw);
            expect(await persistence.load(initial())).toMatchObject({ ok: false, code });
            for (const expected of [null, 0]) expect(await persistence.save(nextState(), expected)).toMatchObject({ ok: false, code });
            expect(await storage.read(key())).toBe(raw);
        }
    });
    it('removes only the explicitly selected key, even if corrupt, and leaves other apps/identities intact', async () => {
        const storage = createStorage(), persistence = new GameStatePersistence(storage);
        const other = { ...initial(), gameId: 'another' };
        await persistence.save(other, null); await storage.write(key(), '{broken'); await storage.write('other-app', 'keep');
        expect(await persistence.remove(initial())).toEqual({ ok: true, value: undefined });
        expect(await persistence.load(initial())).toEqual({ ok: true, status: 'missing' });
        expect(await persistence.load(other)).toEqual({ ok: true, status: 'found', state: other });
        expect(await storage.read('other-app')).toBe('keep');
        expect((await persistence.remove(initial())).ok).toBe(true);
    });
    it('rejects invalid identities without reading/removing any valid snapshot', async () => {
        const storage = createStorage(), persistence = new GameStatePersistence(storage);
        await persistence.save(initial(), null);
        for (const field of ['gameId', 'farmId', 'ownerId']) {
            const bad = { ...initial(), [field]: '../outside' };
            expect(await persistence.load(bad)).toEqual({ ok: false, code: 'invalid-identity' });
            expect(await persistence.remove(bad)).toEqual({ ok: false, code: 'invalid-identity' });
        }
        expect(await storage.read(key())).toBe(JSON.stringify(initial()));
    });
});

describe('storage failures and documented concurrency limits', () => {
    it.each(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED', 'SecurityError'])('reports %s without deleting prior snapshot', async errorName => {
        const mock = new StorageMock();
        const persistence = new GameStatePersistence(new BrowserLocalStorageAdapter(() => mock));
        await persistence.save(initial(), null); mock.fail = 'write'; mock.errorName = errorName;
        expect(await persistence.save(nextState(), 0)).toEqual({ ok: false,
            code: errorName === 'SecurityError' ? 'storage-unavailable' : 'quota-exceeded' });
        expect(mock.values.get(key())).toBe(JSON.stringify(initial()));
    });
    it('catches unavailable storage acquisition and per-operation read/remove errors', async () => {
        const unavailable = new GameStatePersistence(new BrowserLocalStorageAdapter(() => { throw new Error('Access denied'); }));
        expect(await unavailable.load(initial())).toEqual({ ok: false, code: 'storage-unavailable' });
        expect(await unavailable.save(initial(), null)).toEqual({ ok: false, code: 'storage-unavailable' });
        expect(await unavailable.remove(initial())).toEqual({ ok: false, code: 'storage-unavailable' });
        const mock = new StorageMock(); const persistence = new GameStatePersistence(new BrowserLocalStorageAdapter(() => mock));
        await persistence.save(initial(), null);
        mock.fail = 'read'; expect(await persistence.load(initial())).toEqual({ ok: false, code: 'storage-unavailable' });
        expect(await persistence.save(nextState(), 0)).toEqual({ ok: false, code: 'storage-unavailable' });
        mock.fail = 'remove'; expect(await persistence.remove(initial())).toEqual({ ok: false, code: 'storage-unavailable' });
        expect(mock.values.get(key())).toBe(JSON.stringify(initial()));
    });
    it('normalizes rejected asynchronous adapters and leaves state creation to the caller', async () => {
        const failure = () => Promise.reject(new Error('adapter failure'));
        const persistence = new GameStatePersistence({ read: failure, write: failure, remove: failure });
        expect(await persistence.load(initial())).toEqual({ ok: false, code: 'storage-unavailable' });
        expect(await persistence.save(initial(), null)).toEqual({ ok: false, code: 'storage-unavailable' });
        expect(await persistence.remove(initial())).toEqual({ ok: false, code: 'storage-unavailable' });
    });
    it('has isolated in-memory instances and captures input before awaiting a write', async () => {
        const storage = new InMemorySnapshotStorage(); const persistence = new GameStatePersistence(storage);
        const input = initial(); const saving = persistence.save(input, null);
        Object.assign(input, { logicalTimeMs: -1 }); Object.assign(input.metadata, { revision: -1 });
        expect(await saving).toEqual({ ok: true, value: initial() });
        expect(await new GameStatePersistence(new InMemorySnapshotStorage()).load(initial())).toEqual({ ok: true, status: 'missing' });
    });
    it('does not pretend read/compare/write provides concurrent CAS', async () => {
        const storage = new InMemorySnapshotStorage(); const a = new GameStatePersistence(storage), b = new GameStatePersistence(storage);
        await a.save(initial(), null);
        const results = await Promise.all([a.save(nextState(200), 0), b.save(nextState(300), 0)]);
        expect(results.every(result => result.ok)).toBe(true); // Both may read revision 0 before either writes.
        const loaded = await a.load(initial());
        expect(loaded).toMatchObject({ ok: true, status: 'found', state: { metadata: { revision: 1 } } });
    });
});
