/** Data contract only: no renderer, storage, wall clock or gameplay update loop. */
export const GAME_STATE_SCHEMA_VERSION = 1 as const;

export interface GameState {
    readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
    readonly gameId: string;
    readonly farmId: string;
    readonly ownerId: string;
    /** Integer elapsed milliseconds on this game's logical timeline, not Unix time. */
    readonly logicalTimeMs: number;
    readonly metadata: {
        readonly revision: number;
        readonly createdAtLogicalMs: number;
        readonly updatedAtLogicalMs: number;
    };
}

/** Contract exercise only; no automatic clock advancement or offline rewards. */
export interface AdvanceLogicalTimeCommand {
    readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
    readonly type: 'advance-logical-time';
    readonly operationId: string;
    readonly gameId: string;
    readonly farmId: string;
    readonly expectedRevision: number;
}

export interface ValidationIssue { readonly path: string; readonly message: string }
export type ValidationResult<T> = { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const isId = (value: unknown): value is string => typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value);
const isCounter = (value: unknown): value is number => typeof value === 'number'
    && Number.isSafeInteger(value) && value >= 0;

/** Strict, own data properties: reject instances, getters and unknown fields.
 * Input is ordinary data, not an adversarial Proxy/security sandbox. */
function record(value: unknown, keys: readonly string[], path: string, issues: ValidationIssue[]): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        issues.push({ path, message: 'Expected a plain data object.' }); return false;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))
        || keys.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key))
        || Object.values(descriptors).some(descriptor => !('value' in descriptor) || !descriptor.enumerable)) {
        issues.push({ path, message: 'Expected exactly the declared enumerable data fields.' }); return false;
    }
    return true;
}
function field(valid: boolean, path: string, message: string, issues: ValidationIssue[]) {
    if (!valid) issues.push({ path, message });
}
function identity(value: Record<string, unknown>, names: readonly string[], issues: ValidationIssue[]) {
    for (const name of names) field(isId(value[name]), name, 'Expected an ASCII identifier of 1–64 characters.', issues);
    field(value.schemaVersion === GAME_STATE_SCHEMA_VERSION, 'schemaVersion', 'Unsupported schema version; migration is not implicit.', issues);
}

export function validateGameState(input: unknown): ValidationResult<GameState> {
    const issues: ValidationIssue[] = [];
    if (!record(input, ['schemaVersion', 'gameId', 'farmId', 'ownerId', 'logicalTimeMs', 'metadata'], '$', issues)) return { ok: false, issues };
    identity(input, ['gameId', 'farmId', 'ownerId'], issues);
    field(isCounter(input.logicalTimeMs), 'logicalTimeMs', 'Expected nonnegative safe integer milliseconds.', issues);
    if (record(input.metadata, ['revision', 'createdAtLogicalMs', 'updatedAtLogicalMs'], 'metadata', issues)) {
        for (const key of ['revision', 'createdAtLogicalMs', 'updatedAtLogicalMs']) {
            field(isCounter(input.metadata[key]), `metadata.${key}`, 'Expected a nonnegative safe integer.', issues);
        }
        const { createdAtLogicalMs: created, updatedAtLogicalMs: updated } = input.metadata;
        if (isCounter(created) && isCounter(updated) && isCounter(input.logicalTimeMs)) {
            field(created <= updated && updated <= input.logicalTimeMs, 'metadata', 'Require created <= updated <= logicalTimeMs.', issues);
        }
    }
    if (issues.length) return { ok: false, issues };
    // All fields were checked above. Return a detached DTO, never repair/coerce input.
    const state = input as unknown as GameState;
    return { ok: true, value: { ...state, metadata: { ...state.metadata } } };
}

export function validateStateCommand(input: unknown): ValidationResult<AdvanceLogicalTimeCommand> {
    const issues: ValidationIssue[] = [];
    if (!record(input, ['schemaVersion', 'type', 'operationId', 'gameId', 'farmId', 'expectedRevision'], '$', issues)) return { ok: false, issues };
    identity(input, ['operationId', 'gameId', 'farmId'], issues);
    field(input.type === 'advance-logical-time', 'type', 'Unsupported command type.', issues);
    field(isCounter(input.expectedRevision), 'expectedRevision', 'Expected a nonnegative safe integer.', issues);
    return issues.length ? { ok: false, issues } : { ok: true, value: { ...input } as unknown as AdvanceLogicalTimeCommand };
}

/** In production a future service must derive these from authentication/time,
 * never accept them as authoritative client request fields. Local callers can cheat. */
export interface StateAuthorityContext { readonly ownerId: string; readonly logicalTimeMs: number }
export type StateTransitionResult = { readonly ok: true; readonly state: GameState; readonly operationId: string }
    | { readonly ok: false; readonly code: 'invalid-state' | 'invalid-command' | 'invalid-context'
        | 'forbidden' | 'wrong-target' | 'revision-conflict' | 'time-not-advanced' | 'revision-overflow';
        readonly issues: readonly ValidationIssue[] };

/** Pure reference transition for the contract; not wired into the prototype.
 * expectedRevision is an optimistic precondition, not an atomic DB transaction
 * or a durable idempotency ledger. No events/bus are necessary yet. */
export function advanceLogicalTime(input: unknown, request: unknown, context: StateAuthorityContext): StateTransitionResult {
    const validatedState = validateGameState(input);
    if (!validatedState.ok) return { ok: false, code: 'invalid-state', issues: validatedState.issues };
    const validatedCommand = validateStateCommand(request);
    if (!validatedCommand.ok) return { ok: false, code: 'invalid-command', issues: validatedCommand.issues };
    const state = validatedState.value, command = validatedCommand.value;
    const reject = (code: Extract<StateTransitionResult, { ok: false }>['code'], path: string, message: string): StateTransitionResult =>
        ({ ok: false, code, issues: [{ path, message }] });
    if (!isId(context.ownerId) || !isCounter(context.logicalTimeMs)) return reject('invalid-context', 'context', 'Invalid authority identity/time.');
    if (context.ownerId !== state.ownerId) return reject('forbidden', 'context.ownerId', 'Owner mismatch.');
    if (command.gameId !== state.gameId || command.farmId !== state.farmId) return reject('wrong-target', 'command', 'Game/farm mismatch.');
    if (command.expectedRevision !== state.metadata.revision) return reject('revision-conflict', 'expectedRevision', 'Stale or future revision.');
    if (context.logicalTimeMs <= state.logicalTimeMs) return reject('time-not-advanced', 'context.logicalTimeMs', 'Time must strictly increase.');
    if (state.metadata.revision === Number.MAX_SAFE_INTEGER) return reject('revision-overflow', 'metadata.revision', 'Revision exhausted.');
    return { ok: true, operationId: command.operationId,
        state: { ...state, logicalTimeMs: context.logicalTimeMs, metadata: { ...state.metadata,
            revision: state.metadata.revision + 1, updatedAtLogicalMs: context.logicalTimeMs } } };
}
