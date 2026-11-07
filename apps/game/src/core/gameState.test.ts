import { describe, expect, it } from 'vitest';
import { advanceLogicalTime, validateGameState, validateStateCommand, type GameState,
    type AdvanceLogicalTimeCommand } from './gameState';

const state = (): GameState => ({ schemaVersion: 1, gameId: 'game:prototype', farmId: 'farm-1', ownerId: 'owner-1',
    logicalTimeMs: 100, metadata: { revision: 0, createdAtLogicalMs: 0, updatedAtLogicalMs: 100 } });
const command = (): AdvanceLogicalTimeCommand => ({ schemaVersion: 1, type: 'advance-logical-time',
    operationId: 'op-1', gameId: 'game:prototype', farmId: 'farm-1', expectedRevision: 0 });
const context = { ownerId: 'owner-1', logicalTimeMs: 200 };

describe('persistent GameState data boundary', () => {
    it('accepts a zero-time new state and returns a detached DTO without requiring browser globals', () => {
        const input = { ...state(), logicalTimeMs: 0, metadata: { revision: 0, createdAtLogicalMs: 0, updatedAtLogicalMs: 0 } };
        const result = validateGameState(input);
        expect(result).toEqual({ ok: true, value: input });
        if (!result.ok) throw new Error('Expected valid state');
        expect(result.value).not.toBe(input); expect(result.value.metadata).not.toBe(input.metadata);
        expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
    });
    it.each([0, 2, '1', NaN, Infinity])('rejects unsupported schema %s without migration', schemaVersion => {
        expect(validateGameState({ ...state(), schemaVersion }).ok).toBe(false);
    });
    it.each(['', ' owner', 'owner ', 'owner/name', 'a'.repeat(65), 12, null])('rejects invalid identity %s', id => {
        for (const key of ['gameId', 'farmId', 'ownerId']) expect(validateGameState({ ...state(), [key]: id }).ok).toBe(false);
    });
    it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '100'])('rejects invalid numeric field %s', value => {
        expect(validateGameState({ ...state(), logicalTimeMs: value }).ok).toBe(false);
        for (const key of ['revision', 'createdAtLogicalMs', 'updatedAtLogicalMs']) {
            expect(validateGameState({ ...state(), metadata: { ...state().metadata, [key]: value } }).ok).toBe(false);
        }
    });
    it('rejects inverted time metadata and update time beyond the logical timeline', () => {
        expect(validateGameState({ ...state(), metadata: { revision: 0, createdAtLogicalMs: 80, updatedAtLogicalMs: 70 } }).ok).toBe(false);
        expect(validateGameState({ ...state(), metadata: { revision: 0, createdAtLogicalMs: 0, updatedAtLogicalMs: 101 } }).ok).toBe(false);
    });
    it.each([null, undefined, [], new Date(), 5])('rejects non-record state %s', input => {
        expect(validateGameState(input).ok).toBe(false);
    });
    it('rejects missing, renderer, runtime, symbol and unexpected metadata fields', () => {
        const { ownerId: omitted, ...missing } = state();
        expect(omitted).toBe('owner-1'); expect(validateGameState(missing).ok).toBe(false);
        expect(validateGameState({ ...state(), sprite: {} }).ok).toBe(false);
        expect(validateGameState({ ...state(), combat: { hp: 5 } }).ok).toBe(false);
        expect(validateGameState({ ...state(), [Symbol('hidden')]: 1 }).ok).toBe(false);
        expect(validateGameState({ ...state(), metadata: { ...state().metadata, savedAt: 1 } }).ok).toBe(false);
    });
    it('does not invoke accessor fields or coerce/repair an invalid input', () => {
        let reads = 0;
        const getter = Object.defineProperty(state(), 'logicalTimeMs', { enumerable: true, get: () => { reads++; return 100; } });
        expect(validateGameState(getter).ok).toBe(false); expect(reads).toBe(0);
        const input = Object.freeze({ ...state(), ownerId: ' owner-1 ' });
        const result = validateGameState(input);
        expect(input.ownerId).toBe(' owner-1 ');
        expect(result).toMatchObject({ ok: false, issues: [{ path: 'ownerId' }] });
    });
    it('accepts safe integer limits and JSON-shaped null-prototype records', () => {
        const input = Object.assign(Object.create(null), state(), { logicalTimeMs: Number.MAX_SAFE_INTEGER });
        expect(validateGameState(input).ok).toBe(true);
    });
});

describe('command envelope and authority reference transition', () => {
    it('validates the declared command without accepting client-granted time or owner', () => {
        expect(validateStateCommand(command())).toEqual({ ok: true, value: command() });
        for (const extra of [{ logicalTimeMs: 200 }, { ownerId: 'owner-1' }, { goldAwarded: 10 }]) {
            expect(validateStateCommand({ ...command(), ...extra }).ok).toBe(false);
        }
        expect(validateStateCommand({ ...command(), type: 'award-gold' }).ok).toBe(false);
        expect(validateStateCommand({ ...command(), schemaVersion: 2 }).ok).toBe(false);
        expect(validateStateCommand({ ...command(), operationId: '' }).ok).toBe(false);
        expect(validateStateCommand({ ...command(), farmId: '' }).ok).toBe(false);
        expect(validateStateCommand({ ...command(), expectedRevision: NaN }).ok).toBe(false);
        expect(validateStateCommand(null).ok).toBe(false);
    });
    it('transitions once using injected time, preserving identity and creation time without mutating arguments', () => {
        const input = state(), request = command(); Object.freeze(input.metadata); Object.freeze(input); Object.freeze(request);
        const result = advanceLogicalTime(input, request, context);
        expect(result).toEqual({ ok: true, operationId: 'op-1', state: { ...input, logicalTimeMs: 200,
            metadata: { revision: 1, createdAtLogicalMs: 0, updatedAtLogicalMs: 200 } } });
        expect(input).toEqual(state()); expect(request).toEqual(command());
        expect(advanceLogicalTime(input, request, context)).toEqual(result);
        if (!result.ok) throw new Error('Expected success');
        expect(validateGameState(result.state).ok).toBe(true);
        expect(advanceLogicalTime(result.state, request, { ...context, logicalTimeMs: 300 })).toMatchObject({ ok: false, code: 'revision-conflict' });
    });
    it('rejects invalid state/command before applying any transition', () => {
        expect(advanceLogicalTime({ ...state(), logicalTimeMs: NaN }, command(), context)).toMatchObject({ ok: false, code: 'invalid-state' });
        expect(advanceLogicalTime(state(), { ...command(), expectedRevision: -1 }, context)).toMatchObject({ ok: false, code: 'invalid-command' });
    });
    it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid injected clock %s', logicalTimeMs => {
        expect(advanceLogicalTime(state(), command(), { ...context, logicalTimeMs })).toMatchObject({ ok: false, code: 'invalid-context' });
    });
    it('enforces owner, target identity, expected revision and strict monotonic time', () => {
        expect(advanceLogicalTime(state(), command(), { ...context, ownerId: '' })).toMatchObject({ ok: false, code: 'invalid-context' });
        expect(advanceLogicalTime(state(), command(), { ...context, ownerId: 'another-owner' })).toMatchObject({ ok: false, code: 'forbidden' });
        for (const key of ['gameId', 'farmId']) expect(advanceLogicalTime(state(), { ...command(), [key]: 'another' }, context)).toMatchObject({ ok: false, code: 'wrong-target' });
        expect(advanceLogicalTime(state(), { ...command(), expectedRevision: 1 }, context)).toMatchObject({ ok: false, code: 'revision-conflict' });
        for (const logicalTimeMs of [99, 100]) expect(advanceLogicalTime(state(), command(), { ...context, logicalTimeMs })).toMatchObject({ ok: false, code: 'time-not-advanced' });
    });
    it('prevents revision overflow and accepts the last representable increment', () => {
        const atRevision = (revision: number) => ({ ...state(), metadata: { ...state().metadata, revision } });
        const revision = Number.MAX_SAFE_INTEGER;
        expect(advanceLogicalTime(atRevision(revision), { ...command(), expectedRevision: revision }, context)).toMatchObject({ ok: false, code: 'revision-overflow' });
        const result = advanceLogicalTime(atRevision(revision - 1), { ...command(), expectedRevision: revision - 1 }, context);
        expect(result).toMatchObject({ ok: true, state: { metadata: { revision } } });
    });
});
