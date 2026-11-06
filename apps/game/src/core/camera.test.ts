import { describe, expect, it } from 'vitest';
import { mapWorldBounds, viewportBounds, clampCameraZoom } from './camera';
import { MAP_ORIGIN } from './prototypeMap';

describe('isometric camera geometry', () => {
    const map = mapWorldBounds(MAP_ORIGIN);
    it('uses outer diamond vertices, including the map origin', () => {
        expect(map).toEqual({ x: 0, y: 0, width: 2048, height: 1024 });
        expect(mapWorldBounds({ x: 1044, y: -100 })).toEqual({ ...map, x: 20, y: -100 });
    });
    it.each([[568, 320], [844, 390], [1024, 600], [1280, 720]])('keeps native map bounds at %s × %s', (w, h) => {
        expect(viewportBounds(map, w, h, 1.5)).toEqual(map);
    });
    it('centers an oversized viewport on both axes', () => {
        const b = viewportBounds(map, 1600, 900, 0.5);
        expect(b).toEqual({ x: -576, y: -388, width: 3200, height: 1800 });
        expect(b.x + b.width / 2).toBe(1024);
        expect(b.y + b.height / 2).toBe(512);
    });
    it('expands only the oversized axis, preserving the other native clamp', () => {
        expect(viewportBounds(map, 1280, 720, 0.5)).toEqual({ x: -256, y: -208, width: 2560, height: 1440 });
        expect(viewportBounds(map, 844, 600, 0.5)).toEqual({ x: 0, y: -88, width: 2048, height: 1200 });
    });
    it.each([0, -1, NaN, Infinity])('rejects invalid zoom %s', z => expect(() => clampCameraZoom(z)).toThrow(RangeError));
    it.each([[0.1, 0.5], [9, 3], [1.5, 1.5]])('clamps %s to %s', (z, expected) => expect(clampCameraZoom(z)).toBe(expected));
    it.each([[0, 320, 1], [568, NaN, 1], [568, 320, 0]])('rejects invalid viewport', (w, h, z) => {
        expect(() => viewportBounds(map, w, h, z)).toThrow(RangeError);
    });
});
