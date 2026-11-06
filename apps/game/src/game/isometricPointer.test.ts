import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Cameras } from 'phaser';
import { gridToWorldCenter } from '../core/isometric';
import { pointerToGridCell } from './isometricPointer';

// Compile-time compatibility with the installed Phaser Camera signature.
type CameraPort = Parameters<typeof pointerToGridCell>[1];
type PhaserCamera = Pick<Cameras.Scene2D.Camera, 'getWorldPoint'>;

describe('pointer camera adapter', () => {
    it.each([
        [0, 0, 0, 0], [5, 5, 200, -80], [-2, 3, -100, 100], [32, 32, 0, 0],
    ])('picks (%s,%s) after delegating the camera transform', (col, row, x, y) => {
        const origin = { x, y };
        // Camera owns scroll/zoom; this unit fixture supplies its world result.
        const getWorldPoint = vi.fn(() => gridToWorldCenter({ col, row }, undefined, origin));
        const pointer = { x: 123, y: 456 };
        expect(pointerToGridCell(pointer, { getWorldPoint }, undefined, origin)).toEqual({ col, row });
        expect(getWorldPoint).toHaveBeenCalledExactlyOnceWith(123, 456);
    });

    it('accepts the actual Phaser camera interface without runtime imports', () => {
        expectTypeOf<PhaserCamera>().toMatchTypeOf<CameraPort>();
    });
});
