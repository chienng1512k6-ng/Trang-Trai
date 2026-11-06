import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMonster, updateMonster, monsterEvent, MONSTER_CONFIG } from '../src/core/monster';
import { findMonsterPath, groundDistance } from '../src/core/monsterPath';
import { isPositionBlocked } from '../src/core/collision';
import { validatePrototypeMap, obstacleColliders } from '../src/core/prototypeMap';

const obstacles = validatePrototypeMap(JSON.parse(readFileSync(new URL('../public/assets/prototype/farm.tmj', import.meta.url), 'utf8')));
const colliders = obstacleColliders(obstacles);
const config = { ...MONSTER_CONFIG, spawn: { col: 16.5, row: 16.5 }, seed: 1234 };
const at = (distance) => ({ col: config.spawn.col + distance, row: config.spawn.row });
const tick = (state, target, frames, dt = 20, geometry = [], settings = config) => {
    for (let n = 0; n < frames; n++) state = updateMonster(state, target, dt, geometry, settings);
    return state;
};

describe('Slime state machine and configuration', () => {
    it('spawns exactly once at a clear configured point, initially idle', () => {
        const s = createMonster(colliders);
        expect(s.body.position).toEqual(MONSTER_CONFIG.spawn);
        expect(s.mode).toBe('IDLE'); expect(s.body.motion).toBe('idle');
        expect(s.waitMs).toBeGreaterThanOrEqual(1000); expect(s.waitMs).toBeLessThanOrEqual(3000);
        expect(updateMonster(s, { col: 16.5, row: 16.5 }, 20, colliders).mode).toBe('IDLE');
    });
    it('rejects obstructed and out-of-map spawn', () => {
        expect(() => createMonster([{ id: 1, minCol: 16, maxCol: 17, minRow: 16, maxRow: 17 }], config)).toThrow();
        expect(() => createMonster([], { ...config, spawn: { col: -1, row: 2 } })).toThrow();
    });
    it.each([{ detectionRange: 6 }, { chaseSpeed: 4 }, { idleMinMs: 4000 }, { replanMs: 0 }, { seed: NaN }, { wanderRadius: 9 }])('rejects invalid config %j', change => {
        expect(() => createMonster([], { ...config, ...change })).toThrow();
    });
    it('IDLE becomes WANDER after its seeded 1–3 second wait', () => {
        let s = createMonster([], config);
        s = tick(s, undefined, Math.ceil(s.waitMs / 20));
        expect(s.mode).toBe('WANDER'); expect(groundDistance(s.goal, s.spawn)).toBeLessThanOrEqual(3);
    });
    it('WANDER becomes CHASE when the target enters detection range', () => {
        const idle = createMonster([], config);
        const wander = tick(idle, undefined, Math.ceil(idle.waitMs / 20));
        expect(updateMonster(wander, at(3), 20, [], config).mode).toBe('CHASE');
    });
    it.each([[3.999, 'CHASE'], [4, 'CHASE'], [4.001, 'IDLE']])('detection distance %s uses the ground plane', (d, mode) => {
        expect(updateMonster(createMonster([], config), at(d), 20, [], config).mode).toBe(mode);
    });
    it('hysteresis retains CHASE between four and six cells', () => {
        const s = updateMonster(createMonster([], config), at(4), 20, [], config);
        for (const d of [4.01, 5, 6]) {
            const target = { col: s.body.position.col + d, row: s.body.position.row };
            expect(updateMonster(s, target, 20, [], config).mode).toBe('CHASE');
        }
        expect(updateMonster(s, { col: s.body.position.col + 6.01, row: s.body.position.row }, 20, [], config).mode).toBe('RETURN');
    });
    it('CHASE loses an absent/invalid target and RETURN ignores detection until home', () => {
        const chase = tick(createMonster([], config), at(3), 40);
        for (const target of [undefined, { col: NaN, row: 1 }]) {
            const returning = updateMonster(chase, target, 20, [], config);
            expect(returning.mode).toBe('RETURN');
            expect(updateMonster(returning, at(2), 20, [], config).mode).toBe('RETURN');
        }
    });
    it('RETURN reaches home and becomes IDLE', () => {
        let s = tick(createMonster([], config), at(3), 50);
        let returned = false;
        for (let n = 0; n < 200; n++) { s = updateMonster(s, undefined, 20, [], config); if (s.mode === 'IDLE') { returned = true; break; } }
        expect(returned).toBe(true);
        expect(groundDistance(s.body.position, s.spawn)).toBeLessThanOrEqual(config.arrivalDistance);
    });
    it('enforces target leash and never moves beyond its spawn radius', () => {
        let s = createMonster([], config);
        for (let n = 0; n < 1000; n++) {
            const target = { col: Math.min(31.75, s.body.position.col + 3), row: s.body.position.row };
            s = updateMonster(s, target, 20, [], config);
            expect(groundDistance(s.body.position, s.spawn)).toBeLessThanOrEqual(8 + 1e-9);
        }
        const chased = tick(createMonster([], config), at(3), 20);
        expect(updateMonster(chased, at(8.001), 20, [], config).mode).toBe('RETURN');
    });
    it('replays wander choices with a fixed seed and diverges for another seed', () => {
        const a = tick(createMonster([], config), undefined, 400);
        const b = tick(createMonster([], config), undefined, 400);
        const other = tick(createMonster([], { ...config, seed: 2 }), undefined, 400);
        expect(a).toEqual(b); expect(a.body.position).not.toEqual(other.body.position);
    });
    it('HIT interrupts movement, then returns; DEAD is absorbing', () => {
        const chasing = tick(createMonster([], config), at(3), 10);
        const hit = monsterEvent(chasing, 'HIT');
        const held = tick(hit, at(3), 10);
        expect(held.mode).toBe('HIT'); expect(held.body.position).toEqual(hit.body.position);
        expect(held.body.motion).toBe('idle'); expect(tick(held, at(3), 5).mode).toBe('RETURN');
        const dead = monsterEvent(chasing, 'DEAD');
        expect(tick(dead, at(3), 1000)).toBe(dead); expect(monsterEvent(dead, 'HIT')).toBe(dead);
    });
    it.each([0, -1, NaN, Infinity])('invalid delta %s does not move or advance timers', dt => {
        const s = createMonster([], config); expect(updateMonster(s, at(3), dt, [], config)).toBe(s);
    });
    it('uses 0.8 wander and 1.8 chase speed without frame partition drift', () => {
        const start = createMonster([], config);
        const moving = { ...start, mode: 'WANDER', goal: at(3) };
        const one = tick(moving, undefined, 20, 50), two = tick(moving, undefined, 100, 10);
        expect(groundDistance(one.body.position, start.body.position)).toBeCloseTo(0.8, 10);
        expect(groundDistance(one.body.position, two.body.position)).toBeLessThan(1e-10);
        const chase = tick(start, at(3), 100, 10);
        expect(groundDistance(chase.body.position, start.body.position)).toBeCloseTo(1.8, 10);
    });
});

describe('Slime navigation through existing collision geometry', () => {
    it.each(['tree', 'rock'])('routes around a %s without penetrating', kind => {
        const obstacle = obstacles.find(o => o.kind === kind);
        const settings = { ...config, spawn: { col: obstacle.col - 1, row: obstacle.row + 0.5 } };
        const target = { col: obstacle.col + 2, row: obstacle.row + 0.5 };
        const path = findMonsterPath(settings.spawn, target, settings.spawn, 8, colliders);
        expect(path.length).toBeGreaterThan(1);
        let s = createMonster(colliders, settings);
        for (let n = 0; n < 500; n++) {
            s = updateMonster(s, target, 20, colliders, settings);
            expect(isPositionBlocked(s.body.position, colliders)).toBe(false);
        }
        expect(groundDistance(s.body.position, target)).toBeLessThanOrEqual(config.arrivalDistance);
    });
    it('bounded failed searches time out to RETURN instead of jittering forever in CHASE', () => {
        const wall = [{ id: 1, minCol: 18.2, maxCol: 18.8, minRow: 0, maxRow: 32 }];
        expect(findMonsterPath(config.spawn, at(4), config.spawn, 8, wall)).toEqual([]);
        let s = createMonster(wall, config), returned = false;
        for (let n = 0; n < 150; n++) {
            s = updateMonster(s, at(4), 20, wall, config);
            if (s.mode === 'RETURN') { returned = true; break; }
        }
        expect(returned).toBe(true); expect(s.body.position).toEqual(config.spawn);
    });
    it('large delta is capped and cannot tunnel through a thin wall', () => {
        const wall = [{ id: 1, minCol: 16.8, maxCol: 16.801, minRow: 0, maxRow: 32 }];
        let s = createMonster(wall, config);
        for (let n = 0; n < 100; n++) {
            const before = s.body.position; s = updateMonster(s, at(3), 60000, wall, config);
            expect(groundDistance(s.body.position, before)).toBeLessThanOrEqual(0.09 + 1e-9);
            expect(isPositionBlocked(s.body.position, wall)).toBe(false);
        }
    });
    it('an unreachable home yields to an idle retry delay instead of endless pushing', () => {
        const wall = [{ id: 1, minCol: 18.2, maxCol: 18.8, minRow: 0, maxRow: 32 }];
        const initial = createMonster(wall, config);
        let s = { ...initial, mode: 'RETURN', goal: initial.spawn,
            body: { ...initial.body, position: { col: 20.5, row: 16.5 } } };
        let yielded = false;
        for (let n = 0; n < 110; n++) {
            s = updateMonster(s, undefined, 20, wall, config);
            if (s.mode === 'IDLE') { yielded = true; break; }
        }
        expect(yielded).toBe(true); expect(s.body.position).toEqual({ col: 20.5, row: 16.5 });
        expect(s.waitMs).toBeGreaterThanOrEqual(config.idleMinMs);
    });
    it('wander near map edges never escapes bounds', () => {
        const settings = { ...config, spawn: { col: 0.25, row: 0.25 } };
        let s = createMonster([], settings);
        for (let n = 0; n < 2000; n++) {
            s = updateMonster(s, undefined, 50, [], settings);
            expect(s.body.position.col).toBeGreaterThanOrEqual(0.25); expect(s.body.position.row).toBeGreaterThanOrEqual(0.25);
            expect(s.body.position.col).toBeLessThanOrEqual(31.75); expect(s.body.position.row).toBeLessThanOrEqual(31.75);
        }
    });
});
