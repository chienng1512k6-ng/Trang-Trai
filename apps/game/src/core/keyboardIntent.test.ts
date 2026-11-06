import { describe, expect, it } from 'vitest';
import { keyboardIntent } from './keyboardIntent';
import { gridToWorld } from './isometric';
import { createPlayer, movePlayer } from './player';

describe('screen WASD intent to isometric ground movement', () => {
    it.each([
        [['KeyW'], 0, -1], [['KeyS'], 0, 1], [['KeyA'], -1, 0], [['KeyD'], 1, 0],
        [['KeyW', 'KeyA'], -1, -1], [['KeyW', 'KeyD'], 1, -1],
        [['KeyS', 'KeyA'], -1, 1], [['KeyS', 'KeyD'], 1, 1],
    ])('projects %j in the requested screen direction', (keys, x, y) => {
        const input = keyboardIntent(new Set(keys));
        expect(Math.hypot(input.col, input.row)).toBeCloseTo(1, 12);
        const projected = gridToWorld(input);
        if (x === 0) expect(projected.x).toBeCloseTo(0, 12);
        else expect(Math.sign(projected.x)).toBe(x);
        if (y === 0) expect(projected.y).toBeCloseTo(0, 12);
        else expect(Math.sign(projected.y)).toBe(y);
        if (x !== 0 && y !== 0) expect(Math.abs(projected.x)).toBeCloseTo(Math.abs(projected.y), 12);
        const state = movePlayer(createPlayer(), input, 50);
        expect(Math.hypot(state.position.col - 16.5, state.position.row - 16.5)).toBeCloseTo(0.15, 12);
        expect(state.motion).toBe('walk');
    });
    it.each([[], ['KeyW', 'KeyS'], ['KeyA', 'KeyD'], ['KeyW', 'KeyA', 'KeyS', 'KeyD']])(
        'cancels opposing or absent keys %j', (...keys) => {
            expect(keyboardIntent(new Set(keys))).toEqual({ col: 0, row: 0 });
        });
    it('cancels only the opposing axis when three keys are held', () => {
        expect(keyboardIntent(new Set(['KeyW', 'KeyS', 'KeyD']))).toEqual(keyboardIntent(new Set(['KeyD'])));
    });
    it('does not turn reserved future action bindings into movement', () => {
        expect(keyboardIntent(new Set(['KeyE', 'Space']))).toEqual({ col: 0, row: 0 });
    });
    it('leaves the existing movement system responsible for Idle and facing retention', () => {
        const walking = movePlayer(createPlayer(), keyboardIntent(new Set(['KeyW'])), 16);
        const idle = movePlayer(walking, keyboardIntent(new Set()), 16);
        expect(idle.position).toEqual(walking.position);
        expect(idle.motion).toBe('idle');
        expect(idle.facing).toBe(walking.facing);
    });
});
