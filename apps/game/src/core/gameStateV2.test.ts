import { describe, expect, it, vi } from 'vitest';
import { validateGameState, type GameState } from './gameState';
import { deserializeGameState, serializeGameState } from './gameStatePersistence';
import { type InventoryOperation } from './inventory';
import { advanceLogicalTimeV2, applyAggregateInventoryCommand, ITEM_REGISTRY_V1,
    parseVersionedGameState, prepareV1Migration, validateGameStateV2, type GameStateV2 } from './gameStateV2';

const legacy = (): GameState => ({ schemaVersion: 1, gameId: 'game-1', farmId: 'farm-1', ownerId: 'owner-1',
    logicalTimeMs: 100, metadata: { revision: 7, createdAtLogicalMs: 10, updatedAtLogicalMs: 80 } });
function state(): GameStateV2 {
    const result = prepareV1Migration(legacy());
    if (!result.ok) throw new Error('Fixture migration failed');
    return result.state;
}
function command(s: GameStateV2, op: InventoryOperation) {
    return { gameId: s.gameId, farmId: s.farmId, ownerId: s.ownerId, expectedGameStateRevision: s.metadata.revision,
        inventoryCommand: { inventoryId: 'farm-main', expectedRevision: s.inventory.revision, ...op } };
}
function apply(s: GameStateV2, op: InventoryOperation) {
    return applyAggregateInventoryCommand(s, command(s, op), { ownerId: s.ownerId,
        ...((op.type === 'addItem' || op.type === 'removeItem') ? { authorizedQuantityChange: op } : {}) });
}
function accepted(s: GameStateV2, op: InventoryOperation): GameStateV2 {
    const result = apply(s, op); if (!result.ok) throw new Error(result.code); return result.state;
}
describe('schema v2 and deterministic preparation (T02-T10, T25, T27)', () => {
    it('preserves all legacy values, consumes one outer revision and creates no items', () => {
        const s = state();
        expect(s).toEqual({ ...legacy(), schemaVersion: 2, itemRegistryVersion: 1,
            metadata: { ...legacy().metadata, revision: 8 }, inventory: { inventoryId: 'farm-main', ownerId: 'owner-1', revision: 0, capacity: 20, slots: Array(20).fill(null) } });
        expect(validateGameStateV2(s)).toEqual({ ok: true, value: s });
        expect(typeof window).toBe('undefined');
    });
    it('pins catalog 1 to the exact five immutable definitions', () => {
        expect(ITEM_REGISTRY_V1.list().map(x => [x.itemId, x.maxStack])).toEqual([['wood', 99], ['stone', 99], ['seed', 50], ['berry', 20], ['slime-gel', 99]]);
        expect(Object.isFrozen(ITEM_REGISTRY_V1)).toBe(true);
        expect(ITEM_REGISTRY_V1.list().every(Object.isFrozen)).toBe(true);
    });
    it('does not mutate frozen input; repeated preparation is deterministic and detached', () => {
        const input = Object.freeze({ ...legacy(), metadata: Object.freeze(legacy().metadata) });
        const a = prepareV1Migration(input), b = prepareV1Migration(input);
        expect(a).toEqual(b); expect(input).toEqual(legacy());
        if (!a.ok || !b.ok) throw new Error('Expected migration');
        expect(a.state.metadata).not.toBe(input.metadata);
        expect(a.state.inventory.slots).not.toBe(b.state.inventory.slots);
    });
    it('preserves maximum-length IDs without combining or truncating them', () => {
        const input = { ...legacy(), gameId: 'g'.repeat(64), farmId: 'f'.repeat(64), ownerId: 'o'.repeat(64) };
        const result = prepareV1Migration(input);
        expect(result).toMatchObject({ ok: true, state: { gameId: input.gameId, farmId: input.farmId, ownerId: input.ownerId } });
    });
    it('rejects migration overflow and conflicting legacy inventory without repair', () => {
        expect(prepareV1Migration({ ...legacy(), metadata: { ...legacy().metadata, revision: Number.MAX_SAFE_INTEGER } })).toEqual({ ok: false, code: 'revision-overflow' });
        expect(prepareV1Migration({ ...legacy(), inventory: state().inventory }).ok).toBe(false);
    });
    it('retains exact source string and stable prepared serialization without activation', () => {
        const raw = '\r\n ' + JSON.stringify(legacy(), null, 2) + '\n';
        const result = parseVersionedGameState(raw);
        expect(result).toMatchObject({ ok: true, status: 'migration-required', source: raw, sourceVersion: 1, sourceRevision: 7 });
        expect(parseVersionedGameState(raw)).toEqual(result);
        if (!result.ok || result.status !== 'migration-required') throw new Error('Expected preparation');
        expect(JSON.parse(result.target)).toEqual(result.state);
        const reordered = { ...legacy(), metadata: { updatedAtLogicalMs: 80, createdAtLogicalMs: 10, revision: 7 } };
        const other = parseVersionedGameState(JSON.stringify(reordered));
        expect(other).toMatchObject({ ok: true, target: result.target });
        const again = parseVersionedGameState(result.target);
        expect(again).toMatchObject({ ok: true, status: 'accepted', state: result.state });
        expect(again).not.toHaveProperty('target');
    });
    it('round trips nonempty v2 without changing slots, revisions or times', () => {
        const s = accepted(state(), { type: 'addItem', itemId: 'wood', quantity: 120 });
        const raw = JSON.stringify(s);
        expect(parseVersionedGameState(raw)).toEqual({ ok: true, status: 'accepted', state: s, source: raw });
    });
    it.each([0, 3, -1, '2', null])('rejects unsupported version %j', schemaVersion => {
        expect(parseVersionedGameState(JSON.stringify({ ...state(), schemaVersion }))).toMatchObject({ ok: false, code: 'unsupported-schema' });
    });
    it('checks raw ambiguity before unknown schema dispatch and rejects unknown catalog', () => {
        expect(parseVersionedGameState('{"schemaVersion":99,"x":0,"x":1}')).toMatchObject({ ok: false, code: 'duplicate-json-key' });
        expect(parseVersionedGameState(JSON.stringify({ ...state(), itemRegistryVersion: 2 }))).toMatchObject({ ok: false, code: 'incompatible-registry' });
    });
    it('validates expected snapshot identity separately, without storage', () => {
        expect(parseVersionedGameState(JSON.stringify(legacy()), legacy()).ok).toBe(false); // Exact identity fields only.
        const expected = { gameId: 'game-1', farmId: 'farm-1', ownerId: 'owner-1' };
        expect(parseVersionedGameState(JSON.stringify(legacy()), expected).ok).toBe(true);
        expect(parseVersionedGameState(JSON.stringify(state()), { ...expected, farmId: 'farm-2' })).toEqual({ ok: false, code: 'identity-mismatch' });
    });
    it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid v2 counters %s without coercion', value => {
        const s = state();
        expect(validateGameStateV2({ ...s, logicalTimeMs: value }).ok).toBe(false);
        expect(validateGameStateV2({ ...s, metadata: { ...s.metadata, revision: value } }).ok).toBe(false);
        expect(validateGameStateV2({ ...s, inventory: { ...s.inventory, revision: value } }).ok).toBe(false);
    });
    it('rejects extra/missing/accessor/symbol fields and invalid metadata', () => {
        const s = state();
        for (const key of Object.keys(s)) { const copy: Record<string, unknown> = { ...s }; delete copy[key]; expect(validateGameStateV2(copy).ok).toBe(false); }
        for (const input of [{ ...s, camera: {} }, { ...s, [Symbol()]: 0 }, { ...s, metadata: { ...s.metadata, updatedAtLogicalMs: 101 } }, Object.defineProperty({ ...s }, 'ownerId', { get: () => { throw new Error('Must not read'); } })]) {
            expect(validateGameStateV2(input).ok).toBe(false);
        }
    });
    it('rejects wrong inventory identity, revision, quantities, unknown items and sparse slots', () => {
        const s = state(), holes = Array(20);
        for (const inventory of [{ ...s.inventory, inventoryId: 'backpack' }, { ...s.inventory, ownerId: 'other' }, { ...s.inventory, revision: 9 },
            { ...s.inventory, slots: holes }, { ...s.inventory, slots: Array(20).fill(undefined) },
            ...[0, -1, 1.5, NaN, Infinity, 100].map(quantity => ({ ...s.inventory, capacity: 1, slots: [{ itemId: 'wood', quantity }] })),
            { ...s.inventory, capacity: 1, slots: [{ itemId: 'unknown', quantity: 1 }] }]) expect(validateGameStateV2({ ...s, inventory }).ok).toBe(false);
    });
    it('accepts capacity boundaries, rejects invalid capacity and preserves repeated item stacks', () => {
        const s = state();
        for (const capacity of [1, 1000]) expect(validateGameStateV2({ ...s, inventory: { ...s.inventory, capacity, slots: Array(capacity).fill(null) } }).ok).toBe(true);
        for (const capacity of [0, 1001, 1.5]) expect(validateGameStateV2({ ...s, inventory: { ...s.inventory, capacity } }).ok).toBe(false);
        expect(validateGameStateV2({ ...s, inventory: { ...s.inventory, capacity: 2, slots: [{ itemId: 'wood', quantity: 1 }, { itemId: 'wood', quantity: 2 }] } }).ok).toBe(true);
    });
    it('preserves legacy APIs including their deliberately broader JSON behavior', () => {
        expect(validateGameState(state()).ok).toBe(false); expect(serializeGameState(state()).ok).toBe(false);
        expect(deserializeGameState(JSON.stringify(state()))).toMatchObject({ ok: false, code: 'unsupported-schema' });
        const raw = JSON.stringify(legacy()).replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1');
        expect(deserializeGameState(raw).ok).toBe(true);
        expect(parseVersionedGameState(raw)).toMatchObject({ ok: false, code: 'duplicate-json-key' });
    });
    it('keeps legacy numeric rounding and input-size compatibility separate from the new gate', () => {
        const rounded = JSON.stringify(legacy()).replace('"logicalTimeMs":100', '"logicalTimeMs":100.00000000000000001');
        expect(deserializeGameState(rounded).ok).toBe(true);
        expect(parseVersionedGameState(rounded)).toMatchObject({ ok: false, code: 'invalid-json-number' });
        const large = JSON.stringify(legacy()) + ' '.repeat(262144);
        expect(deserializeGameState(large).ok).toBe(true);
        expect(parseVersionedGameState(large)).toMatchObject({ ok: false, code: 'parse-limit-exceeded' });
    });
    it('rejects duplicates nested in real snapshot metadata and inventory arrays', () => {
        const raw = JSON.stringify(accepted(state(), { type: 'addItem', itemId: 'wood', quantity: 2 }));
        for (const text of [raw.replace('"revision":9', '"revision":9,"revision":9'),
            raw.replace('"quantity":2', '"quantity":2,"quanti\\u0074y":2')]) {
            expect(parseVersionedGameState(text)).toMatchObject({ ok: false, code: 'duplicate-json-key' });
        }
    });
    it('accepts a full 1000-slot pinned-catalog snapshot without loss', () => {
        const s = state(), full = { ...s, inventory: { ...s.inventory, capacity: 1000, slots: Array.from({ length: 1000 }, () => ({ itemId: 'wood', quantity: 99 })) } };
        expect(parseVersionedGameState(JSON.stringify(full))).toMatchObject({ ok: true, status: 'accepted', state: full });
    });
    it.each([-1, '1', null, false, Number.MAX_SAFE_INTEGER + 1])('retains revision paths for invalid inventory revision %j', revision => {
        const s = state(), input = { ...s, inventory: { ...s.inventory, revision } };
        expect(validateGameStateV2(input)).toMatchObject({ ok: false, code: 'invalid-revision', issues: [{ path: 'inventory.revision', message: expect.any(String) }] });
        const result = parseVersionedGameState(JSON.stringify(input));
        if (typeof revision === 'number' && !Number.isSafeInteger(revision)) {
            expect(result).toMatchObject({ ok: false, code: 'invalid-json-number' }); // Lexical gate precedes domain classification.
        } else expect(result).toMatchObject({ ok: false, code: 'invalid-revision', issues: [{ path: 'inventory.revision', message: expect.any(String) }] });
    });
    it('reports negative aggregate and cross-revision violations in v1/v2 without changing legacy error semantics', () => {
        const s = state();
        for (const input of [{ ...s, metadata: { ...s.metadata, revision: -1 } }, { ...legacy(), metadata: { ...legacy().metadata, revision: -1 } }]) {
            expect(parseVersionedGameState(JSON.stringify(input))).toMatchObject({ ok: false, code: 'invalid-revision', issues: [{ path: 'metadata.revision', message: expect.any(String) }] });
        }
        expect(parseVersionedGameState(JSON.stringify({ ...s, inventory: { ...s.inventory, revision: 9 } })))
            .toMatchObject({ ok: false, code: 'invalid-revision', issues: [{ path: 'inventory.revision', message: expect.any(String) }] });
        expect(deserializeGameState(JSON.stringify({ ...legacy(), metadata: { ...legacy().metadata, revision: -1 } })))
            .toMatchObject({ ok: false, code: 'invalid-state' });
    });
    it('preserves ordinary envelope/inventory diagnostics through the dispatcher', () => {
        const s = state();
        for (const input of [{ ...s, gameId: '' }, { ...legacy(), gameId: '' }]) {
            expect(parseVersionedGameState(JSON.stringify(input)))
                .toMatchObject({ ok: false, code: 'invalid-state', issues: [{ path: 'gameId', message: expect.any(String) }] });
        }
        expect(parseVersionedGameState(JSON.stringify({ ...s, inventory: { ...s.inventory, capacity: 1, slots: [{ itemId: 'missing', quantity: 1 }] } })))
            .toMatchObject({ ok: false, code: 'invalid-state', issues: [{ path: 'inventory.slots[0]', message: expect.any(String) }] });
    });
    it('defines mixed-error precedence structurally without matching diagnostic messages', () => {
        const s = state(), input = { ...s, gameId: '', metadata: { ...s.metadata, revision: -1 }, inventory: { ...s.inventory, revision: 'bad' } };
        const raw = JSON.stringify(input);
        expect(parseVersionedGameState(raw)).toMatchObject({ ok: false, code: 'invalid-revision', issues: [
            { path: 'metadata.revision' }, { path: 'inventory.revision' },
        ] });
        expect(parseVersionedGameState(raw)).toEqual(parseVersionedGameState(raw));
        expect(parseVersionedGameState(JSON.stringify({ ...input, extra: true }))).toMatchObject({ ok: false, code: 'invalid-state', issues: [{ path: '$' }] });
        expect(parseVersionedGameState(JSON.stringify({ ...input, schemaVersion: 3 }))).toEqual({ ok: false, code: 'unsupported-schema' });
        expect(parseVersionedGameState(JSON.stringify({ ...input, itemRegistryVersion: 2 }))).toEqual({ ok: false, code: 'incompatible-registry' });
        expect(parseVersionedGameState(raw.replace('"revision":-1', '"revision":1.5'))).toMatchObject({ ok: false, code: 'invalid-json-number' });
    });
    it('rejects invalid snapshots without source mutation or storage calls', () => {
        const s = state(), input = Object.freeze({ ...s, inventory: Object.freeze({ ...s.inventory, revision: -1 }) });
        const raw = JSON.stringify(input), storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
        vi.stubGlobal('localStorage', storage);
        try {
            expect(validateGameStateV2(input)).toMatchObject({ ok: false, code: 'invalid-revision' });
            expect(parseVersionedGameState(raw)).toMatchObject({ ok: false, code: 'invalid-revision' });
            expect(JSON.stringify(input)).toBe(raw);
            for (const fn of Object.values(storage)) expect(fn).not.toHaveBeenCalled();
        } finally { vi.unstubAllGlobals(); }
    });
});

describe('aggregate inventory and clock boundary (T11-T15 pure)', () => {
    it('executes all five operations with exactly one increment of both revisions', () => {
        let s = state();
        const operations: InventoryOperation[] = [{ type: 'addItem', itemId: 'wood', quantity: 10 }, { type: 'moveStack', from: 0, to: 1 },
            { type: 'splitStack', from: 1, to: 2, quantity: 3 }, { type: 'mergeStack', from: 2, to: 1 }, { type: 'removeItem', itemId: 'wood', quantity: 4 }];
        for (const op of operations) {
            const before = JSON.stringify(s), next = accepted(s, op);
            expect(JSON.stringify(s)).toBe(before);
            expect(next.metadata.revision).toBe(s.metadata.revision + 1); expect(next.inventory.revision).toBe(s.inventory.revision + 1);
            expect(next.logicalTimeMs).toBe(100); expect(next.metadata.updatedAtLogicalMs).toBe(100); expect(next.metadata.createdAtLogicalMs).toBe(10);
            s = next;
        }
        expect(s.inventory.slots[1]).toEqual({ itemId: 'wood', quantity: 6 });
    });
    it('rejects outer/inner stale revisions, targets and owners independently', () => {
        const s = state(), op = { type: 'moveStack' as const, from: 0, to: 1 }, c = command(s, op);
        for (const [request, code] of [[{ ...c, expectedGameStateRevision: 7 }, 'aggregate-revision-conflict'],
            [{ ...c, inventoryCommand: { ...c.inventoryCommand, expectedRevision: 1 } }, 'revision-conflict'],
            [{ ...c, farmId: 'other' }, 'wrong-target'], [{ ...c, gameId: 'other' }, 'wrong-target'], [{ ...c, ownerId: 'other' }, 'wrong-target']] as const) {
            expect(applyAggregateInventoryCommand(s, request, { ownerId: s.ownerId })).toEqual({ ok: false, code });
        }
        expect(applyAggregateInventoryCommand(s, c, { ownerId: 'other' })).toEqual({ ok: false, code: 'forbidden' });
    });
    it('rejects unauthorized grants and tampered commands without changing either revision', () => {
        const s = state(), before = JSON.stringify(s), c = command(s, { type: 'addItem', itemId: 'wood', quantity: 2 });
        expect(applyAggregateInventoryCommand(s, c, { ownerId: s.ownerId })).toEqual({ ok: false, code: 'quantity-change-not-authorized' });
        expect(applyAggregateInventoryCommand(s, { ...c, replacement: s }, { ownerId: s.ownerId })).toEqual({ ok: false, code: 'invalid-command' });
        expect(JSON.stringify(s)).toBe(before);
    });
    it('fails atomically for full, insufficient, no-op and invalid operations', () => {
        const s = accepted(state(), { type: 'addItem', itemId: 'wood', quantity: 10 }), before = JSON.stringify(s);
        for (const op of [{ type: 'addItem', itemId: 'wood', quantity: 2000 }, { type: 'removeItem', itemId: 'wood', quantity: 11 },
            { type: 'moveStack', from: 0, to: 0 }, { type: 'mergeStack', from: 0, to: 1 }, { type: 'splitStack', from: 0, to: 1, quantity: 10 },
            { type: 'addItem', itemId: 'wood', quantity: 0.5 }] as InventoryOperation[]) expect(apply(s, op).ok).toBe(false);
        expect(JSON.stringify(s)).toBe(before);
    });
    it('rejects incompatible occupied stacks with exact code and unchanged aggregate', () => {
        const s = accepted(accepted(state(), { type: 'addItem', itemId: 'wood', quantity: 10 }), { type: 'addItem', itemId: 'stone', quantity: 5 });
        const before = JSON.parse(JSON.stringify(s)) as GameStateV2;
        expect(s.inventory.slots.slice(0, 2)).toEqual([{ itemId: 'wood', quantity: 10 }, { itemId: 'stone', quantity: 5 }]);
        expect(apply(s, { type: 'mergeStack', from: 0, to: 1 })).toEqual({ ok: false, code: 'incompatible-item' });
        expect(s.inventory.slots).toEqual(before.inventory.slots);
        expect(s.inventory.revision).toBe(before.inventory.revision);
        expect(s.metadata.revision).toBe(before.metadata.revision);
        expect(s).toEqual(before);
    });
    it('separately rejects an empty merge target with exact code and unchanged aggregate', () => {
        const s = accepted(state(), { type: 'addItem', itemId: 'wood', quantity: 10 }), before = JSON.stringify(s);
        expect(apply(s, { type: 'mergeStack', from: 0, to: 1 })).toEqual({ ok: false, code: 'empty-slot' });
        expect(JSON.stringify(s)).toBe(before);
    });
    it('rejects exhausted counters before a candidate can be produced', () => {
        for (const inner of [0, Number.MAX_SAFE_INTEGER]) {
            const s = state(), exhausted = { ...s, metadata: { ...s.metadata, revision: Number.MAX_SAFE_INTEGER }, inventory: { ...s.inventory, revision: inner } };
            expect(apply(exhausted, { type: 'addItem', itemId: 'wood', quantity: 1 })).toEqual({ ok: false, code: 'revision-overflow' });
        }
    });
    it('allows the last representable mutation, then rejects replay without wraparound', () => {
        const s = state(), near = { ...s, metadata: { ...s.metadata, revision: Number.MAX_SAFE_INTEGER - 1 },
            inventory: { ...s.inventory, revision: Number.MAX_SAFE_INTEGER - 1 } };
        const last = accepted(near, { type: 'addItem', itemId: 'wood', quantity: 1 });
        expect(last.metadata.revision).toBe(Number.MAX_SAFE_INTEGER);
        expect(last.inventory.revision).toBe(Number.MAX_SAFE_INTEGER);
        expect(apply(last, { type: 'removeItem', itemId: 'wood', quantity: 1 })).toEqual({ ok: false, code: 'revision-overflow' });
    });
    it('does not mutate a deeply frozen aggregate or accept nested definition overrides', () => {
        const original = state();
        const frozen = Object.freeze({ ...original, metadata: Object.freeze(original.metadata),
            inventory: Object.freeze({ ...original.inventory, slots: Object.freeze(original.inventory.slots) }) });
        expect(apply(frozen, { type: 'addItem', itemId: 'wood', quantity: 1 }).ok).toBe(true);
        const c = command(frozen, { type: 'addItem', itemId: 'wood', quantity: 1 });
        expect(applyAggregateInventoryCommand(frozen, { ...c, inventoryCommand: { ...c.inventoryCommand, maxStack: 9999 } },
            { ownerId: frozen.ownerId, authorizedQuantityChange: { type: 'addItem', itemId: 'wood', quantity: 1 } })).toEqual({ ok: false, code: 'invalid-command' });
        expect(frozen).toEqual(original);
    });
    it('rejects invalid context, state and outer revision values without producing candidates', () => {
        const s = state(), c = command(s, { type: 'moveStack', from: 0, to: 1 });
        expect(applyAggregateInventoryCommand(s, c, { ownerId: '' })).toEqual({ ok: false, code: 'invalid-context' });
        expect(applyAggregateInventoryCommand({ ...s, inventory: null }, c, { ownerId: s.ownerId })).toEqual({ ok: false, code: 'invalid-state' });
        for (const expectedGameStateRevision of [NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
            expect(applyAggregateInventoryCommand(s, { ...c, expectedGameStateRevision }, { ownerId: s.ownerId })).toEqual({ ok: false, code: 'invalid-command' });
        }
    });
    it('clock-only update preserves nonempty inventory, then rejects stale outer token', () => {
        const s = accepted(state(), { type: 'addItem', itemId: 'berry', quantity: 3 });
        const c = { schemaVersion: 2, type: 'advance-logical-time', operationId: 'clock-1', gameId: s.gameId, farmId: s.farmId, expectedRevision: s.metadata.revision };
        const result = advanceLogicalTimeV2(s, c, { ownerId: s.ownerId, logicalTimeMs: 200 });
        if (!result.ok) throw new Error(result.code);
        expect(result.state.inventory).toEqual(s.inventory); expect(result.state.metadata.revision).toBe(s.metadata.revision + 1);
        expect(result.state.logicalTimeMs).toBe(200);
        expect(applyAggregateInventoryCommand(result.state, command(s, { type: 'moveStack', from: 0, to: 1 }), { ownerId: s.ownerId })).toEqual({ ok: false, code: 'aggregate-revision-conflict' });
        expect(advanceLogicalTimeV2(s, c, { ownerId: s.ownerId, logicalTimeMs: 100 })).toMatchObject({ ok: false, code: 'time-not-advanced' });
    });
    it('rejects invalid v2 clock commands, context, targeting and exhaustion without losing inventory', () => {
        const s = state(), before = JSON.stringify(s), c = { schemaVersion: 2, type: 'advance-logical-time', operationId: 'clock', gameId: s.gameId, farmId: s.farmId, expectedRevision: s.metadata.revision };
        for (const [request, context, code] of [
            [{ ...c, schemaVersion: 1 }, { ownerId: s.ownerId, logicalTimeMs: 200 }, 'invalid-command'],
            [c, { ownerId: s.ownerId, logicalTimeMs: Infinity }, 'invalid-context'],
            [c, { ownerId: 'other', logicalTimeMs: 200 }, 'forbidden'],
            [{ ...c, farmId: 'other' }, { ownerId: s.ownerId, logicalTimeMs: 200 }, 'wrong-target'],
            [{ ...c, expectedRevision: 0 }, { ownerId: s.ownerId, logicalTimeMs: 200 }, 'revision-conflict'],
        ] as const) expect(advanceLogicalTimeV2(s, request, context)).toMatchObject({ ok: false, code });
        const exhausted = { ...s, metadata: { ...s.metadata, revision: Number.MAX_SAFE_INTEGER } };
        expect(advanceLogicalTimeV2(exhausted, { ...c, expectedRevision: Number.MAX_SAFE_INTEGER }, { ownerId: s.ownerId, logicalTimeMs: 200 })).toMatchObject({ ok: false, code: 'revision-overflow' });
        expect(JSON.stringify(s)).toBe(before);
    });
    it('seeded mutation replay conserves exact per-item quantities with BigInt', () => {
        const replay = () => {
            let s = state(), seed = 17;
            const ids = ITEM_REGISTRY_V1.list().map(item => item.itemId);
            const expected = new Map(ids.map(id => [id, 0n]));
            const acceptedTypes = new Set<InventoryOperation['type']>();
            const forced: InventoryOperation[] = [
                { type: 'addItem', itemId: 'wood', quantity: 10 }, { type: 'addItem', itemId: 'stone', quantity: 10 },
                { type: 'addItem', itemId: 'berry', quantity: 8 }, { type: 'moveStack', from: 1, to: 4 },
                { type: 'splitStack', from: 0, to: 3, quantity: 3 }, { type: 'mergeStack', from: 3, to: 0 },
                { type: 'removeItem', itemId: 'berry', quantity: 2 }, { type: 'mergeStack', from: 0, to: 4 },
            ];
            for (let i = 0; i < 408; i++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                const quantity = seed % 25 + 1, itemId = ids[(seed >>> 16) % ids.length];
                const choices: InventoryOperation[] = [{ type: 'addItem', itemId, quantity }, { type: 'removeItem', itemId, quantity },
                    { type: 'moveStack', from: seed % 20, to: (seed >>> 8) % 20 }, { type: 'splitStack', from: seed % 20, to: (seed >>> 8) % 20, quantity },
                    { type: 'mergeStack', from: seed % 20, to: (seed >>> 8) % 20 }];
                const op = i < forced.length ? forced[i] : choices[seed % choices.length];
                const before = JSON.stringify(s), ledgerBefore = new Map(expected), result = apply(s, op);
                if (result.ok) {
                    expect(result.state.metadata.revision).toBe(s.metadata.revision + 1);
                    expect(result.state.inventory.revision).toBe(s.inventory.revision + 1);
                    s = result.state;
                    acceptedTypes.add(op.type);
                    if (op.type === 'addItem' || op.type === 'removeItem') {
                        expected.set(op.itemId, expected.get(op.itemId)! + BigInt(op.quantity) * (op.type === 'addItem' ? 1n : -1n));
                    } else expect(expected).toEqual(ledgerBefore);
                } else { expect(JSON.stringify(s)).toBe(before); expect(expected).toEqual(ledgerBefore); }
                const actual = new Map(ids.map(id => [id, 0n]));
                for (const slot of s.inventory.slots) if (slot) {
                    expect(actual.has(slot.itemId)).toBe(true);
                    actual.set(slot.itemId, actual.get(slot.itemId)! + BigInt(slot.quantity));
                }
                expect(actual).toEqual(expected);
            }
            expect([...acceptedTypes].sort()).toEqual(['addItem', 'mergeStack', 'moveStack', 'removeItem', 'splitStack']);
            return s;
        };
        expect(replay()).toEqual(replay());
    });
    it('conserves multiple full-size item totals near revision limits without Number accumulation', () => {
        const definitions = ITEM_REGISTRY_V1.list(), base = state();
        let s: GameStateV2 = { ...base, metadata: { ...base.metadata, revision: Number.MAX_SAFE_INTEGER - 5 },
            inventory: { ...base.inventory, revision: Number.MAX_SAFE_INTEGER - 5, capacity: 1000,
                slots: Array.from({ length: 1000 }, (_, index) => index === 999 ? null
                    : { itemId: definitions[index % definitions.length].itemId, quantity: definitions[index % definitions.length].maxStack - 1 }) } };
        const totals = (current: GameStateV2) => {
            const result = new Map(definitions.map(item => [item.itemId, 0n]));
            for (const slot of current.inventory.slots) if (slot) result.set(slot.itemId, result.get(slot.itemId)! + BigInt(slot.quantity));
            return result;
        };
        const expected = totals(s), before = JSON.stringify(s);
        expect(apply(s, { type: 'addItem', itemId: 'wood', quantity: Number.MAX_SAFE_INTEGER })).toEqual({ ok: false, code: 'inventory-full' });
        expect(JSON.stringify(s)).toBe(before); expect(totals(s)).toEqual(expected);
        const operations: InventoryOperation[] = [{ type: 'splitStack', from: 0, to: 999, quantity: 1 },
            { type: 'mergeStack', from: 999, to: 0 }, { type: 'addItem', itemId: 'stone', quantity: 1 },
            { type: 'removeItem', itemId: 'seed', quantity: 1 }, { type: 'moveStack', from: 1, to: 999 }];
        for (const op of operations) {
            const prior = s;
            s = accepted(s, op);
            if (op.type === 'addItem' || op.type === 'removeItem') expected.set(op.itemId, expected.get(op.itemId)! + BigInt(op.quantity) * (op.type === 'addItem' ? 1n : -1n));
            expect(totals(s)).toEqual(expected);
            expect(s.metadata.revision).toBe(prior.metadata.revision + 1);
            expect(s.inventory.revision).toBe(prior.inventory.revision + 1);
        }
        expect(s.metadata.revision).toBe(Number.MAX_SAFE_INTEGER);
        expect(s.inventory.revision).toBe(Number.MAX_SAFE_INTEGER);
        const final = JSON.stringify(s), ledger = new Map(expected);
        expect(apply(s, { type: 'removeItem', itemId: 'wood', quantity: 1 })).toEqual({ ok: false, code: 'revision-overflow' });
        expect(JSON.stringify(s)).toBe(final); expect(totals(s)).toEqual(ledger); expect(expected).toEqual(ledger);
    });
});
