import { describe, expect, it } from 'vitest';
import { VirtualJoystick, ActionPointer } from './virtualJoystick';
import { gridToWorld } from './isometric';
import { CombinedInput } from '../game/player/CombinedInput';

describe('virtual joystick ground input', () => {
    it('starts centered and owned center stays zero', () => {
        const joystick = new VirtualJoystick();
        expect(joystick.sample()).toEqual({ col: 0, row: 0 });
        joystick.begin(1); joystick.move(1, { x: 0, y: 0 }, 50);
        expect(joystick.sample()).toEqual({ col: 0, row: 0 });
    });
    it.each([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]])(
        'maps screen direction (%s,%s) through the shared inverse', (x, y) => {
            const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: x * 100, y: y * 100 }, 50);
            const input = joystick.sample();
            expect(Math.hypot(input.col, input.row)).toBeCloseTo(1, 12);
            const screen = gridToWorld(input);
            if (x === 0) expect(screen.x).toBeCloseTo(0, 12); else expect(Math.sign(screen.x)).toBe(x);
            if (y === 0) expect(screen.y).toBeCloseTo(0, 12); else expect(Math.sign(screen.y)).toBe(y);
            if (x && y) expect(Math.abs(screen.x)).toBeCloseTo(Math.abs(screen.y), 12);
            expect(Math.hypot(joystick.displacement.x, joystick.displacement.y)).toBeCloseTo(1, 12);
        });
    it.each([0, 0.1, 0.15])('dead zone returns zero at %s radius', strength => {
        const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: strength * 100, y: 0 }, 100);
        expect(joystick.sample()).toEqual({ col: 0, row: 0 });
    });
    it('remaps magnitude outside the dead zone continuously', () => {
        const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: 57.5, y: 0 }, 100);
        const input = joystick.sample();
        expect(Math.hypot(input.col, input.row)).toBeCloseTo(0.5, 12);
    });
    it('supports custom dead zones', () => {
        const joystick = new VirtualJoystick(0.3); joystick.begin(1); joystick.move(1, { x: 20, y: 0 }, 100);
        expect(joystick.sample()).toEqual({ col: 0, row: 0 });
    });
    it.each([-0.1, 1, NaN])('rejects invalid dead zone %s', deadZone => {
        expect(() => new VirtualJoystick(deadZone)).toThrow(RangeError);
    });
    it('does not let another pointer steal, move or release an owned joystick', () => {
        const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: 100, y: 0 }, 100);
        expect(joystick.begin(2)).toBe(false);
        const expected = joystick.sample();
        joystick.move(2, { x: -100, y: 0 }, 100); joystick.release(2);
        expect(joystick.sample()).toEqual(expected);
        joystick.release(1);
        expect(joystick.sample()).toEqual({ col: 0, row: 0 });
        expect(joystick.pointerId).toBeNull();
    });
    it('resets safely on cancel/resize and on invalid geometry', () => {
        const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: 100, y: 0 }, 100);
        joystick.reset(); expect(joystick.sample()).toEqual({ col: 0, row: 0 });
        joystick.begin(2); joystick.move(2, { x: Infinity, y: 0 }, 0);
        expect(joystick.sample()).toEqual({ col: 0, row: 0 });
    });
    it('preserves Action and joystick ownership independently', () => {
        const joystick = new VirtualJoystick(), action = new ActionPointer();
        joystick.begin(1); joystick.move(1, { x: 100, y: 0 }, 100); action.begin(2);
        expect(action.begin(3)).toBe(false); action.release(3); expect(action.pressed).toBe(true);
        action.release(2); expect(joystick.pointerId).toBe(1);
        action.begin(2); joystick.release(1); expect(action.pressed).toBe(true);
        action.reset(); expect(action.pressed).toBe(false);
    });
    it('has no frame clock; sampling does not change input', () => {
        const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: 20, y: -10 }, 50);
        const expected = joystick.sample();
        for (let n = 0; n < 1000; n++) expect(joystick.sample()).toEqual(expected);
    });
});

describe('keyboard and touch arbitration', () => {
    const keyboard = { sample: () => ({ col: 1, row: 0 }) };
    it('uses keyboard when no touch owns the joystick', () => {
        expect(new CombinedInput(keyboard, new VirtualJoystick(), () => false).sample(16)).toEqual({ col: 1, row: 0 });
    });
    it('lets a held centered joystick override the keyboard, then restores it on release', () => {
        const joystick = new VirtualJoystick(); const input = new CombinedInput(keyboard, joystick, () => false);
        joystick.begin(1); expect(input.sample(16)).toEqual({ col: 0, row: 0 });
        joystick.move(1, { x: -50, y: 0 }, 50); expect(input.sample(16).col).toBeLessThan(0);
        joystick.release(1); expect(input.sample(16)).toEqual({ col: 1, row: 0 });
    });
    it('blocks both inputs in portrait, background or text entry', () => {
        const joystick = new VirtualJoystick(); joystick.begin(1); joystick.move(1, { x: 100, y: 0 }, 50);
        expect(new CombinedInput(keyboard, joystick, () => true).sample(16)).toEqual({ col: 0, row: 0 });
    });
});
