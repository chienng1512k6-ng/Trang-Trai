import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPositionBlocked, resolveMovement, PLAYER_HALF_EXTENT } from '../src/core/collision';
import { createPlayer, movePlayer } from '../src/core/player';
import { obstacleColliders, validatePrototypeMap } from '../src/core/prototypeMap';

const map = () => JSON.parse(readFileSync(new URL('../public/assets/prototype/farm.tmj', import.meta.url), 'utf8'));
const obstacles = validatePrototypeMap(map());
const all = obstacleColliders(obstacles);
const fixture = { id: 1, minCol: 10, maxCol: 11, minRow: 10, maxRow: 11 };
const expandedMin = 10 - PLAYER_HALF_EXTENT;
const expandedMax = 11 + PLAYER_HALF_EXTENT;

describe('Tiled collision metadata', () => {
    it('normalizes all nine authored footprints without another obstacle list', () => {
        expect(obstacles.filter(o => o.kind === 'tree')).toHaveLength(6);
        expect(obstacles.filter(o => o.kind === 'rock')).toHaveLength(3);
        expect(all).toHaveLength(9);
        for (const [index, obstacle] of obstacles.entries()) {
            expect(all[index].minCol).toBeCloseTo(obstacle.col + 0.5 - obstacle.collisionWidth / 2);
            expect(all[index].maxRow).toBeCloseTo(obstacle.row + 0.5 + obstacle.collisionDepth / 2);
            expect(all[index].id).toBe(obstacle.id);
        }
    });
    it.each(['tree', 'rock'])('blocks movement through each %s in the actual map', kind => {
        for (const obstacle of obstacles.filter(o => o.kind === kind)) {
            const start = { col: obstacle.col - 1, row: obstacle.row + 0.5 };
            let state = createPlayer(start, all);
            for (let i = 0; i < 100; i++) state = movePlayer(state, { col: 1, row: 0 }, 50, all);
            expect(state.position.col).toBeCloseTo(obstacle.col + 0.5 - obstacle.collisionWidth / 2 - PLAYER_HALF_EXTENT);
            expect(state.motion).toBe('idle');
            expect(isPositionBlocked(state.position, all)).toBe(false);
        }
    });
    it('does not treat the entire canopy as a collider', () => {
        const tree = obstacles.find(o => o.kind === 'tree');
        expect(tree.collisionWidth).toBe(0.36);
        expect(isPositionBlocked({ col: tree.col + 0.1, row: tree.row + 0.1 }, all)).toBe(false);
        expect(isPositionBlocked({ col: tree.col + 0.5, row: tree.row + 0.5 }, all)).toBe(true);
    });
    it.each([0, -1, NaN, Infinity, 1.01, '0.36'])('rejects invalid footprint extent %s', value => {
        const data = map();
        data.layers[2].objects[0].properties.find(p => p.name === 'collisionWidth').value = value;
        expect(() => validatePrototypeMap(data)).toThrow(/collision/);
    });
    it('rejects missing shape, duplicate properties and duplicate object ids', () => {
        const missing = map(); missing.layers[2].objects[0].properties.pop();
        expect(() => validatePrototypeMap(missing)).toThrow();
        const duplicate = map(); duplicate.layers[2].objects[0].properties.push({ name: 'collisionWidth', type: 'float', value: 0.36 });
        expect(() => validatePrototypeMap(duplicate)).toThrow();
        const ids = map(); ids.layers[2].objects[1].id = ids.layers[2].objects[0].id;
        expect(() => validatePrototypeMap(ids)).toThrow();
    });
});

describe('swept ground-plane collision and movement', () => {
    it.each([
        [{ col: 9, row: 10.5 }, { col: 12, row: 10.5 }, { col: expandedMin, row: 10.5 }],
        [{ col: 12, row: 10.5 }, { col: 9, row: 10.5 }, { col: expandedMax, row: 10.5 }],
        [{ col: 10.5, row: 9 }, { col: 10.5, row: 12 }, { col: 10.5, row: expandedMin }],
        [{ col: 10.5, row: 12 }, { col: 10.5, row: 9 }, { col: 10.5, row: expandedMax }],
    ])('sweeps contact from each side', (from, desired, expected) => {
        expect(resolveMovement(from, desired, [fixture])).toEqual(expected);
    });
    it('slides at a diagonal contact, then can move tangentially or retreat', () => {
        const contact = resolveMovement({ col: 9.8, row: 10.2 }, { col: 9.95, row: 10.35 }, [fixture]);
        expect(contact).toEqual({ col: expandedMin, row: 10.35 });
        expect(resolveMovement(contact, { col: expandedMin, row: 10.6 }, [fixture]).row).toBe(10.6);
        expect(resolveMovement(contact, { col: 9.6, row: 10.35 }, [fixture]).col).toBe(9.6);
    });
    it('checks the entire segment, including a very thin obstacle', () => {
        const thin = { ...fixture, minCol: 10.001, maxCol: 10.002 };
        expect(resolveMovement({ col: 1, row: 10.5 }, { col: 30, row: 10.5 }, [thin]).col).toBeCloseTo(9.821);
    });
    it('uses the nearest obstacle regardless of input list order', () => {
        const further = { ...fixture, id: 2, minCol: 12, maxCol: 13 };
        const from = { col: 1, row: 10.5 }, to = { col: 30, row: 10.5 };
        expect(resolveMovement(from, to, [further, fixture])).toEqual(resolveMovement(from, to, [fixture, further]));
    });
    it('preserves free movement speed, split deltas and compensated integration', () => {
        let plain = createPlayer({ col: 15, row: 15 }), collision = createPlayer({ col: 15, row: 15 });
        for (let n = 0; n < 10000; n++) {
            const input = { col: n % 2 ? 0.001 : -0.001, row: 0.002 };
            plain = movePlayer(plain, input, 1);
            collision = movePlayer(collision, input, 1, all);
        }
        expect(collision).toEqual(plain);
        expect(collision.position.row).toBeCloseTo(15.06, 12);
    });
    it.each([0, -10, NaN, Infinity])('handles abnormal delta %s without moving', delta => {
        const state = createPlayer({ col: 9, row: 10.5 });
        expect(movePlayer(state, { col: 1, row: 0 }, delta, [fixture]).position).toEqual(state.position);
    });
    it('caps large delta and blocks without tunneling under sustained input', () => {
        let state = createPlayer({ col: 9.8, row: 10.5 });
        for (let n = 0; n < 10000; n++) state = movePlayer(state, { col: 1, row: 0 }, 60000, [fixture]);
        expect(state.position.col).toBe(expandedMin); expect(state.motion).toBe('idle');
        expect(state.integrationError.col).toBe(0);
        expect(movePlayer(state, { col: -1, row: 0 }, 16, [fixture]).motion).toBe('walk');
    });
    it('keeps map limits near a collider while sliding along the edge', () => {
        const edge = { id: 1, minCol: 0.5, maxCol: 0.9, minRow: 1, maxRow: 2 };
        let state = createPlayer({ col: 0.25, row: 0.25 });
        for (let n = 0; n < 500; n++) state = movePlayer(state, { col: -1, row: 1 }, 50, [edge]);
        expect(state.position).toEqual({ col: 0.25, row: 31.75 });
    });
    it('rejects overlapped spawn/state immediately, including zero input', () => {
        expect(() => createPlayer({ col: 10.5, row: 10.5 }, [fixture])).toThrow(/spawn overlaps/);
        const invalid = createPlayer({ col: 10.5, row: 10.5 });
        expect(() => movePlayer(invalid, { col: 0, row: 0 }, 0, [fixture])).toThrow(/spawn overlaps/);
    });
    it('zero input remains idle at a contact without precision drift', () => {
        const state = createPlayer({ col: expandedMin, row: 10.5 }, [fixture]);
        expect(movePlayer(state, { col: 0, row: 0 }, 16, [fixture])).toEqual(state);
    });
    it('handles seeded random paths without penetrating any authored obstacle', () => {
        let seed = 92741, state = createPlayer(undefined, all);
        const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
        for (let n = 0; n < 5000; n++) {
            state = movePlayer(state, { col: random() * 2 - 1, row: random() * 2 - 1 }, random() * 500, all);
            expect(isPositionBlocked(state.position, all)).toBe(false);
            expect(state.position.col).toBeGreaterThanOrEqual(0.25);
            expect(state.position.row).toBeLessThanOrEqual(31.75);
        }
    });
});
