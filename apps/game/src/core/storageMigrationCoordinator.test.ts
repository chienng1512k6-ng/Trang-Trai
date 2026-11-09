import { afterEach, describe, expect, it } from 'vitest';
import { InMemorySnapshotStorage } from '../storage/InMemorySnapshotStorage';
import { SnapshotStorageError, snapshotKey, deserializeGameState, type SnapshotStorage } from './gameStatePersistence';
import { applyAggregateInventoryCommand, type GameStateV2 } from './gameStateV2';
import { MAX_COORDINATOR_IDENTITIES, prepareMigration, StorageMigrationCoordinator,
    type MigrationReceipt, type ReconciliationResult } from './storageMigrationCoordinator';

type Operation = { index: number; type: 'read' | 'write' | 'remove'; key: string; value?: string };
type Fault = { at: number; mode: 'before' | 'after' | 'truncate' | 'replace' | 'hang'; value?: string; quota?: boolean };
/** Test-only faults, barriers and isolated strings. No native storage or timers. */
class FaultStorage implements SnapshotStorage {
    readonly backing = new InMemorySnapshotStorage();
    readonly log: Operation[] = [];
    fault?: Fault;
    hook?: (op: Operation) => Promise<void> | void;
    onHang?: () => void;
    failReadsFrom?: number;
    private async before(type: Operation['type'], key: string, value?: string) {
        const op = { index: this.log.length + 1, type, key, ...(value === undefined ? {} : { value }) };
        this.log.push(op);
        const fault = this.fault?.at === op.index ? this.fault : undefined;
        if (fault?.mode === 'hang') { this.onHang?.(); await new Promise<void>(() => {}); } // Abandoned process checkpoint, no pending timer.
        if (fault?.mode === 'before' || (type === 'read' && this.failReadsFrom !== undefined && op.index >= this.failReadsFrom)) {
            throw new SnapshotStorageError(fault?.quota ? 'quota-exceeded' : 'storage-unavailable');
        }
        return { op, fault };
    }
    async read(key: string) {
        const { op, fault } = await this.before('read', key);
        const value = await this.backing.read(key);
        await this.hook?.(op);
        if (fault?.mode === 'after') throw new Error('rejected read acknowledgment');
        return fault?.mode === 'replace' ? fault.value! : value;
    }
    async write(key: string, value: string) {
        const { op, fault } = await this.before('write', key, value);
        await this.backing.write(key, fault?.mode === 'truncate' ? '{' : fault?.mode === 'replace' ? fault.value! : value);
        await this.hook?.(op);
        if (fault?.mode === 'after') throw new Error('lost write acknowledgment');
    }
    async remove(key: string) { await this.before('remove', key); await this.backing.remove(key); }
}
const stores: FaultStorage[] = [];
afterEach(() => { for (const store of stores) expect(store.log.filter(op => op.type === 'remove')).toEqual([]); stores.length = 0; });
const identity = { gameId: 'game:one', farmId: 'farm-1', ownerId: 'owner-1' };
const legacy = () => ({ schemaVersion: 1, ...identity, logicalTimeMs: 100,
    metadata: { revision: 7, createdAtLogicalMs: 10, updatedAtLogicalMs: 80 } });
const authorization = () => ({ ownerId: identity.ownerId, approval: 'explicit-v1-to-v2', operatingMode: 'local-single-writer', competingWriter: 'none-known' });
function receipt(source = JSON.stringify(legacy())): MigrationReceipt {
    const result = prepareMigration(source, identity);
    if (result.status !== 'prepared') throw new Error('Invalid fixture'); return result.receipt;
}
const primary = (id = identity) => { const key = snapshotKey(id); if (!key.ok) throw new Error('Key fixture'); return key.value; };
const backup = (r = receipt()) => 'farm-development:game-state-backup:' + [r.identity.gameId, r.identity.farmId, r.identity.ownerId].map(encodeURIComponent).join(':') + ':v1:r' + r.sourceRevision;
function newStore() { const store = new FaultStorage(); stores.push(store); return store; }
async function setup(source = JSON.stringify(legacy()), withBackup = false) {
    const store = newStore(), r = receipt(source);
    await store.backing.write(primary(), source);
    if (withBackup) await store.backing.write(backup(r), source);
    return { store, r, coordinator: new StorageMigrationCoordinator(store) };
}
function nonemptyTarget() {
    const s = receipt().state;
    const result = applyAggregateInventoryCommand(s, { ...identity, expectedGameStateRevision: 8,
        inventoryCommand: { inventoryId: 'farm-main', expectedRevision: 0, type: 'addItem', itemId: 'wood', quantity: 5 } },
    { ownerId: identity.ownerId, authorizedQuantityChange: { type: 'addItem', itemId: 'wood', quantity: 5 } });
    if (!result.ok) throw new Error('Inventory fixture'); return JSON.stringify(result.state);
}
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

describe('T17/T25/T36 version-aware load and pure preparation', () => {
    it('returns missing without creating state, validates identities before I/O', async () => {
        const store = newStore(), c = new StorageMigrationCoordinator(store);
        expect(await c.load(identity)).toEqual({ status: 'missing' });
        const calls = store.log.length;
        expect((await c.load({ ...identity, farmId: '../bad' })).status).toBe('rejected');
        expect(store.log).toHaveLength(calls); expect(store.log.every(op => op.type === 'read')).toBe(true);
    });
    it('preserves exact source and detached deterministic preparation with zero writes', async () => {
        const source = ' \r\n' + JSON.stringify(legacy(), null, 2).replace('100', '1e2') + '\n';
        const { store, r, coordinator } = await setup(source);
        expect(prepareMigration(source, identity)).toEqual({ status: 'prepared', receipt: r });
        expect(await coordinator.load(identity)).toEqual({ status: 'migration-required', receipt: r });
        expect(r.source).toBe(source); expect(r.state.metadata).toEqual({ revision: 8, createdAtLogicalMs: 10, updatedAtLogicalMs: 80 });
        expect(r.state.inventory.slots).toEqual(Array(20).fill(null)); expect(store.log.map(op => op.type)).toEqual(['read']);
    });
    it('loads nonempty v2 unchanged and does not migrate it again', async () => {
        const store = newStore(), raw = nonemptyTarget(); await store.backing.write(primary(), raw);
        expect(await new StorageMigrationCoordinator(store).load(identity)).toMatchObject({ status: 'accepted', source: raw, state: JSON.parse(raw) });
        expect(prepareMigration(raw, identity).status).toBe('already-v2'); expect(store.log).toHaveLength(1);
        expect(deserializeGameState(raw)).toMatchObject({ ok: false, code: 'unsupported-schema' });
    });
    it.each([
        ['{', 'malformed-json'], ['{"schemaVersion":99}', 'unsupported-schema'],
        [JSON.stringify({ ...receipt().state, itemRegistryVersion: 99 }), 'incompatible-registry'],
        [JSON.stringify({ ...legacy(), ownerId: 'other' }), 'identity-mismatch'],
        [JSON.stringify(legacy()).replace('"revision":7', '"revision":-1'), 'invalid-revision'],
        [JSON.stringify(legacy()).replace('"revision":7', '"revision":7,"revision":7'), 'duplicate-json-key'],
        [JSON.stringify(legacy()).replace('100', '100.00000000000000001'), 'invalid-json-number'],
        [' '.repeat(262145), 'parse-limit-exceeded'],
    ])('preserves rejected source and typed cause %s', async (raw, code) => {
        const store = newStore(); await store.backing.write(primary(), raw);
        const result = await new StorageMigrationCoordinator(store).load(identity);
        expect(result).toMatchObject({ status: 'rejected', source: raw, cause: { kind: 'validation', failure: { code } } });
        if (code === 'malformed-json') expect(result).toMatchObject({ cause: { failure: { offset: 1 } } });
        if (code === 'invalid-revision') expect(result).toMatchObject({ cause: { failure: { issues: [{ path: 'metadata.revision' }] } } });
        expect(await store.backing.read(primary())).toBe(raw); expect(store.log).toHaveLength(1);
    });
    it('isolates multiple identities and encoded delimiters', async () => {
        const store = newStore(), c = new StorageMigrationCoordinator(store);
        const ids = [identity, { ...identity, gameId: 'other' }, { ...identity, farmId: 'other' }, { ...identity, ownerId: 'other' },
            { ...identity, gameId: 'a:b', farmId: 'c' }, { ...identity, gameId: 'a', farmId: 'b:c' }];
        for (const id of ids) await store.backing.write(primary(id), JSON.stringify({ ...legacy(), ...id }));
        for (const id of ids) expect(await c.load(id)).toMatchObject({ status: 'migration-required', receipt: { identity: id } });
        expect(new Set(store.log.map(op => op.key)).size).toBe(ids.length);
    });
    it('reports a storage acquisition/read failure without fabricating missing', async () => {
        const store = newStore(); store.fault = { at: 1, mode: 'before' };
        expect(await new StorageMigrationCoordinator(store).load(identity)).toEqual({ status: 'storage-error', phase: 'primary-read', cause: { kind: 'storage', code: 'storage-unavailable' } });
    });
});

describe('receipt integrity and explicit authority before I/O', () => {
    it.each(['identity', 'sourceVersion', 'sourceRevision', 'source', 'state', 'target'])('rejects missing receipt field %s', async key => {
        const { store, r, coordinator } = await setup(); const input: Record<string, unknown> = { ...r }; delete input[key];
        expect(await coordinator.commit(input, authorization())).toMatchObject({ status: 'aborted', cause: { code: 'invalid-preparation' } }); expect(store.log).toHaveLength(0);
    });
    it.each([
        (r: MigrationReceipt) => ({ ...r, extra: true }), (r: MigrationReceipt) => ({ ...r, sourceRevision: 8 }),
        (r: MigrationReceipt) => ({ ...r, sourceVersion: 2 }), (r: MigrationReceipt) => ({ ...r, target: r.target + ' ' }),
        (r: MigrationReceipt) => ({ ...r, identity: { ...identity, ownerId: 'other' } }),
        (r: MigrationReceipt) => ({ ...r, state: { ...r.state, logicalTimeMs: 101 } }),
        (r: MigrationReceipt) => ({ ...r, state: { ...r.state, itemRegistryVersion: 2 } }),
        (r: MigrationReceipt) => ({ ...r, state: { ...r.state, inventory: { ...r.state.inventory, slots: [{ itemId: 'wood', quantity: 1 }, ...Array(19).fill(null)] } } }),
    ])('rejects tampered candidate/receipt without I/O', async tamper => {
        const { store, r, coordinator } = await setup();
        expect(await coordinator.commit(tamper(r), authorization())).toMatchObject({ status: 'aborted', primaryWrite: 'not-attempted', cause: { code: 'invalid-preparation' } });
        expect(store.log).toHaveLength(0); expect(await store.backing.read(primary())).toBe(r.source);
    });
    it.each([
        [undefined, 'approval-required'], [{ ...authorization(), approval: 'implicit' }, 'approval-required'],
        [{ ...authorization(), override: true }, 'approval-required'], [{ ...authorization(), ownerId: 'other' }, 'forbidden'],
        [{ ...authorization(), operatingMode: 'production-multi-writer' }, 'production-coordination-required'],
        [{ ...authorization(), competingWriter: 'known-or-suspected' }, 'competing-writer'],
    ])('rejects unapproved context before all I/O', async (context, code) => {
        const { store, r, coordinator } = await setup();
        expect(await coordinator.commit(r, context)).toMatchObject({ status: 'aborted', cause: { code } }); expect(store.log).toHaveLength(0);
    });
    it('captures nested receipt data before the first await', async () => {
        const { store, r, coordinator } = await setup(); const input = JSON.parse(JSON.stringify(r));
        const saving = coordinator.commit(input, authorization());
        input.identity.ownerId = 'other'; input.state.inventory.slots[0] = { itemId: 'wood', quantity: 99 }; input.target = '{}';
        expect(await saving).toMatchObject({ status: 'committed', state: r.state }); expect(await store.backing.read(primary())).toBe(r.target);
    });
    it('rejects receipt accessors and exhausted source revisions without invoking getters or storage', async () => {
        const { store, r, coordinator } = await setup();
        const getter = Object.defineProperty({ ...r }, 'target', { enumerable: true, get: () => { throw new Error('Must not invoke'); } });
        expect(await coordinator.commit(getter, authorization())).toMatchObject({ cause: { code: 'invalid-preparation' } });
        const source = JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: Number.MAX_SAFE_INTEGER } });
        expect(prepareMigration(source, identity)).toMatchObject({ status: 'rejected', cause: { kind: 'validation', failure: { code: 'revision-overflow' } } });
        expect(await coordinator.commit({ ...r, source }, authorization())).toMatchObject({ cause: { code: 'invalid-preparation' } }); expect(store.log).toHaveLength(0);
    });
});

describe('T18/T19/T27 exact backup, source conflict and successful commit', () => {
    it('creates and verifies exact backup, writes one complete target, keeps unrelated data', async () => {
        const { store, r, coordinator } = await setup(' \r\n' + JSON.stringify(legacy(), null, 2).replace('100', '1.0e2') + '\n');
        await store.backing.write('another-app', 'keep');
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed', primaryWrite: 'target-verified', phase: 'complete', state: r.state });
        expect(store.log.map(op => op.type)).toEqual(['read', 'write', 'read', 'read', 'write', 'read']);
        expect(await store.backing.read(backup(r))).toBe(r.source); expect(await store.backing.read(primary())).toBe(r.target);
        expect(await store.backing.read('another-app')).toBe('keep');
        const start = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'already-migrated' });
        expect(store.log.slice(start).every(op => op.type === 'read')).toBe(true);
    });
    it('reuses an exact backup with no backup writes and independent readback', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        expect((await coordinator.commit(r, authorization())).status).toBe('committed');
        expect(store.log.filter(op => op.key === backup(r)).map(op => op.type)).toEqual(['read', 'read']);
    });
    it.each(['{', ' ' + JSON.stringify(legacy()), JSON.stringify({ ...legacy(), ownerId: 'other' }), JSON.stringify(receipt().state)])('preserves conflicting backup %s', async raw => {
        const { store, r, coordinator } = await setup(); await store.backing.write(backup(r), raw);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'conflict', cause: { code: 'backup-conflict' }, mutationGate: 'blocked' });
        expect(store.log.filter(op => op.type === 'write')).toHaveLength(0);
        expect(await store.backing.read(backup(r))).toBe(raw); expect(await store.backing.read(primary())).toBe(r.source);
    });
    it.each([null, '{', ' ' + JSON.stringify(legacy()), nonemptyTarget(), '{"schemaVersion":99}'])('does not overwrite changed primary %s', async raw => {
        const { store, r, coordinator } = await setup();
        if (raw === null) await store.backing.remove(primary()); else await store.backing.write(primary(), raw);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'conflict', cause: { code: 'source-changed' }, primaryWrite: 'not-attempted' });
        expect(store.log.filter(op => op.type === 'write' && op.key === primary())).toHaveLength(0); expect(await store.backing.read(primary())).toBe(raw);
    });
    it('rereads source after backup creation rather than trusting preparation time', async () => {
        const { store, r, coordinator } = await setup(); const newer = nonemptyTarget();
        store.hook = async op => { if (op.type === 'write' && op.key === backup(r)) await store.backing.write(primary(), newer); };
        expect((await coordinator.commit(r, authorization())).status).toBe('conflict'); expect(await store.backing.read(primary())).toBe(newer);
    });
    it('rejects independently invalid backup readback before primary write', async () => {
        const { store, r, coordinator } = await setup(); store.fault = { at: 3, mode: 'replace', value: '{"x":0,"x":1}' };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', phase: 'backup-validation', cause: { kind: 'validation', failure: { code: 'duplicate-json-key' } } });
        expect(await store.backing.read(primary())).toBe(r.source);
    });
    it.each([
        ['{', 'malformed-json'],
        [JSON.stringify(legacy()).replace('100', '9007199254740993'), 'invalid-json-number'],
        [JSON.stringify(legacy()).replace('"revision":7', '"revision":-1'), 'invalid-revision'],
        ['['.repeat(17) + '0' + ']'.repeat(17), 'parse-limit-exceeded'],
        [JSON.stringify(legacy()) + ' '.repeat(262144), 'parse-limit-exceeded'],
        [JSON.stringify({ ...legacy(), schemaVersion: 99 }), 'unsupported-schema'],
        [JSON.stringify({ ...receipt().state, itemRegistryVersion: 2 }), 'incompatible-registry'],
    ])('enforces strict typed backup readback validation: %s', async (value, code) => {
        const { store, r, coordinator } = await setup(); store.fault = { at: 3, mode: 'replace', value };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', primaryWrite: 'not-attempted', cause: { kind: 'validation', failure: { code } } });
        expect(await store.backing.read(primary())).toBe(r.source);
    });
});

describe('T20/T28 deterministic I/O fault matrix', () => {
    it.each([1, 2, 3, 4])('fails before primary replacement at operation %s', async at => {
        const { store, r, coordinator } = await setup(); store.fault = { at, mode: 'before', quota: at === 2 };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', primaryWrite: 'not-attempted', cause: { kind: 'storage', code: at === 2 ? 'quota-exceeded' : 'storage-unavailable' } });
        expect(await store.backing.read(primary())).toBe(r.source);
        expect(store.log.filter(op => op.type === 'write' && op.key === primary())).toHaveLength(0);
    });
    it('retains an applied backup when its write acknowledgment fails', async () => {
        const { store, r, coordinator } = await setup(); store.fault = { at: 2, mode: 'after' };
        expect((await coordinator.commit(r, authorization())).status).toBe('aborted');
        expect(await store.backing.read(backup(r))).toBe(r.source); expect(await store.backing.read(primary())).toBe(r.source);
    });
    it.each([1, 3, 4])('normalizes a rejected read acknowledgment before primary write (%s)', async at => {
        const { store, r, coordinator } = await setup(); store.fault = { at, mode: 'after' };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', cause: { kind: 'storage', code: 'storage-unavailable' } });
        expect(await store.backing.read(primary())).toBe(r.source);
    });
    it('retains the original quota cause after a confirmed failed primary write', async () => {
        const { store, r, coordinator } = await setup(); store.fault = { at: 5, mode: 'before', quota: true };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', primaryWrite: 'source-confirmed-retained', cause: { kind: 'storage', code: 'quota-exceeded' } });
        expect(await store.backing.read(primary())).toBe(r.source);
    });
    it.each([5, 6])('reconciles an applied primary/lost acknowledgment without another write (%s)', async at => {
        const { store, r, coordinator } = await setup(); store.fault = { at, mode: 'after' };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'already-migrated', primaryWrite: 'target-verified', mutationGate: 'blocked', state: r.state });
        expect(store.log.filter(op => op.key === primary() && op.type === 'write')).toHaveLength(1);
        expect(await store.backing.read(backup(r))).toBe(r.source);
    });
    it('confirms retained source after write-before-effect failure and requires explicit reauthorization', async () => {
        const { store, r, coordinator } = await setup(); store.fault = { at: 5, mode: 'before' };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', primaryWrite: 'source-confirmed-retained', mutationGate: 'blocked' });
        const calls = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', cause: { code: 'reconciliation-required' } }); expect(store.log).toHaveLength(calls);
        const resolution = await coordinator.reconcile(r);
        expect(resolution.status).toBe('source-confirmed-retained');
        expect(await coordinator.commit(r, undefined, resolution)).toMatchObject({ cause: { code: 'approval-required' } });
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ status: 'committed' });
    });
    it.each([
        { at: 5, mode: 'truncate' as const }, { at: 6, mode: 'replace' as const, value: '{' },
        { at: 6, mode: 'replace' as const, value: ' ' + receipt().target },
        { at: 6, mode: 'replace' as const, value: nonemptyTarget() },
    ])('never acknowledges partial/corrupt/equivalent/newer readback %j', async fault => {
        const { store, r, coordinator } = await setup(); store.fault = fault;
        const result = await coordinator.commit(r, authorization());
        expect(['conflict', 'commit-status-unknown']).toContain(result.status); expect(result.mutationGate).toBe('blocked');
        expect(store.log.filter(op => op.type === 'write' && op.key === primary())).toHaveLength(1);
        expect(await store.backing.read(backup(r))).toBe(r.source);
    });
    it('stays unknown if post-write verification and reconciliation cannot read storage', async () => {
        const { store, r, coordinator } = await setup(); store.failReadsFrom = 6;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'commit-status-unknown', primaryWrite: 'unknown', mutationGate: 'blocked', cause: { kind: 'storage' } });
        const calls = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ cause: { code: 'reconciliation-required' } }); expect(store.log).toHaveLength(calls);
    });
});

describe('T21/T22/T23 read-only reconciliation and lost-receipt recovery', () => {
    it.each([1, 2, 3, 4, 5, 6])('recreates process at storage checkpoint %s without implicit writes', async at => {
        const { store, r, coordinator } = await setup(); store.fault = { at, mode: 'hang' };
        const reached = deferred(); store.onHang = reached.release;
        void coordinator.commit(r, authorization());
        await reached.promise;
        expect(store.log).toHaveLength(at); store.fault = undefined;
        const start = store.log.length, restarted = new StorageMigrationCoordinator(store);
        const result = await restarted.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        if (at <= 2) expect(result).toMatchObject({ status: 'recovery-rejected', cause: { code: 'backup-missing' } });
        else expect(result).toMatchObject({ status: 'receipt-reconstructed', reconciliation: { status: at === 6 ? 'already-migrated' : 'source-confirmed-retained' } });
        expect(store.log.slice(start).every(op => op.type === 'read')).toBe(true); expect(store.log.length - start).toBeLessThanOrEqual(2);
    });
    it.each(['source', 'target', 'newer', 'missing', 'corrupt', 'unsupported'])('reports primary %s without changing the blocked gate', async kind => {
        const { store, r, coordinator } = await setup(undefined, true);
        const values: Record<string, string> = { source: r.source, target: r.target, newer: nonemptyTarget(), corrupt: '{', unsupported: '{"schemaVersion":99}' };
        if (kind === 'missing') await store.backing.remove(primary()); else await store.backing.write(primary(), values[kind]);
        const result = await coordinator.reconcile(r);
        const expected = kind === 'source' ? 'source-confirmed-retained' : kind === 'target' ? 'already-migrated'
            : kind === 'newer' || kind === 'unsupported' ? 'conflict' : 'commit-status-unknown';
        expect(result).toMatchObject({ status: expected, mutationGate: 'blocked' });
        expect(store.log).toHaveLength(2); expect(store.log.every(op => op.type === 'read')).toBe(true);
        await coordinator.load(identity); const calls = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ cause: { code: 'reconciliation-required' } }); expect(store.log).toHaveLength(calls);
    });
    it.each([null, '{', JSON.stringify({ ...legacy(), ownerId: 'other' }), JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: 6 } }), ' ' + JSON.stringify(legacy()), receipt().target])('rejects bad referenced backup %s on reconcile', async raw => {
        const { store, r, coordinator } = await setup(); if (raw !== null) await store.backing.write(backup(r), raw);
        expect(await coordinator.reconcile(r)).toMatchObject({ mutationGate: 'blocked', status: raw === ' ' + JSON.stringify(legacy()) ? 'conflict' : 'commit-status-unknown' });
        expect(store.log).toHaveLength(1);
    });
    it('requires a known bounded reference and returns no fabricated missing/new state', async () => {
        const { store, coordinator } = await setup();
        expect(await coordinator.inspectRecovery(identity)).toMatchObject({ status: 'recovery-rejected', cause: { code: 'recovery-reference-required' } });
        for (const ref of [{ sourceVersion: 2, sourceRevision: 7 }, { sourceVersion: 1, sourceRevision: -1 }, { sourceVersion: 1, sourceRevision: Number.MAX_SAFE_INTEGER }, { sourceVersion: 1, sourceRevision: 7, key: 'other' }]) {
            expect(await coordinator.inspectRecovery(identity, ref)).toMatchObject({ status: 'recovery-rejected', cause: { code: 'invalid-reference' } });
        }
        expect(store.log).toHaveLength(0);
    });
    it.each([
        [null, 'backup-missing'], ['{', 'malformed-json'],
        [JSON.stringify({ ...legacy(), ownerId: 'other' }), 'identity-mismatch'],
        [JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: 6 } }), 'invalid-backup'],
        [receipt().target, 'invalid-backup'], ['{"schemaVersion":99}', 'unsupported-schema'],
        [JSON.stringify({ ...receipt().state, itemRegistryVersion: 99 }), 'incompatible-registry'],
    ])('rejects missing/corrupt/foreign/incompatible recovery backup %s', async (raw, code) => {
        const { store, r, coordinator } = await setup(); if (raw !== null) await store.backing.write(backup(r), raw);
        const result = await coordinator.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        expect(result).toMatchObject({ status: 'recovery-rejected', mutationGate: 'blocked' });
        if (result.status !== 'recovery-rejected') throw new Error('Expected recovery rejection');
        expect(result.cause.kind === 'validation' ? result.cause.failure.code : result.cause.code).toBe(code);
        expect(store.log.map(op => op.type)).toEqual(['read']); expect(await store.backing.read(primary())).toBe(r.source);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ cause: { code: 'reconciliation-required' } });
    });
    it.each(['source', 'target', 'newer', 'corrupt'])('reconstructs a receipt and reconciles %s after restart in at most two reads', async kind => {
        const { store, r } = await setup(undefined, true), raw = kind === 'source' ? r.source : kind === 'target' ? r.target : kind === 'newer' ? nonemptyTarget() : '{';
        await store.backing.write(primary(), raw);
        const restarted = new StorageMigrationCoordinator(store), result = await restarted.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        expect(result).toMatchObject({ status: 'receipt-reconstructed', receipt: r, mutationGate: 'blocked', reconciliation: { mutationGate: 'blocked' } });
        expect(store.log.map(op => op.type)).toEqual(['read', 'read']); expect(await store.backing.read(primary())).toBe(raw);
        expect(await restarted.commit(r, authorization())).toMatchObject({ cause: { code: 'reconciliation-required' } });
    });
    it.each([1, 2])('reports recovery storage failures at read %s with no writes', async at => {
        const { store, coordinator } = await setup(undefined, true); store.fault = { at, mode: 'before' };
        const result = await coordinator.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        expect(result).toMatchObject(at === 1 ? { status: 'recovery-rejected', cause: { kind: 'storage' } }
            : { status: 'receipt-reconstructed', reconciliation: { status: 'commit-status-unknown', cause: { kind: 'storage' } } });
        expect(store.log.every(op => op.type === 'read')).toBe(true);
    });
    it('permits an explicit freshly authorized retry from reconstructed retained source, never automatically', async () => {
        const { store, r } = await setup(undefined, true), restarted = new StorageMigrationCoordinator(store);
        const recovered = await restarted.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        if (recovered.status !== 'receipt-reconstructed') throw new Error('Expected receipt');
        expect(recovered.reconciliation).toMatchObject({ status: 'source-confirmed-retained', mutationGate: 'blocked' });
        expect(store.log.every(op => op.type === 'read')).toBe(true);
        expect(await restarted.commit(recovered.receipt, undefined, recovered.reconciliation)).toMatchObject({ cause: { code: 'approval-required' } });
        expect(await restarted.commit(recovered.receipt, authorization(), recovered.reconciliation)).toMatchObject({ status: 'committed', state: r.state });
    });
    it('preserves every item total and ordering in newer inventory during read-only recovery/conflict', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        const newer: GameStateV2 = { ...r.state, metadata: { ...r.state.metadata, revision: 11 }, inventory: { ...r.state.inventory, revision: 3,
            slots: [{ itemId: 'wood', quantity: 99 }, { itemId: 'stone', quantity: 98 }, { itemId: 'berry', quantity: 20 }, ...Array(17).fill(null)] } };
        const raw = JSON.stringify(newer); await store.backing.write(primary(), raw);
        const totals = (slots: typeof newer.inventory.slots) => {
            const result = new Map<string, bigint>();
            for (const slot of slots) if (slot) result.set(slot.itemId, (result.get(slot.itemId) ?? 0n) + BigInt(slot.quantity));
            return result;
        };
        const before = totals(newer.inventory.slots);
        const result = await coordinator.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        expect(result).toMatchObject({ status: 'receipt-reconstructed', reconciliation: { status: 'conflict', permittedNextAction: 'operator-review' } });
        const loaded = await coordinator.load(identity);
        if (loaded.status !== 'accepted') throw new Error('Expected accepted current v2');
        expect(totals(loaded.state.inventory.slots)).toEqual(before); expect(loaded.state).toEqual(newer);
        expect(await store.backing.read(primary())).toBe(raw); expect(store.log.every(op => op.type === 'read')).toBe(true);
    });
});

describe('audit corrections: original reproductions', () => {
    it('A: reports an existing blocked gate on an early authorization refusal', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        await coordinator.reconcile(r); const calls = store.log.length;
        expect(await coordinator.commit(r, undefined)).toMatchObject({ mutationGate: 'blocked', cause: { code: 'approval-required' } });
        expect(store.log).toHaveLength(calls);
    });
    it('B: busy reconcile during first load leaves the initial authorized commit available', async () => {
        const { store, r, coordinator } = await setup(); const entered = deferred(), resume = deferred();
        store.hook = async op => { if (op.index === 1) { entered.release(); await resume.promise; } };
        const loading = coordinator.load(identity); await entered.promise;
        const busy = await coordinator.reconcile(r); resume.release();
        expect(await loading).toMatchObject({ status: 'migration-required' });
        expect(busy).toMatchObject({ status: 'busy', mutationGate: 'open', primaryWrite: 'not-attempted' });
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed', mutationGate: 'open' });
        expect(store.log.map(op => op.type)).toEqual(['read', 'read', 'write', 'read', 'read', 'write', 'read']);
        expect(await store.backing.read(backup(r))).toBe(r.source); expect(await store.backing.read(primary())).toBe(r.target);
    });
    it('C: a different valid maximum-revision v1 is a source conflict, not unknown', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        const raw = JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: Number.MAX_SAFE_INTEGER } });
        await store.backing.write(primary(), raw);
        expect(await coordinator.reconcile(r)).toMatchObject({ status: 'conflict', mutationGate: 'blocked', observedPrimary: raw,
            cause: { kind: 'coordinator', code: 'source-changed', failure: { code: 'revision-overflow' } } });
        expect(store.log.map(op => op.type)).toEqual(['read', 'read']);
    });
});

describe('A: authorization reporting preserves real gate state and retry evidence', () => {
    it.each([
        [undefined, 'approval-required'], [{ ...authorization(), approval: 'implicit' }, 'approval-required'],
        [{ ...authorization(), ownerId: 'other' }, 'forbidden'],
        [{ ...authorization(), operatingMode: 'production-multi-writer' }, 'production-coordination-required'],
        [{ ...authorization(), competingWriter: 'known-or-suspected' }, 'competing-writer'],
    ])('reports blocked without transitions or I/O for rejected authorization %j', async (context, code) => {
        const { store, r, coordinator } = await setup(undefined, true);
        const resolution = await coordinator.reconcile(r), start = store.log.length;
        expect(await coordinator.commit(r, context, resolution)).toMatchObject({ status: 'aborted', identity, mutationGate: 'blocked', primaryWrite: 'not-attempted', cause: { code } });
        expect(await coordinator.commit(r, authorization())).toMatchObject({ mutationGate: 'blocked', cause: { code: 'reconciliation-required' } });
        expect(store.log).toHaveLength(start);
        // Positive retry with the earlier proof also verifies authorization errors
        // did not clear/invalidate private retry evidence or change generation.
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ status: 'committed', mutationGate: 'open' });
    });
    it('invalid receipt retains recognizable blocked identity and original validation diagnostic', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        const resolution = await coordinator.reconcile(r), start = store.log.length;
        expect(await coordinator.commit({ ...r, target: '{' }, authorization())).toMatchObject({ status: 'aborted', identity,
            mutationGate: 'blocked', cause: { code: 'invalid-preparation', failure: { code: 'malformed-json', offset: 1 } } });
        expect(await coordinator.commit(r, authorization())).toMatchObject({ mutationGate: 'blocked', cause: { code: 'reconciliation-required' } });
        expect(store.log).toHaveLength(start);
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ status: 'committed' });
    });
    it.each([undefined, {}, { identity: { ...identity, ownerId: '../bad' } }])('never reports an unverified open gate for invalid identity %j', async input => {
        const store = newStore(), coordinator = new StorageMigrationCoordinator(store);
        expect(await coordinator.commit(input, authorization())).toMatchObject({ status: 'aborted', identity: null, mutationGate: 'blocked', cause: { code: 'invalid-preparation' } });
        expect(store.log).toHaveLength(0);
    });
    it('does not block a previously open identity or change authorization error precedence', async () => {
        const { store, r, coordinator } = await setup();
        expect(await coordinator.commit(r, { ...authorization(), approval: 'implicit', ownerId: 'other' })).toMatchObject({ mutationGate: 'open', cause: { code: 'approval-required' } });
        expect(await coordinator.commit({ ...r, target: '{' }, undefined)).toMatchObject({ mutationGate: 'open', cause: { code: 'invalid-preparation' } });
        expect(store.log).toHaveLength(0);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed', mutationGate: 'open' });
    });
});

describe('B: preflight, definite abort and uncertain-write gates', () => {
    it.each(['reconcile', 'recovery'] as const)('busy %s preserves a preexisting block and its retry proof', async method => {
        const { store, r, coordinator } = await setup(undefined, true);
        const resolution = await coordinator.reconcile(r), entered = deferred(), resume = deferred();
        const start = store.log.length;
        store.hook = async op => { if (op.index === start + 1) { entered.release(); await resume.promise; } };
        const loading = coordinator.load(identity); await entered.promise;
        const result = method === 'reconcile' ? await coordinator.reconcile(r)
            : await coordinator.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
        resume.release(); await loading;
        expect(result).toMatchObject({ status: 'busy', mutationGate: 'blocked', primaryWrite: 'not-attempted', permittedNextAction: 'retry-after-active-operation' });
        expect(store.log).toHaveLength(start + 1);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ cause: { code: 'reconciliation-required' } });
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ status: 'committed' });
    });
    it('busy recovery, including invalid-reference preflight, does not block an active initial load', async () => {
        const { store, r, coordinator } = await setup(), entered = deferred(), resume = deferred();
        store.hook = async op => { if (op.index === 1) { entered.release(); await resume.promise; } };
        const loading = coordinator.load(identity); await entered.promise;
        const result = await coordinator.inspectRecovery(identity);
        const malformed = await coordinator.reconcile({ ...r, target: '{' });
        resume.release(); await loading;
        expect(result).toMatchObject({ status: 'busy', mutationGate: 'open' });
        expect(malformed).toMatchObject({ status: 'busy', mutationGate: 'open' });
        expect(store.log).toHaveLength(1);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed' });
    });
    it.each([1, 2, 3, 4])('fresh explicit retry after a definite pre-primary abort at %s re-verifies backup', async at => {
        const { store, r, coordinator } = await setup(); store.fault = { at, mode: 'before' };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'aborted', mutationGate: 'open', primaryWrite: 'not-attempted' });
        const start = store.log.length;
        expect(await coordinator.commit(r, undefined)).toMatchObject({ mutationGate: 'open', cause: { code: 'approval-required' } });
        expect(store.log).toHaveLength(start);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed', mutationGate: 'open' });
        expect(store.log.slice(start).filter(op => op.key === backup(r) && op.type === 'read')).toHaveLength(2);
        expect(await store.backing.read(backup(r))).toBe(r.source); expect(await store.backing.read(primary())).toBe(r.target);
    });
    it('a definite pre-write failure on an already-blocked retry never opens that gate', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        const resolution = await coordinator.reconcile(r); store.fault = { at: store.log.length + 1, mode: 'before' };
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ status: 'aborted', mutationGate: 'blocked', primaryWrite: 'not-attempted' });
        const count = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ mutationGate: 'blocked', cause: { code: 'reconciliation-required' } });
        expect(store.log).toHaveLength(count);
        const fresh = await coordinator.reconcile(r);
        expect(fresh).toMatchObject({ status: 'source-confirmed-retained', mutationGate: 'blocked' });
        expect(await coordinator.commit(r, authorization(), fresh)).toMatchObject({ status: 'committed' });
    });
    it.each([null, '{'])('uncertain primary write with unverifiable backup %j stays blocked without repair', async bad => {
        const { store, r, coordinator } = await setup(); store.fault = { at: 5, mode: 'after' };
        store.hook = async op => { if (op.index === 5) {
            if (bad === null) await store.backing.remove(backup(r)); else await store.backing.write(backup(r), bad);
        } };
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'commit-status-unknown', mutationGate: 'blocked', primaryWrite: 'unknown' });
        const start = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ mutationGate: 'blocked', cause: { code: 'reconciliation-required' } });
        expect(store.log).toHaveLength(start);
        expect(await coordinator.reconcile(r)).toMatchObject({ status: 'commit-status-unknown', mutationGate: 'blocked' });
        expect(store.log.slice(start).every(op => op.type === 'read')).toBe(true);
        expect(await store.backing.read(backup(r))).toBe(bad); expect(await store.backing.read(primary())).toBe(r.target);
        expect(store.log.filter(op => op.type === 'write' && op.key === primary())).toHaveLength(1);
    });
});

describe.each(['reconcile', 'recovery'] as const)('C: strict observed-primary classification via %s', method => {
    const max = () => JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: Number.MAX_SAFE_INTEGER } });
    it.each([
        [max(), 'conflict', 'source-changed'],
        [JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: 8 } }), 'conflict', 'source-changed'],
        [JSON.stringify({ ...legacy(), ownerId: 'other' }), 'commit-status-unknown', 'identity-mismatch'],
        [max().replace('owner-1', 'other'), 'commit-status-unknown', 'identity-mismatch'],
        [max().replace('"logicalTimeMs":100', '"logicalTimeMs":-1'), 'commit-status-unknown', 'invalid-state'],
        [max().replace('9007199254740991', '9007199254740992'), 'commit-status-unknown', 'invalid-json-number'],
        [max().replace('"revision":', '"revision":0,"revision":'), 'commit-status-unknown', 'duplicate-json-key'],
        ['{', 'commit-status-unknown', 'malformed-json'], ['{"schemaVersion":99}', 'conflict', 'unsupported-schema'],
    ])('classifies %s without writes, repairs or false commit', async (raw, status, code) => {
        const { store, r, coordinator } = await setup(undefined, true); await store.backing.write(primary(), raw);
        let result: ReconciliationResult;
        if (method === 'recovery') {
            const inspected = await coordinator.inspectRecovery(identity, { sourceVersion: 1, sourceRevision: 7 });
            if (inspected.status !== 'receipt-reconstructed') throw new Error('Expected reconstructed receipt');
            result = inspected.reconciliation;
        } else {
            const reconciled = await coordinator.reconcile(r);
            if (reconciled.status === 'busy') throw new Error('Unexpected preflight'); result = reconciled;
        }
        expect(result).toMatchObject({ status, mutationGate: 'blocked', observedPrimary: raw });
        if (result.status !== 'conflict' && result.status !== 'commit-status-unknown') throw new Error('Expected failure observation');
        expect(result.cause.kind === 'validation' ? result.cause.failure.code : result.cause.code).toBe(code);
        if (raw === max()) expect(result).toMatchObject({ cause: { failure: { code: 'revision-overflow' } } });
        expect(store.log.map(op => op.type)).toEqual(['read', 'read']);
        expect(await store.backing.read(primary())).toBe(raw); expect(await store.backing.read(backup(r))).toBe(r.source);
        const count = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ mutationGate: 'blocked', cause: { code: 'reconciliation-required' } });
        expect(store.log).toHaveLength(count);
    });
});

describe('additional T17/T27 exact identity and stored-string coverage', () => {
    it('migrates two farm aggregates with distinct primary and backup keys', async () => {
        const store = newStore(), coordinator = new StorageMigrationCoordinator(store);
        const ids = [identity, { ...identity, farmId: 'farm-2' }];
        const receipts = ids.map(id => {
            const prepared = prepareMigration(JSON.stringify({ ...legacy(), ...id }), id);
            if (prepared.status !== 'prepared') throw new Error('Invalid fixture'); return prepared.receipt;
        });
        for (const r of receipts) await store.backing.write(primary(r.identity), r.source);
        for (const r of receipts) expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed', state: r.state });
        expect(new Set(receipts.map(r => primary(r.identity)))).toHaveLength(2);
        expect(new Set(receipts.map(r => backup(r)))).toHaveLength(2);
        for (const r of receipts) {
            expect(await store.backing.read(primary(r.identity))).toBe(r.target);
            expect(await store.backing.read(backup(r))).toBe(r.source);
            expect(r.state.inventory.inventoryId).toBe('farm-main');
        }
    });
    it('backs up escaped keys and reordered members exactly and rejects equivalent text as acknowledgment', async () => {
        const canonical = JSON.stringify(legacy());
        const escaped = canonical.replace('"gameId"', '"game\\u0049d"').replace('"metadata"', '"metad\\u0061ta"');
        const source = ' \r\n' + escaped.replace('{"schemaVersion":1,', '{').replace('"logicalTimeMs":100,', '"logicalTimeMs":1e2,"schemaVersion":1,') + '\n';
        const { store, r, coordinator } = await setup(source);
        expect(JSON.parse(source)).toEqual(legacy()); expect(source).not.toBe(canonical);
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'committed' });
        expect(await store.backing.read(backup(r))).toBe(source);
        const equivalent = JSON.stringify({ ...r.state, metadata: { updatedAtLogicalMs: 80, createdAtLogicalMs: 10, revision: 8 } });
        expect(JSON.parse(equivalent)).toEqual(r.state); expect(equivalent).not.toBe(r.target);
        await store.backing.write(primary(), equivalent);
        const start = store.log.length;
        expect(await coordinator.reconcile(r)).toMatchObject({ status: 'conflict', observedPrimary: equivalent, mutationGate: 'blocked' });
        expect(store.log.slice(start).every(op => op.type === 'read')).toBe(true);
        expect(await store.backing.read(primary())).toBe(equivalent); expect(await store.backing.read(backup(r))).toBe(source);
    });
});

describe('T24/T37/T38 local gates and demonstrated cross-instance races', () => {
    it('returns side-effect-free busy preflight refusals on overlapping operations', async () => {
        const { store, r, coordinator } = await setup(); const reached = deferred(), resume = deferred();
        store.hook = async op => { if (op.index === 1) { reached.release(); await resume.promise; } };
        const pending = coordinator.commit(r, authorization()); await reached.promise;
        expect(await coordinator.load(identity)).toMatchObject({ status: 'rejected', cause: { code: 'busy' } });
        expect(await coordinator.commit(r, authorization())).toMatchObject({ cause: { code: 'busy' } });
        expect(await coordinator.reconcile(r)).toMatchObject({ status: 'busy', cause: { code: 'busy' }, mutationGate: 'open' });
        expect(store.log).toHaveLength(1); resume.release();
        expect(await pending).toMatchObject({ status: 'committed', mutationGate: 'open' });
        const start = store.log.length;
        expect(await coordinator.commit(r, authorization())).toMatchObject({ status: 'already-migrated', mutationGate: 'open' });
        expect(store.log.slice(start).every(op => op.type === 'read')).toBe(true);
    });
    it('rejects forged/tampered/stale retry resolutions and only permits explicit verified retry', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        const resolution = await coordinator.reconcile(r);
        expect(await coordinator.commit(r, authorization(), { ...resolution, observedPrimary: '{}' })).toMatchObject({ cause: { code: 'reconciliation-required' } });
        const forged = { ...resolution, extra: true };
        expect(await coordinator.commit(r, authorization(), forged)).toMatchObject({ cause: { code: 'reconciliation-required' } });
        await store.backing.write(primary(), nonemptyTarget());
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ status: 'conflict' });
        const calls = store.log.length;
        expect(await coordinator.commit(r, authorization(), resolution)).toMatchObject({ cause: { code: 'reconciliation-required' } }); expect(store.log).toHaveLength(calls);
    });
    it('invalid receipt reconciliation still blocks the recognizable identity without storage I/O', async () => {
        const { store, r, coordinator } = await setup();
        expect(await coordinator.reconcile({ ...r, target: '{}' })).toMatchObject({ status: 'commit-status-unknown', cause: { code: 'invalid-preparation' } });
        expect(await coordinator.commit(r, authorization())).toMatchObject({ cause: { code: 'reconciliation-required' } }); expect(store.log).toHaveLength(0);
    });
    it('bounds tracked identity gates without an unbounded queue or evicting blocked entries', async () => {
        const store = newStore(), c = new StorageMigrationCoordinator(store);
        for (let i = 0; i < MAX_COORDINATOR_IDENTITIES; i++) expect((await c.load({ ...identity, farmId: 'farm-' + i })).status).toBe('missing');
        const count = store.log.length;
        expect(await c.load({ ...identity, farmId: 'overflow' })).toMatchObject({ cause: { code: 'busy' } }); expect(store.log).toHaveLength(count);
    });
    it('demonstrates two instances can both create the same backup: no atomic write-if-absent', async () => {
        const { store, r } = await setup(); const both = deferred(); let reads = 0;
        store.hook = async op => { if (op.type === 'read' && op.key === backup(r) && ++reads <= 2) { if (reads === 2) both.release(); await both.promise; } };
        const results = await Promise.all([new StorageMigrationCoordinator(store).commit(r, authorization()), new StorageMigrationCoordinator(store).commit(r, authorization())]);
        expect(results.every(result => result.status === 'committed' || result.status === 'already-migrated')).toBe(true);
        expect(store.log.filter(op => op.type === 'write' && op.key === backup(r))).toHaveLength(2);
    });
    it('demonstrates an uncoordinated newer writer can be lost in the reread/write race', async () => {
        const { store, r, coordinator } = await setup(); const newer = nonemptyTarget();
        store.hook = async op => { if (op.type === 'read' && op.key === primary() && op.index === 4) await store.backing.write(primary(), newer); };
        expect((await coordinator.commit(r, authorization())).status).toBe('committed');
        expect(await store.backing.read(primary())).toBe(r.target); expect(r.target).not.toBe(newer);
        // Deliberate D8 operating-assumption violation: do NOT interpret as multi-writer safety.
    });
    it('preserves all four exact read-only union permission/disposition contracts', async () => {
        const { store, r, coordinator } = await setup(undefined, true);
        const expected: [string | null, ReconciliationResult['status'], string, string][] = [
            [r.source, 'source-confirmed-retained', 'source-confirmed-retained', 'explicitly-reauthorized-retry'],
            [r.target, 'already-migrated', 'target-verified', 'explicit-state-adoption'],
            [nonemptyTarget(), 'conflict', 'unknown', 'operator-review'],
            [null, 'commit-status-unknown', 'unknown', 'read-only-reconciliation-or-inspection'],
        ];
        for (const [raw, status, primaryWrite, permittedNextAction] of expected) {
            if (raw === null) await store.backing.remove(primary()); else await store.backing.write(primary(), raw);
            const result = await coordinator.reconcile(r);
            expect(result).toMatchObject({ status, primaryWrite, permittedNextAction, mutationGate: 'blocked', identity, backupReference: { sourceVersion: 1, sourceRevision: 7 } });
        }
    });
});
