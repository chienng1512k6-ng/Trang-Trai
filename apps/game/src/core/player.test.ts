import { describe, expect, it } from 'vitest';
import { createPlayer, movePlayer, playerWorldPosition, PLAYER_SPEED, MAX_MOVEMENT_DELTA_MS, MAP_EDGE_INSET } from './player';
import { gridToWorldCenter } from './isometric';

const zero = { col: 0, row: 0 };
describe('player movement on the logical ground plane', () => {
    it('spawns idle at the center of cell 16,16, with a footpoint in world space', () => {
        const state = createPlayer();
        expect(state.position).toEqual({ col: 16.5, row: 16.5 });
        expect(state.motion).toBe('idle');
        expect(playerWorldPosition(state, { x: 1024, y: 0 })).toEqual(gridToWorldCenter({ col: 16, row: 16 }, undefined, { x: 1024, y: 0 }));
    });
    it('stops immediately with zero input', () => {
        const walking = movePlayer(createPlayer(), { col: 1, row: 0 }, 16);
        const stopped = movePlayer(walking, zero, 16);
        expect(stopped.position).toEqual(walking.position);
        expect(stopped.motion).toBe('idle');
        expect(stopped.facing).toBe(walking.facing);
    });
    it.each([
        [1, 0, 'southEast'], [0, 1, 'southWest'], [-1, 0, 'northWest'], [0, -1, 'northEast'],
    ])('moves along ground axis (%s,%s)', (col, row, facing) => {
        const next = movePlayer(createPlayer(), { col, row }, 50);
        expect(next.position.col).toBeCloseTo(16.5 + col * PLAYER_SPEED * 0.05, 12);
        expect(next.position.row).toBeCloseTo(16.5 + row * PLAYER_SPEED * 0.05, 12);
        expect(next.facing).toBe(facing);
        expect(next.motion).toBe('walk');
        expect(movePlayer(next, zero, 16).facing).toBe(facing);
    });
    it.each([[1, 1], [-1, 1], [-1, -1], [1, -1]])('normalizes diagonal (%s,%s)', (col, row) => {
        const next = movePlayer(createPlayer(), { col, row }, 50);
        expect(Math.hypot(next.position.col - 16.5, next.position.row - 16.5)).toBeCloseTo(PLAYER_SPEED * 0.05, 12);
    });
    it('preserves analog magnitude below 1 and caps larger vectors', () => {
        expect(movePlayer(createPlayer(), { col: 0.5, row: 0 }, 50).position.col).toBeCloseTo(16.575, 12);
        expect(movePlayer(createPlayer(), { col: 100, row: 0 }, 50).position.col).toBeCloseTo(16.65, 12);
    });
    it('is independent of normal frame partitions, including fractional deltas', () => {
        const simulate = (frames: number, delta: number) => {
            let state = createPlayer();
            for (let i = 0; i < frames; i++) state = movePlayer(state, { col: 1, row: 1 }, delta);
            return state.position;
        };
        const reference = simulate(20, 50);
        for (const [frames, delta] of [[100, 10], [60, 1000 / 60], [10000, 0.1]]) {
            const actual = simulate(frames, delta);
            expect(actual.col).toBeCloseTo(reference.col, 10);
            expect(actual.row).toBeCloseTo(reference.row, 10);
        }
    });
    it.each([0, -1, NaN, Infinity, -Infinity])('ignores unsafe delta %s', delta => {
        const state = createPlayer();
        const next = movePlayer(state, { col: 1, row: 0 }, delta);
        expect(next.position).toEqual(state.position);
        expect(next.motion).toBe('idle');
        expect(next.facing).toBe(state.facing);
    });
    it('caps stalls at 50ms and discards excess instead of teleporting', () => {
        expect(movePlayer(createPlayer(), { col: 1, row: 0 }, 60000))
            .toEqual(movePlayer(createPlayer(), { col: 1, row: 0 }, MAX_MOVEMENT_DELTA_MS));
    });
    it.each([{ col: NaN, row: 1 }, { col: 1, row: Infinity }])('rejects non-finite input %o safely', input => {
        expect(movePlayer(createPlayer(), input, 16).position).toEqual(createPlayer().position);
    });
    it.each([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]])('stays inside the map for (%s,%s)', (col, row) => {
        let state = createPlayer();
        for (let i = 0; i < 500; i++) state = movePlayer(state, { col, row }, 50);
        for (const value of [state.position.col, state.position.row]) {
            expect(value).toBeGreaterThanOrEqual(MAP_EDGE_INSET);
            expect(value).toBeLessThanOrEqual(32 - MAP_EDGE_INSET);
        }
        expect(state.motion).toBe('idle');
    });
    it('slides along a map edge without leaving it and faces actual movement', () => {
        const next = movePlayer(createPlayer({ col: 31.75, row: 10 }), { col: 1, row: 1 }, 50);
        expect(next.position.col).toBe(31.75);
        expect(next.position.row).toBeGreaterThan(10);
        expect(next.facing).toBe('southWest');
    });
    it('does not round logic positions to pixels or mutate prior state', () => {
        const state = createPlayer();
        Object.freeze(state.position); Object.freeze(state.integrationError); Object.freeze(state);
        const next = movePlayer(state, { col: 1, row: 0 }, 0.1);
        expect(next.position.col).toBeCloseTo(16.5003, 12);
        expect(state.position.col).toBe(16.5);
    });
    it.each([{ col: -1, row: 0 }, { col: 32, row: 16 }, { col: NaN, row: 16 }])('rejects invalid spawn %o', position => {
        expect(() => createPlayer(position)).toThrow(RangeError);
    });
});
