import { advanceLogicalTime, isGameStateId, validateGameState, type GameState,
    type StateAuthorityContext, type StateTransitionResult, type ValidationIssue, type ValidationResult } from './gameState';
import { applyInventoryCommand, validateInventoryState, type InventoryAuthorityContext,
    type InventoryCommand, type InventoryErrorCode, type InventoryState } from './inventory';
import { hasExactFields, isPlainDataRecord, ItemRegistry } from './items';
import { parseBoundedJson, type JsonFailure } from './boundedJson';

export const GAME_STATE_V2_SCHEMA_VERSION = 2 as const;
export const ITEM_REGISTRY_V1_VERSION = 1 as const;
/** Pinned catalog release 1: wood 99, stone 99, seed 50, berry 20, slime-gel 99.
 * Keep this binding immutable; future catalog releases need a separate migration. */
const catalogV1 = ItemRegistry.create([
    { itemId: 'wood', displayName: 'Wood', category: 'material', stackable: true, maxStack: 99 },
    { itemId: 'stone', displayName: 'Stone', category: 'material', stackable: true, maxStack: 99 },
    { itemId: 'seed', displayName: 'Seed', category: 'seed', stackable: true, maxStack: 50 },
    { itemId: 'berry', displayName: 'Berry', category: 'food', stackable: true, maxStack: 20 },
    { itemId: 'slime-gel', displayName: 'Slime Gel', category: 'material', stackable: true, maxStack: 99 },
]);
if (!catalogV1.ok) throw new Error('Invalid pinned catalog release 1.');
export const ITEM_REGISTRY_V1 = catalogV1.value;
export interface GameStateV2 extends Omit<GameState, 'schemaVersion'> {
    readonly schemaVersion: typeof GAME_STATE_V2_SCHEMA_VERSION;
    readonly itemRegistryVersion: typeof ITEM_REGISTRY_V1_VERSION;
    readonly inventory: InventoryState;
}
const rootFields = ['schemaVersion', 'gameId', 'farmId', 'ownerId', 'logicalTimeMs', 'metadata', 'itemRegistryVersion', 'inventory'];
const counter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** Project only after exact v2 shape validation; never pass v2 through a v1 save. */
function legacyEnvelope(state: GameStateV2): GameState {
    return { schemaVersion: 1, gameId: state.gameId, farmId: state.farmId, ownerId: state.ownerId,
        logicalTimeMs: state.logicalTimeMs, metadata: state.metadata };
}
export interface V2ValidationFailure {
    readonly ok: false; readonly code: 'invalid-state' | 'invalid-revision';
    readonly issues: readonly ValidationIssue[];
}
export type V2ValidationResult = Extract<ValidationResult<GameStateV2>, { ok: true }> | V2ValidationFailure;
export function validateGameStateV2(input: unknown): V2ValidationResult {
    const invalid = (path: string, message: string): V2ValidationFailure => ({ ok: false, code: 'invalid-state', issues: [{ path, message }] });
    if (!hasExactFields(input, rootFields)) return invalid('$', 'Expected exactly the v2 data fields.');
    if (input.schemaVersion !== 2) return invalid('schemaVersion', 'Expected schema 2.');
    if (input.itemRegistryVersion !== 1) return invalid('itemRegistryVersion', 'Unsupported pinned catalog.');
    // Deterministic precedence: root shape/version/catalog first, then revision
    // fields (outer before inner), then ordinary envelope/inventory validation.
    // Inspect only plain own data records; never read accessors for classification.
    const revisions: ValidationIssue[] = [];
    const metadata = isPlainDataRecord(input.metadata) ? input.metadata : undefined;
    const nested = isPlainDataRecord(input.inventory) ? input.inventory : undefined;
    for (const [record, path] of [[metadata, 'metadata.revision'], [nested, 'inventory.revision']] as const) {
        if (record && Object.prototype.hasOwnProperty.call(record, 'revision') && !counter(record.revision)) {
            revisions.push({ path, message: 'Expected a nonnegative safe integer revision.' });
        }
    }
    if (metadata && nested && counter(metadata.revision) && counter(nested.revision) && nested.revision > metadata.revision) {
        revisions.push({ path: 'inventory.revision', message: 'Inventory revision exceeds aggregate revision.' });
    }
    if (revisions.length) return { ok: false, code: 'invalid-revision', issues: revisions };
    const envelope = validateGameState({ schemaVersion: 1, gameId: input.gameId, farmId: input.farmId,
        ownerId: input.ownerId, logicalTimeMs: input.logicalTimeMs, metadata: input.metadata });
    if (!envelope.ok) return { ...envelope, code: 'invalid-state' };
    const inventory = validateInventoryState(input.inventory, ITEM_REGISTRY_V1);
    if (!inventory.ok) return { ok: false, code: 'invalid-state', issues: inventory.issues.map(issue => ({ ...issue,
        path: issue.path === '$' ? 'inventory' : `inventory.${issue.path}` })) };
    if (inventory.value.inventoryId !== 'farm-main' || inventory.value.ownerId !== envelope.value.ownerId) {
        return invalid('inventory', 'Expected farm-main with matching aggregate owner.');
    }
    const { revision, createdAtLogicalMs, updatedAtLogicalMs } = envelope.value.metadata;
    return { ok: true, value: { ...envelope.value, schemaVersion: 2,
        metadata: { revision, createdAtLogicalMs, updatedAtLogicalMs },
        itemRegistryVersion: 1, inventory: inventory.value } };
}

export type V2Failure = V2ValidationFailure | { readonly ok: false; readonly code: 'unsupported-schema' | 'incompatible-registry'
    | 'revision-overflow' | 'identity-mismatch' | 'invalid-identity' };
/** Pure, detached preparation. No receipt claims a storage commit occurred. */
export function prepareV1Migration(input: unknown): { readonly ok: true; readonly state: GameStateV2 } | V2Failure {
    const validated = validateGameState(input);
    if (!validated.ok) return { ...validated,
        code: validated.issues.some(issue => issue.path === 'metadata.revision') ? 'invalid-revision' : 'invalid-state' };
    const state = validated.value;
    if (state.metadata.revision === Number.MAX_SAFE_INTEGER) return { ok: false, code: 'revision-overflow' };
    const candidate = { ...state, schemaVersion: 2, itemRegistryVersion: 1,
        metadata: { ...state.metadata, revision: state.metadata.revision + 1 },
        inventory: { inventoryId: 'farm-main', ownerId: state.ownerId, revision: 0,
            capacity: 20, slots: Array<null>(20).fill(null) } };
    const result = validateGameStateV2(candidate);
    return result.ok ? { ok: true, state: result.value } : result;
}
export interface GameStateIdentity { readonly gameId: string; readonly farmId: string; readonly ownerId: string }
export type VersionedSnapshotResult = JsonFailure | V2Failure
    | { readonly ok: true; readonly status: 'accepted'; readonly state: GameStateV2; readonly source: string }
    | { readonly ok: true; readonly status: 'migration-required'; readonly state: GameStateV2;
        readonly source: string; readonly sourceVersion: 1; readonly sourceRevision: number; readonly target: string };

/** Lexical gate precedes version dispatch. Does not write, activate or repair a snapshot.
 * Optional expected identity is supplied by a future storage/application boundary. */
export function parseVersionedGameState(source: string, expected?: GameStateIdentity): VersionedSnapshotResult {
    const parsed = parseBoundedJson(source);
    if (!parsed.ok) return parsed;
    const input = parsed.value;
    if (!isPlainDataRecord(input)) return { ok: false, code: 'invalid-state', issues: [{ path: '$', message: 'Expected a plain snapshot record.' }] };
    if (input.schemaVersion !== 1 && input.schemaVersion !== 2) return { ok: false, code: 'unsupported-schema' };
    if (input.schemaVersion === 2 && input.itemRegistryVersion !== 1) return { ok: false, code: 'incompatible-registry' };
    const result = input.schemaVersion === 1 ? prepareV1Migration(input)
        : (() => { const v = validateGameStateV2(input); return v.ok ? { ok: true as const, state: v.value } : v; })();
    if (!result.ok) return result;
    if (expected !== undefined) {
        if (!hasExactFields(expected, ['gameId', 'farmId', 'ownerId'])
            || ![expected.gameId, expected.farmId, expected.ownerId].every(isGameStateId)) return { ok: false, code: 'invalid-identity' };
        if (expected.gameId !== result.state.gameId || expected.farmId !== result.state.farmId || expected.ownerId !== result.state.ownerId) {
            return { ok: false, code: 'identity-mismatch' };
        }
    }
    if (input.schemaVersion === 2) return { ok: true, status: 'accepted', state: result.state, source };
    return { ok: true, status: 'migration-required', state: result.state, source,
        sourceVersion: 1, sourceRevision: result.state.metadata.revision - 1, target: JSON.stringify(result.state) };
}

export interface AggregateInventoryCommand {
    readonly gameId: string; readonly farmId: string; readonly ownerId: string;
    readonly expectedGameStateRevision: number; readonly inventoryCommand: InventoryCommand;
}
export type AggregateInventoryResult = { readonly ok: true; readonly state: GameStateV2 }
    | { readonly ok: false; readonly code: InventoryErrorCode | 'aggregate-revision-conflict' };
export function applyAggregateInventoryCommand(input: unknown, request: unknown,
    context: InventoryAuthorityContext): AggregateInventoryResult {
    const validated = validateGameStateV2(input);
    if (!validated.ok) return { ok: false, code: 'invalid-state' };
    if (!hasExactFields(request, ['gameId', 'farmId', 'ownerId', 'expectedGameStateRevision', 'inventoryCommand'])
        || ![request.gameId, request.farmId, request.ownerId].every(isGameStateId)
        || !counter(request.expectedGameStateRevision)) return { ok: false, code: 'invalid-command' };
    const state = validated.value;
    if (!isPlainDataRecord(context) || !isGameStateId(context.ownerId)) return { ok: false, code: 'invalid-context' };
    if (context.ownerId !== state.ownerId) return { ok: false, code: 'forbidden' };
    if (request.gameId !== state.gameId || request.farmId !== state.farmId || request.ownerId !== state.ownerId) return { ok: false, code: 'wrong-target' };
    if (request.expectedGameStateRevision !== state.metadata.revision) return { ok: false, code: 'aggregate-revision-conflict' };
    if (state.metadata.revision === Number.MAX_SAFE_INTEGER || state.inventory.revision === Number.MAX_SAFE_INTEGER) return { ok: false, code: 'revision-overflow' };
    const result = applyInventoryCommand(state.inventory, request.inventoryCommand, context, ITEM_REGISTRY_V1);
    if (!result.ok) return result;
    const candidate = validateGameStateV2({ ...state, inventory: result.state,
        metadata: { ...state.metadata, revision: state.metadata.revision + 1, updatedAtLogicalMs: state.logicalTimeMs } });
    return candidate.ok ? { ok: true, state: candidate.value } : { ok: false, code: 'invalid-state' };
}
export type V2ClockResult = { readonly ok: true; readonly state: GameStateV2; readonly operationId: string }
    | Extract<StateTransitionResult, { ok: false }>;
/** Separate v2 command: same logical-time policy, v2 schema discriminator. */
export function advanceLogicalTimeV2(input: unknown, request: unknown, context: StateAuthorityContext): V2ClockResult {
    const state = validateGameStateV2(input);
    if (!state.ok) return { ok: false, code: 'invalid-state', issues: state.issues };
    if (!hasExactFields(request, ['schemaVersion', 'type', 'operationId', 'gameId', 'farmId', 'expectedRevision']) || request.schemaVersion !== 2) {
        return { ok: false, code: 'invalid-command', issues: [{ path: '$', message: 'Expected v2 clock command.' }] };
    }
    const result = advanceLogicalTime(legacyEnvelope(state.value), { ...request, schemaVersion: 1 }, context);
    return result.ok ? { ...result, state: { ...state.value, logicalTimeMs: result.state.logicalTimeMs, metadata: result.state.metadata } } : result;
}
