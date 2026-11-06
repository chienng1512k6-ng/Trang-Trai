import { describe, expect, it } from 'vitest';
import {
    gridToWorld, gridToWorldCenter, worldToGrid, worldToGridCell,
    isGridCellWithinBounds, DEFAULT_TILE_DIMENSIONS,
} from './isometric';

describe('diamond 2:1 coordinates', () => {
    it.each([
        [0, 0, 0, 0], [5, 5, 0, 160], [3, 1, 64, 64],
        [1, 3, -64, 64], [-2, -3, 32, -80], [0.25, 1.5, -40, 28],
    ])('projects (%s,%s) to (%s,%s)', (col, row, x, y) => {
        expect(gridToWorld({ col, row })).toEqual({ x, y });
        expect(worldToGrid({ x, y })).toEqual({ col, row });
    });

    it('distinguishes top vertex and center with a translated origin', () => {
        const origin = { x: 100, y: -70 };
        expect(gridToWorld({ col: 0, row: 0 }, undefined, origin)).toEqual(origin);
        expect(gridToWorldCenter({ col: 0, row: 0 }, undefined, origin)).toEqual({ x: 100, y: -54 });
        expect(worldToGridCell({ x: 100, y: -54 }, undefined, origin)).toEqual({ col: 0, row: 0 });
    });

    it('round trips 1000 seeded fractional positions without early rounding', () => {
        let seed = 0x12345678;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
        for (let i = 0; i < 1000; i++) {
            const grid = { col: random() * 200 - 100, row: random() * 200 - 100 };
            const origin = { x: random() * 2000 - 1000, y: random() * 2000 - 1000 };
            const tile = { width: 128, height: 64 };
            const result = worldToGrid(gridToWorld(grid, tile, origin), tile, origin);
            expect(result.col).toBeCloseTo(grid.col, 10);
            expect(result.row).toBeCloseTo(grid.row, 10);
        }
    });

    it.each([[0, 0], [5, 5], [-1, -2], [31, 31], [32, 40]])('picks the center of (%s,%s)', (col, row) => {
        expect(worldToGridCell(gridToWorldCenter({ col, row }))).toEqual({ col, row });
    });

    it.each([
        [0.000001, 0.5, 0, 0], [-0.000001, 0.5, -1, 0],
        [0.999999, 0.5, 0, 0], [1, 0.5, 1, 0], [1.000001, 0.5, 1, 0],
        [0.5, -0.000001, 0, -1], [0.5, 0, 0, 0], [0.5, 1, 0, 1],
    ])('picks around a shared edge (%s,%s)', (col, row, expectedCol, expectedRow) => {
        expect(worldToGridCell(gridToWorld({ col, row }))).toEqual({ col: expectedCol, row: expectedRow });
    });

    it.each([[0, 0, true], [31, 31, true], [32, 0, false], [0, 32, false],
        [-1, 0, false], [0, -1, false], [1.5, 2, false], [NaN, 0, false]])(
        'checks prototype bounds (%s,%s)', (col, row, expected) => {
            expect(isGridCellWithinBounds({ col, row })).toBe(expected);
        });

    it('supports other bounds and empty maps', () => {
        expect(isGridCellWithinBounds({ col: 2, row: 3 }, { columns: 3, rows: 4 })).toBe(true);
        expect(isGridCellWithinBounds({ col: 0, row: 0 }, { columns: 0, rows: 0 })).toBe(false);
        expect(() => isGridCellWithinBounds({ col: 0, row: 0 }, { columns: -1, rows: 2 })).toThrow(RangeError);
    });

    it.each([{ width: 0, height: 0 }, { width: 64, height: 64 }, { width: Infinity, height: 32 }])(
        'rejects invalid tile dimensions %o', tile => {
            expect(() => gridToWorld({ col: 0, row: 0 }, tile)).toThrow(RangeError);
            expect(() => worldToGrid({ x: 0, y: 0 }, tile)).toThrow(RangeError);
        });

    it('does not mutate inputs', () => {
        const grid = Object.freeze({ col: 3, row: 7 });
        const origin = Object.freeze({ x: 10, y: 20 });
        expect(worldToGrid(gridToWorld(grid, DEFAULT_TILE_DIMENSIONS, origin), DEFAULT_TILE_DIMENSIONS, origin)).toEqual(grid);
    });
});
