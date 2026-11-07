import { isGameStateId, type StateAuthorityContext, type ValidationResult } from './gameState';
import { hasExactFields, isPlainDataRecord, ItemRegistry, PROTOTYPE_ITEMS } from './items';

export const DEFAULT_INVENTORY_CAPACITY = 20;
/** Explicit prototype allocation budget, not a gameplay expansion entitlement. */
export const MAX_INVENTORY_CAPACITY = 1000;
export interface ItemStack { readonly itemId: string; readonly quantity: number }
export interface InventoryState {
    readonly inventoryId: string;
    readonly ownerId: string;
    readonly revision: number;
    readonly capacity: number;
    /** Dense zero-based slots; null alone denotes an empty slot. */
    readonly slots: readonly (ItemStack | null)[];
}
export type InventoryOperation = { readonly type: 'addItem'; readonly itemId: string; readonly quantity: number }
    | { readonly type: 'removeItem'; readonly itemId: string; readonly quantity: number }
    | { readonly type: 'moveStack'; readonly from: number; readonly to: number }
    | { readonly type: 'mergeStack'; readonly from: number; readonly to: number }
    | { readonly type: 'splitStack'; readonly from: number; readonly to: number; readonly quantity: number };
export type InventoryCommand = InventoryOperation & { readonly inventoryId: string; readonly expectedRevision: number };
export type InventoryErrorCode = 'invalid-state' | 'invalid-command' | 'invalid-context' | 'invalid-quantity'
    | 'invalid-slot' | 'unknown-item' | 'inventory-full' | 'insufficient-items' | 'empty-slot'
    | 'occupied-slot' | 'incompatible-item' | 'stack-limit' | 'same-slot' | 'split-requires-remainder'
    | 'forbidden' | 'wrong-target' | 'revision-conflict' | 'revision-overflow' | 'quantity-change-not-authorized';
export type InventoryResult = { readonly ok: true; readonly state: InventoryState }
    | { readonly ok: false; readonly code: InventoryErrorCode };
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const counter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validCapacity = (value: unknown): value is number => positive(value) && value <= MAX_INVENTORY_CAPACITY;
const fail = (code: InventoryErrorCode): InventoryResult => ({ ok: false, code });

export function validateInventoryState(input: unknown, registry: ItemRegistry = PROTOTYPE_ITEMS): ValidationResult<InventoryState> {
    const invalid = (path: string, message: string): ValidationResult<InventoryState> => ({ ok: false, issues: [{ path, message }] });
    if (!hasExactFields(input, ['inventoryId', 'ownerId', 'revision', 'capacity', 'slots'])
        || !isGameStateId(input.inventoryId) || !isGameStateId(input.ownerId) || !counter(input.revision)
        || !validCapacity(input.capacity) || !Array.isArray(input.slots) || input.slots.length !== input.capacity
        || Reflect.ownKeys(input.slots).length !== input.capacity + 1) return invalid('$', 'Invalid inventory envelope or slot count.');
    const slots: (ItemStack | null)[] = [];
    for (let index = 0; index < input.capacity; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(input.slots, String(index));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return invalid(`slots[${index}]`, 'Expected dense data slots.');
        const slot: unknown = descriptor.value;
        if (slot === null) { slots.push(null); continue; }
        if (!hasExactFields(slot, ['itemId', 'quantity']) || !isGameStateId(slot.itemId) || !positive(slot.quantity)) {
            return invalid(`slots[${index}]`, 'Invalid item stack.');
        }
        const definition = registry.get(slot.itemId);
        if (!definition || slot.quantity > definition.maxStack) return invalid(`slots[${index}]`, 'Unknown item or stack limit exceeded.');
        slots.push({ itemId: slot.itemId, quantity: slot.quantity });
    }
    return { ok: true, value: { inventoryId: input.inventoryId, ownerId: input.ownerId, revision: input.revision, capacity: input.capacity, slots } };
}
export function createInventory(inventoryId: string, ownerId: string, capacity = DEFAULT_INVENTORY_CAPACITY): ValidationResult<InventoryState> {
    if (!validCapacity(capacity)) return { ok: false, issues: [{ path: 'capacity', message: 'Expected capacity 1–1000.' }] };
    return validateInventoryState({ inventoryId, ownerId, revision: 0, capacity, slots: Array(capacity).fill(null) });
}

const operationFields = {
    addItem: ['type', 'itemId', 'quantity'], removeItem: ['type', 'itemId', 'quantity'],
    moveStack: ['type', 'from', 'to'], splitStack: ['type', 'from', 'to', 'quantity'], mergeStack: ['type', 'from', 'to'],
} as const;
function parseOperation(input: unknown, command = false): { ok: true; operation: InventoryOperation } | { ok: false; code: InventoryErrorCode } {
    if (!isPlainDataRecord(input) || typeof input.type !== 'string'
        || !Object.prototype.hasOwnProperty.call(operationFields, input.type)) return { ok: false, code: 'invalid-command' };
    const type = input.type as InventoryOperation['type'];
    if (!hasExactFields(input, [...operationFields[type], ...(command ? ['inventoryId', 'expectedRevision'] : [])])) return { ok: false, code: 'invalid-command' };
    if (type === 'addItem' || type === 'removeItem') {
        if (!isGameStateId(input.itemId)) return { ok: false, code: 'unknown-item' };
    } else if (!counter(input.from) || !counter(input.to)) return { ok: false, code: 'invalid-slot' };
    if ((type === 'addItem' || type === 'removeItem' || type === 'splitStack') && !positive(input.quantity)) return { ok: false, code: 'invalid-quantity' };
    // Shape and all operation fields validated; application metadata is never a definition.
    return { ok: true, operation: input as unknown as InventoryOperation };
}

function mutate(input: unknown, request: unknown, registry: ItemRegistry): InventoryResult {
    const validated = validateInventoryState(input, registry);
    if (!validated.ok) return fail('invalid-state');
    const parsed = parseOperation(request);
    if (!parsed.ok) return parsed;
    const state = validated.value, operation = parsed.operation;
    if (state.revision === Number.MAX_SAFE_INTEGER) return fail('revision-overflow');
    // Detached candidate: failures discard all tentative writes, including partial fills/removals.
    const slots = state.slots.map(slot => slot === null ? null : { ...slot });
    if (operation.type === 'addItem' || operation.type === 'removeItem') {
        const definition = registry.get(operation.itemId);
        if (!definition) return fail('unknown-item');
        let remaining = operation.quantity;
        for (let index = 0; index < slots.length && remaining > 0; index++) {
            const slot = slots[index];
            if (slot?.itemId !== operation.itemId) continue;
            const amount = Math.min(remaining, operation.type === 'addItem' ? definition.maxStack - slot.quantity : slot.quantity);
            const quantity = slot.quantity + (operation.type === 'addItem' ? amount : -amount);
            slots[index] = quantity === 0 ? null : { itemId: operation.itemId, quantity };
            remaining -= amount;
        }
        if (operation.type === 'addItem') {
            for (let index = 0; index < slots.length && remaining > 0; index++) {
                if (slots[index] !== null) continue;
                const quantity = Math.min(remaining, definition.maxStack);
                slots[index] = { itemId: operation.itemId, quantity }; remaining -= quantity;
            }
        }
        if (remaining > 0) return fail(operation.type === 'addItem' ? 'inventory-full' : 'insufficient-items');
    } else {
        const { from, to } = operation;
        if (from >= state.capacity || to >= state.capacity) return fail('invalid-slot');
        if (from === to) return fail('same-slot');
        const source = slots[from], target = slots[to];
        if (source === null) return fail('empty-slot');
        if (operation.type === 'moveStack') {
            if (target !== null) return fail('occupied-slot');
            slots[to] = source; slots[from] = null;
        } else if (operation.type === 'splitStack') {
            if (target !== null) return fail('occupied-slot');
            if (operation.quantity >= source.quantity) return fail('split-requires-remainder');
            slots[to] = { itemId: source.itemId, quantity: operation.quantity };
            slots[from] = { itemId: source.itemId, quantity: source.quantity - operation.quantity };
        } else {
            if (target === null) return fail('empty-slot');
            if (source.itemId !== target.itemId) return fail('incompatible-item');
            const definition = registry.get(source.itemId)!; // Validated source/target definitions above.
            if (source.quantity > definition.maxStack - target.quantity) return fail('stack-limit');
            slots[to] = { itemId: source.itemId, quantity: target.quantity + source.quantity }; slots[from] = null;
        }
    }
    return { ok: true, state: { ...state, revision: state.revision + 1, slots } };
}

/** Domain primitives: caller must authorize the item source/sink separately. */
export const addItem = (state: unknown, itemId: string, quantity: number, registry = PROTOTYPE_ITEMS) => mutate(state, { type: 'addItem', itemId, quantity }, registry);
export const removeItem = (state: unknown, itemId: string, quantity: number, registry = PROTOTYPE_ITEMS) => mutate(state, { type: 'removeItem', itemId, quantity }, registry);
export const moveStack = (state: unknown, from: number, to: number, registry = PROTOTYPE_ITEMS) => mutate(state, { type: 'moveStack', from, to }, registry);
export const splitStack = (state: unknown, from: number, to: number, quantity: number, registry = PROTOTYPE_ITEMS) => mutate(state, { type: 'splitStack', from, to, quantity }, registry);
export const mergeStack = (state: unknown, from: number, to: number, registry = PROTOTYPE_ITEMS) => mutate(state, { type: 'mergeStack', from, to }, registry);

export interface InventoryAuthorityContext extends Pick<StateAuthorityContext, 'ownerId'> {
    /** Supplied by the caller's verified source/sink policy, never copied from client intent.
     * Local context remains forgeable; this is not an entitlement service or durable permit. */
    readonly authorizedQuantityChange?: {
        readonly type: 'addItem' | 'removeItem'; readonly itemId: string; readonly quantity: number;
    };
}
/** Optional application boundary. A future authenticated service must derive
 * quantity authorization from actual source/sink rules before calling. */
export function applyInventoryCommand(input: unknown, request: unknown, context: InventoryAuthorityContext,
    registry = PROTOTYPE_ITEMS): InventoryResult {
    const validated = validateInventoryState(input, registry);
    if (!validated.ok) return fail('invalid-state');
    const parsed = parseOperation(request, true);
    if (!parsed.ok) return parsed;
    if (!isPlainDataRecord(request) || !isGameStateId(request.inventoryId) || !counter(request.expectedRevision)) return fail('invalid-command');
    if (!isGameStateId(context.ownerId)) return fail('invalid-context');
    if (context.ownerId !== validated.value.ownerId) return fail('forbidden');
    if (request.inventoryId !== validated.value.inventoryId) return fail('wrong-target');
    if (request.expectedRevision !== validated.value.revision) return fail('revision-conflict');
    // Explicit projection rejects client definitions/extra fields rather than trusting them.
    const { operation } = parsed;
    if (operation.type === 'addItem' || operation.type === 'removeItem') {
        const authorized = context.authorizedQuantityChange;
        if (!authorized || authorized.type !== operation.type || authorized.itemId !== operation.itemId
            || authorized.quantity !== operation.quantity) return fail('quantity-change-not-authorized');
    }
    switch (operation.type) {
        case 'addItem': return addItem(validated.value, operation.itemId, operation.quantity, registry);
        case 'removeItem': return removeItem(validated.value, operation.itemId, operation.quantity, registry);
        case 'moveStack': return moveStack(validated.value, operation.from, operation.to, registry);
        case 'splitStack': return splitStack(validated.value, operation.from, operation.to, operation.quantity, registry);
        case 'mergeStack': return mergeStack(validated.value, operation.from, operation.to, registry);
    }
}
