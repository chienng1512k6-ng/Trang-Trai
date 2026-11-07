import { describe, expect, it } from 'vitest';
import { ItemRegistry, PROTOTYPE_ITEMS, type ItemDefinition } from './items';
import { addItem, applyInventoryCommand, createInventory, mergeStack, moveStack, removeItem, splitStack,
    validateInventoryState, type InventoryOperation, type InventoryResult, type InventoryState, type ItemStack } from './inventory';
import { serializeGameState } from './gameStatePersistence';

const definition = (overrides: Partial<ItemDefinition> = {}): ItemDefinition => ({ itemId: 'wood', displayName: 'Wood',
    category: 'material', stackable: true, maxStack: 5, ...overrides });
const registryResult = ItemRegistry.create([definition(), definition({ itemId: 'stone', displayName: 'Stone' }),
    definition({ itemId: 'relic', displayName: 'Relic', stackable: false, maxStack: 1 })]);
if (!registryResult.ok) throw new Error('Invalid test registry');
const registry = registryResult.value;
const wood = (quantity: number): ItemStack => ({ itemId: 'wood', quantity });
const stone = (quantity: number): ItemStack => ({ itemId: 'stone', quantity });
const inventory = (slots: readonly (ItemStack | null)[] = [null, null, null], revision = 0): InventoryState =>
    ({ inventoryId: 'inventory-1', ownerId: 'owner-1', revision, capacity: slots.length, slots });
function success(result: InventoryResult) { if (!result.ok) throw new Error(result.code); return result.state; }
function frozen(input: InventoryState) {
    for (const slot of input.slots) if (slot) Object.freeze(slot);
    Object.freeze(input.slots); return Object.freeze(input);
}
function total(state: InventoryState, itemId: string) {
    return state.slots.reduce((sum, slot) => sum + (slot?.itemId === itemId ? BigInt(slot.quantity) : 0n), 0n);
}
function command(state: InventoryState, operation: InventoryOperation) {
    return applyInventoryCommand(state, { ...operation, inventoryId: state.inventoryId, expectedRevision: state.revision },
        { ownerId: state.ownerId, authorizedQuantityChange: operation.type === 'addItem' || operation.type === 'removeItem' ? operation : undefined }, registry);
}

describe('item registry definitions', () => {
    it('contains the five requested prototype items, uniquely defined with valid stack rules', () => {
        expect(PROTOTYPE_ITEMS.list().map(item => item.displayName)).toEqual(['Wood', 'Stone', 'Seed', 'Berry', 'Slime Gel']);
        expect(new Set(PROTOTYPE_ITEMS.list().map(item => item.itemId)).size).toBe(5);
        expect(ItemRegistry.create(PROTOTYPE_ITEMS.list()).ok).toBe(true);
        expect(PROTOTYPE_ITEMS.get('missing')).toBeUndefined();
    });
    it('rejects duplicates instead of choosing one definition', () => {
        expect(ItemRegistry.create([definition(), definition({ maxStack: 10 })])).toMatchObject({ ok: false, issues: [{ path: '[1]' }] });
    });
    it.each([NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, '5'])('rejects invalid maxStack %s', maxStack => {
        expect(ItemRegistry.create([{ ...definition(), maxStack }]).ok).toBe(false);
    });
    it('enforces non-stackable maxStack=1 and validates definition shape, names and identity', () => {
        expect(ItemRegistry.create([definition({ stackable: false, maxStack: 1 })]).ok).toBe(true);
        for (const item of [definition({ stackable: false, maxStack: 2 }), definition({ itemId: '' }),
            definition({ displayName: ' ' }), definition({ displayName: 'a'.repeat(81) }),
            { ...definition(), category: 'weapon-stats' }, { ...definition(), stackable: 1 }, { ...definition(), price: 10 }]) {
            expect(ItemRegistry.create([item]).ok).toBe(false);
        }
        expect(ItemRegistry.create(null).ok).toBe(false);
    });
    it('detaches and freezes definitions so callers cannot alter stack limits', () => {
        const item = definition(); const built = ItemRegistry.create([item]); if (!built.ok) throw new Error('Expected registry');
        Object.assign(item, { maxStack: 100 });
        expect(built.value.get('wood')?.maxStack).toBe(5);
        expect(Object.isFrozen(built.value.get('wood'))).toBe(true);
        expect(Object.isFrozen(built.value.list())).toBe(true);
        expect(() => Object.assign(built.value.get('wood')!, { maxStack: 100 })).toThrow();
    });
});

describe('inventory state validation', () => {
    it('creates 20 dense null slots by default, configurable without a browser', () => {
        const result = createInventory('inventory-1', 'owner-1'); if (!result.ok) throw new Error('Expected inventory');
        expect(result.value).toEqual({ inventoryId: 'inventory-1', ownerId: 'owner-1', revision: 0, capacity: 20, slots: Array(20).fill(null) });
        expect(createInventory('inventory-1', 'owner-1', 1)).toMatchObject({ ok: true, value: { capacity: 1, slots: [null] } });
        expect(createInventory('inventory-1', 'owner-1', 1000).ok).toBe(true);
        expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
    });
    it.each([0, -1, 0.1, NaN, Infinity, 1001, Number.MAX_SAFE_INTEGER])('rejects unsafe/unsupported capacity %s before allocation', capacity => {
        expect(createInventory('inventory-1', 'owner-1', capacity).ok).toBe(false);
    });
    it('requires exact identity/revision/slot shape and refuses unknown or overfull stacks', () => {
        for (const state of [null, [], { ...inventory(), inventoryId: ' bad' }, { ...inventory(), ownerId: '' },
            { ...inventory(), revision: -1 }, { ...inventory(), revision: 0.1 }, { ...inventory(), capacity: 2 },
            inventory([undefined as unknown as null]), inventory([wood(0)]), inventory([wood(6)]),
            inventory([{ itemId: 'missing', quantity: 1 }]), inventory([{ itemId: 'relic', quantity: 2 }]),
            { ...inventory(), sprite: {} }, { ...inventory([wood(1)]), slots: [{ ...wood(1), displayName: 'forged' }] }]) {
            expect(validateInventoryState(state, registry).ok).toBe(false);
        }
    });
    it('rejects sparse/accessor slots and does not silently repair input', () => {
        expect(validateInventoryState(inventory(Array(3)), registry).ok).toBe(false);
        let reads = 0; const slots: (ItemStack | null)[] = [null];
        Object.defineProperty(slots, '0', { enumerable: true, get: () => { reads++; return wood(1); } });
        expect(validateInventoryState(inventory(slots), registry).ok).toBe(false); expect(reads).toBe(0);
        const bad = frozen(inventory([wood(-1)])); expect(validateInventoryState(bad, registry).ok).toBe(false);
        expect(bad.slots[0]?.quantity).toBe(-1);
    });
    it('validates into a detached JSON-shaped DTO and does not extend GameState v1', () => {
        const input = inventory([wood(2), null]); const result = validateInventoryState(input, registry);
        if (!result.ok) throw new Error('Expected validation success');
        expect(result.value).not.toBe(input); expect(result.value.slots).not.toBe(input.slots);
        expect(result.value.slots[0]).not.toBe(input.slots[0]);
        expect(JSON.parse(JSON.stringify(result.value))).toEqual(input);
        expect(serializeGameState(result.value)).toMatchObject({ ok: false, code: 'invalid-state' });
    });
});

describe('atomic inventory mutations', () => {
    it('adds to existing stacks before empty slots, in ascending order, distributing above maxStack', () => {
        const input = frozen(inventory([wood(4), null, stone(2), null]));
        const state = success(addItem(input, 'wood', 7, registry));
        expect(state.slots).toEqual([wood(5), wood(5), stone(2), wood(1)]);
        expect(state.revision).toBe(1); expect(total(state, 'wood') - total(input, 'wood')).toBe(7n);
        expect(input.slots).toEqual([wood(4), null, stone(2), null]);
    });
    it('adds to completely empty inventory and handles exact capacity', () => {
        expect(success(addItem(inventory(), 'wood', 15, registry)).slots).toEqual([wood(5), wood(5), wood(5)]);
        expect(addItem(inventory([wood(5)]), 'stone', 1, registry)).toEqual({ ok: false, code: 'inventory-full' });
    });
    it('fails all-or-nothing when full or when a partial fill would still leave excess', () => {
        for (const input of [frozen(inventory([wood(5)])), frozen(inventory([wood(4), null]))]) {
            const before = JSON.stringify(input);
            expect(addItem(input, 'wood', 7, registry)).toEqual({ ok: false, code: 'inventory-full' });
            expect(JSON.stringify(input)).toBe(before);
        }
    });
    it('puts non-stackable quantities into distinct slots and rejects insufficient capacity', () => {
        expect(success(addItem(inventory(), 'relic', 2, registry)).slots).toEqual([
            { itemId: 'relic', quantity: 1 }, { itemId: 'relic', quantity: 1 }, null,
        ]);
        expect(addItem(inventory([null]), 'relic', 2, registry)).toEqual({ ok: false, code: 'inventory-full' });
    });
    it('removes across stacks deterministically and clears zero stacks to null', () => {
        const input = frozen(inventory([wood(2), stone(1), wood(5)]));
        const state = success(removeItem(input, 'wood', 4, registry));
        expect(state.slots).toEqual([null, stone(1), wood(3)]); expect(state.revision).toBe(1);
        expect(total(input, 'wood') - total(state, 'wood')).toBe(4n);
        expect(success(removeItem(state, 'wood', 3, registry)).slots).toEqual([null, stone(1), null]);
    });
    it('rejects over-removal and never creates items by removing/rearranging empty inventory', () => {
        const input = frozen(inventory([wood(2), wood(1)]));
        expect(removeItem(input, 'wood', 4, registry)).toEqual({ ok: false, code: 'insufficient-items' });
        expect(input).toEqual(inventory([wood(2), wood(1)]));
        expect(removeItem(inventory(), 'wood', 1, registry)).toEqual({ ok: false, code: 'insufficient-items' });
        for (const result of [moveStack(inventory(), 0, 1, registry), splitStack(inventory(), 0, 1, 1, registry),
            mergeStack(inventory(), 0, 1, registry)]) expect(result).toEqual({ ok: false, code: 'empty-slot' });
    });
    it('moves a whole stack to empty space without merging/swapping and without aliasing', () => {
        const input = frozen(inventory([wood(4), null, stone(1)])); const state = success(moveStack(input, 0, 1, registry));
        expect(state.slots).toEqual([null, wood(4), stone(1)]); expect(state.slots[1]).not.toBe(input.slots[0]);
        expect(moveStack(input, 0, 2, registry)).toEqual({ ok: false, code: 'occupied-slot' });
    });
    it('splits into an empty slot with a positive source remainder', () => {
        const input = frozen(inventory([wood(5), null])); const state = success(splitStack(input, 0, 1, 2, registry));
        expect(state.slots).toEqual([wood(3), wood(2)]); expect(state.revision).toBe(1);
        for (const quantity of [5, 6]) expect(splitStack(input, 0, 1, quantity, registry)).toEqual({ ok: false, code: 'split-requires-remainder' });
        expect(splitStack(inventory([wood(5), stone(1)]), 0, 1, 2, registry)).toEqual({ ok: false, code: 'occupied-slot' });
    });
    it('merges compatible stacks completely and rejects partial/incompatible/empty targets', () => {
        const input = frozen(inventory([wood(2), wood(3)]));
        expect(success(mergeStack(input, 0, 1, registry)).slots).toEqual([null, wood(5)]);
        expect(mergeStack(inventory([wood(3), wood(3)]), 0, 1, registry)).toEqual({ ok: false, code: 'stack-limit' });
        expect(mergeStack(inventory([wood(2), stone(1)]), 0, 1, registry)).toEqual({ ok: false, code: 'incompatible-item' });
        expect(mergeStack(inventory([wood(2), null]), 0, 1, registry)).toEqual({ ok: false, code: 'empty-slot' });
        expect(mergeStack(inventory([{ itemId: 'relic', quantity: 1 }, { itemId: 'relic', quantity: 1 }]), 0, 1, registry)).toEqual({ ok: false, code: 'stack-limit' });
    });
    it.each([NaN, Infinity, -Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid quantity %s without revision change', quantity => {
        const input = frozen(inventory([wood(3), null]));
        for (const result of [addItem(input, 'wood', quantity, registry), removeItem(input, 'wood', quantity, registry),
            splitStack(input, 0, 1, quantity, registry)]) expect(result).toEqual({ ok: false, code: 'invalid-quantity' });
        expect(input.revision).toBe(0); expect(input.slots).toEqual([wood(3), null]);
    });
    it.each([-1, 3, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects out-of-range/invalid slot %s for either endpoint', slot => {
        const input = frozen(inventory([wood(3), null, wood(1)]));
        for (const [from, to] of [[slot, 1], [0, slot]]) {
            for (const result of [moveStack(input, from, to, registry), splitStack(input, from, to, 1, registry),
                mergeStack(input, from, to, registry)]) expect(result).toEqual({ ok: false, code: 'invalid-slot' });
        }
    });
    it('rejects same-slot no-ops, unknown IDs, invalid states and exhausted revisions', () => {
        const input = frozen(inventory([wood(3), null]));
        for (const result of [moveStack(input, 0, 0, registry), splitStack(input, 0, 0, 1, registry), mergeStack(input, 0, 0, registry)]) {
            expect(result).toEqual({ ok: false, code: 'same-slot' });
        }
        expect(addItem(input, 'missing', 1, registry)).toEqual({ ok: false, code: 'unknown-item' });
        expect(removeItem(input, 'missing', 1, registry)).toEqual({ ok: false, code: 'unknown-item' });
        expect(addItem(inventory([wood(6)]), 'wood', 1, registry)).toEqual({ ok: false, code: 'invalid-state' });
        expect(addItem(inventory([null], Number.MAX_SAFE_INTEGER), 'wood', 1, registry)).toEqual({ ok: false, code: 'revision-overflow' });
        expect(success(addItem(inventory([null], Number.MAX_SAFE_INTEGER - 1), 'wood', 1, registry)).revision).toBe(Number.MAX_SAFE_INTEGER);
    });
    it('avoids numeric overflow with maximum-size stacks and aggregate totals larger than a safe Number', () => {
        const built = ItemRegistry.create([definition({ maxStack: Number.MAX_SAFE_INTEGER })]); if (!built.ok) throw new Error('Expected registry');
        const large = Number.MAX_SAFE_INTEGER;
        const input = frozen(inventory([wood(large), wood(large), null]));
        expect(mergeStack(input, 0, 1, built.value)).toEqual({ ok: false, code: 'stack-limit' });
        const added = success(addItem(input, 'wood', large, built.value));
        expect(total(added, 'wood')).toBe(BigInt(large) * 3n);
        const removed = success(removeItem(added, 'wood', large, built.value));
        expect(total(removed, 'wood')).toBe(BigInt(large) * 2n);
        expect(validateInventoryState(removed, built.value).ok).toBe(true);
    });
});

describe('application boundary and invariant traces', () => {
    it('requires separate exact source/sink quantity authorization, not an owner-only client request', () => {
        const state = inventory([wood(3), null]);
        for (const operation of [{ type: 'addItem', itemId: 'wood', quantity: 2 }, { type: 'removeItem', itemId: 'wood', quantity: 2 }] as const) {
            const request = { ...operation, inventoryId: state.inventoryId, expectedRevision: state.revision };
            for (const authorizedQuantityChange of [undefined, { ...operation, quantity: 1 },
                { ...operation, itemId: 'stone' }, { ...operation, type: operation.type === 'addItem' ? 'removeItem' as const : 'addItem' as const }]) {
                expect(applyInventoryCommand(state, request, { ownerId: state.ownerId, authorizedQuantityChange }, registry))
                    .toEqual({ ok: false, code: 'quantity-change-not-authorized' });
            }
            expect(command(state, operation).ok).toBe(true);
        }
    });
    it('checks owner, target and revision; client definition overrides/unknown fields are rejected', () => {
        const input = frozen(inventory()); const request = { type: 'addItem', itemId: 'wood', quantity: 1, inventoryId: input.inventoryId, expectedRevision: 0 };
        expect(applyInventoryCommand(input, request, { ownerId: 'other' }, registry)).toEqual({ ok: false, code: 'forbidden' });
        expect(applyInventoryCommand(input, request, { ownerId: '' }, registry)).toEqual({ ok: false, code: 'invalid-context' });
        for (const [extra, code] of [[{ inventoryId: 'other' }, 'wrong-target'], [{ expectedRevision: 1 }, 'revision-conflict'],
            [{ expectedRevision: NaN }, 'invalid-command'], [{ maxStack: 999 }, 'invalid-command'],
            [{ itemDefinition: definition() }, 'invalid-command'], [{ ownerId: 'owner-1' }, 'invalid-command'],
            [{ type: 'trade' }, 'invalid-command']] as const) {
            expect(applyInventoryCommand(input, { ...request, ...extra }, { ownerId: input.ownerId }, registry)).toEqual({ ok: false, code });
        }
        expect(applyInventoryCommand(input, null, { ownerId: input.ownerId }, registry)).toEqual({ ok: false, code: 'invalid-command' });
    });
    it('runs all five commands with exactly one revision each and rejects stale replay', () => {
        let state = inventory();
        const operations: InventoryOperation[] = [{ type: 'addItem', itemId: 'wood', quantity: 5 },
            { type: 'splitStack', from: 0, to: 1, quantity: 2 }, { type: 'moveStack', from: 1, to: 2 },
            { type: 'mergeStack', from: 2, to: 0 }, { type: 'removeItem', itemId: 'wood', quantity: 5 }];
        for (const operation of operations) {
            const previous = frozen(state); const result = success(command(previous, operation));
            expect(result.revision).toBe(previous.revision + 1); expect(validateInventoryState(result, registry).ok).toBe(true);
            expect(command(previous, operation)).toEqual({ ok: true, state: result });
            expect(applyInventoryCommand(result, { ...operation, inventoryId: result.inventoryId, expectedRevision: previous.revision },
                { ownerId: result.ownerId }, registry)).toEqual({ ok: false, code: 'revision-conflict' });
            state = result;
        }
        expect(state.slots).toEqual([null, null, null]); expect(state.revision).toBe(5);
    });
    it('preserves quantities and revision invariants through a reproducible 600-operation trace', () => {
        let seed = 73471, state = success(addItem(inventory(Array(8).fill(null)), 'wood', 17, registry));
        state = success(addItem(state, 'stone', 11, registry));
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
        const kinds = ['addItem', 'removeItem', 'moveStack', 'splitStack', 'mergeStack'] as const;
        for (let index = 0; index < 600; index++) {
            const kind = kinds[random() % kinds.length], itemId = random() % 2 ? 'wood' : 'stone', quantity = random() % 8 + 1;
            const from = random() % 8, to = random() % 8;
            const operation: InventoryOperation = kind === 'addItem' || kind === 'removeItem' ? { type: kind, itemId, quantity }
                : kind === 'splitStack' ? { type: kind, from, to, quantity } : { type: kind, from, to };
            const previous = frozen(state), bytes = JSON.stringify(previous), result = command(previous, operation);
            expect(command(previous, operation)).toEqual(result); expect(JSON.stringify(previous)).toBe(bytes);
            if (!result.ok) { expect(previous.revision).toBe(state.revision); continue; }
            expect(validateInventoryState(result.state, registry).ok).toBe(true);
            expect(result.state.revision).toBe(previous.revision + 1);
            for (const id of ['wood', 'stone']) {
                const change = (kind === 'addItem' ? BigInt(quantity) : kind === 'removeItem' ? -BigInt(quantity) : 0n);
                expect(total(result.state, id) - total(previous, id)).toBe(id === itemId ? change : 0n);
            }
            state = result.state;
        }
    });
});
