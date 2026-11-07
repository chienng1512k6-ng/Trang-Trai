import { isGameStateId, type ValidationResult } from './gameState';

export type ItemCategory = 'material' | 'seed' | 'food';
export interface ItemDefinition {
    readonly itemId: string;
    readonly displayName: string;
    readonly category: ItemCategory;
    readonly stackable: boolean;
    readonly maxStack: number;
}

/** Ordinary data boundary, not a sandbox against adversarial JavaScript Proxies. */
export function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
        && Reflect.ownKeys(value).every(key => typeof key === 'string'
            && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
            && 'value' in Object.getOwnPropertyDescriptor(value, key)!);
}
export function hasExactFields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
    return isPlainDataRecord(value) && Object.keys(value).length === keys.length
        && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

/** Built at application composition, never from mutation request data.
 * Private storage + frozen copies expose no definition-registration mutation. */
export class ItemRegistry {
    readonly #items: ReadonlyMap<string, Readonly<ItemDefinition>>;
    private constructor(definitions: readonly ItemDefinition[]) {
        this.#items = new Map(definitions.map(item => [item.itemId, Object.freeze({ ...item })]));
        Object.freeze(this);
    }
    static create(input: unknown): ValidationResult<ItemRegistry> {
        if (!Array.isArray(input)) return { ok: false, issues: [{ path: '$', message: 'Expected item definitions array.' }] };
        const definitions: ItemDefinition[] = [], ids = new Set<string>();
        for (let index = 0; index < input.length; index++) {
            const item: unknown = input[index];
            if (!hasExactFields(item, ['itemId', 'displayName', 'category', 'stackable', 'maxStack'])
                || !isGameStateId(item.itemId) || ids.has(item.itemId)
                || typeof item.displayName !== 'string' || item.displayName.length < 1 || item.displayName.length > 80
                || item.displayName.trim() !== item.displayName
                || !['material', 'seed', 'food'].some(category => category === item.category)
                || typeof item.stackable !== 'boolean' || typeof item.maxStack !== 'number'
                || !Number.isSafeInteger(item.maxStack) || item.maxStack < 1
                || (!item.stackable && item.maxStack !== 1)) {
                return { ok: false, issues: [{ path: `[${index}]`, message: 'Invalid or duplicate item definition.' }] };
            }
            ids.add(item.itemId);
            definitions.push(item as unknown as ItemDefinition); // Every declared field checked above.
        }
        return { ok: true, value: new ItemRegistry(definitions) };
    }
    get(itemId: string) { return this.#items.get(itemId); }
    list(): readonly Readonly<ItemDefinition>[] { return Object.freeze([...this.#items.values()]); }
}

const prototype = ItemRegistry.create([
    { itemId: 'wood', displayName: 'Wood', category: 'material', stackable: true, maxStack: 99 },
    { itemId: 'stone', displayName: 'Stone', category: 'material', stackable: true, maxStack: 99 },
    { itemId: 'seed', displayName: 'Seed', category: 'seed', stackable: true, maxStack: 50 },
    { itemId: 'berry', displayName: 'Berry', category: 'food', stackable: true, maxStack: 20 },
    { itemId: 'slime-gel', displayName: 'Slime Gel', category: 'material', stackable: true, maxStack: 99 },
]);
if (!prototype.ok) throw new Error('Invalid built-in prototype item definitions.');
export const PROTOTYPE_ITEMS = prototype.value;
