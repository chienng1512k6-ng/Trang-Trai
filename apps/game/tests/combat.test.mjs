import { describe, expect, it } from 'vitest';
import { COMBAT_CONFIG as C, createHealth, damageHealth, createCombat, stepCombat, recoverCombat, playerAttackResult } from '../src/core/combat';
import { PressLatch } from '../src/core/pressLatch';
import { ActionPointer, VirtualJoystick } from '../src/core/virtualJoystick';
import { keyboardIntent } from '../src/core/keyboardIntent';
import { isSegmentBlocked } from '../src/core/collision';
import { createMonster, monsterEvent, updateMonster } from '../src/core/monster';

const actors = { player: { col: 10, row: 10 }, facing: 'southEast', slime: { col: 11, row: 10 }, slimeMode: 'CHASE' };
const advance = (s, ms, a = actors, attack = false, step = 10) => {
    for (let n = 0; n < ms / step; n++) s = stepCombat(s, a, attack, step, []);
    return s;
};
describe('health and activation input', () => {
    it('initializes both actors with configured max HP', () => {
        expect(createCombat().player).toEqual({ hp: 5, maxHP: 5 });
        expect(createCombat().slime).toEqual({ hp: 3, maxHP: 3 });
    });
    it('clamps health and rejects healing disguised as negative damage', () => {
        expect(damageHealth(createHealth(5), 1).hp).toBe(4);
        expect(damageHealth(createHealth(5), 900).hp).toBe(0);
        expect(damageHealth({ hp: 6, maxHP: 5 }, 0).hp).toBe(5);
        expect(() => damageHealth(createHealth(5), -1)).toThrow();
        expect(() => createHealth(0)).toThrow();
    });
    it('one Space hold produces one activation even across repeated samples/OS repeats', () => {
        const press = new PressLatch(); press.down(); expect(press.consume()).toBe(true);
        for (let n = 0; n < 100; n++) { press.down(true); expect(press.consume()).toBe(false); }
        press.up(); press.down(); expect(press.consume()).toBe(true);
    });
    it('preserves quick taps and clears canceled or blurred input', () => {
        const press = new PressLatch(); press.down(); press.up(); expect(press.consume()).toBe(true);
        press.down(); press.reset(); expect(press.consume()).toBe(false);
        press.down(true); expect(press.consume()).toBe(false); press.down(); expect(press.consume()).toBe(true);
    });
    it('two pointers keep joystick and Action activation independent', () => {
        const joy = new VirtualJoystick(), action = new ActionPointer(); joy.begin(1); joy.move(1, { x: 100, y: 0 }, 50);
        action.begin(2); expect(action.consumeAttack()).toBe(true); expect(action.consumeAttack()).toBe(false);
        expect(action.begin(3)).toBe(false); action.release(3); expect(action.pressed).toBe(true);
        action.release(2); expect(joy.pointerId).toBe(1); expect(joy.sample().col).toBeGreaterThan(0);
        action.begin(2); action.reset(); expect(action.consumeAttack()).toBe(false);
    });
});
describe('range, direction and static occlusion', () => {
    it.each([['southEast', 1, 0], ['southWest', 0, 1], ['northWest', -1, 0], ['northEast', 0, -1]])('hits facing %s and misses behind', (facing, c, r) => {
        expect(playerAttackResult({ ...actors, facing, slime: { col: 10 + c, row: 10 + r } }, [])).toBe('hit');
        expect(playerAttackResult({ ...actors, facing, slime: { col: 10 - c, row: 10 - r } }, [])).toBe('miss');
    });
    it.each([['KeyW'], ['KeyA'], ['KeyS'], ['KeyD'], ['KeyW', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA']])('agrees with existing screen-to-grid intent %j', (...keys) => {
        const codes = keys.filter(k => typeof k === 'string');
        const v = keyboardIntent(new Set(codes));
        const facing = Math.abs(v.col) >= Math.abs(v.row) ? (v.col >= 0 ? 'southEast' : 'northWest') : (v.row >= 0 ? 'southWest' : 'northEast');
        expect(playerAttackResult({ ...actors, facing, slime: { col: 10 + v.col, row: 10 + v.row } }, [])).toBe('hit');
    });
    it.each([[1.3, 'hit'], [1.30001, 'miss']])('range boundary %s', (d, expected) => {
        expect(playerAttackResult({ ...actors, slime: { col: 10 + d, row: 10 } }, [])).toBe(expected);
    });
    it.each([[49.999, 'hit'], [50, 'hit'], [50.01, 'miss']])('arc boundary %s degrees', (degrees, expected) => {
        const a = degrees * Math.PI / 180;
        expect(playerAttackResult({ ...actors, slime: { col: 10 + Math.cos(a), row: 10 + Math.sin(a) } }, [])).toBe(expected);
    });
    it('blocks both attacks through a thin static footprint', () => {
        const wall = [{ id: 1, minCol: 10.2, maxCol: 10.201, minRow: 9, maxRow: 11 }];
        expect(playerAttackResult(actors, wall)).toBe('blocked');
        const close = { ...actors, slime: { col: 10.7, row: 10 } };
        const result = stepCombat(createCombat(), close, true, 16, wall);
        expect(result.slime.hp).toBe(3); expect(result.player.hp).toBe(5);
        expect(stepCombat(createCombat(), close, false, 16, wall).player.hp).toBe(5);
    });
    it('segment slab handles tangent, reversed, parallel and zero-length rays', () => {
        const b = [{ id: 1, minCol: 1, maxCol: 2, minRow: 1, maxRow: 2 }];
        expect(isSegmentBlocked({ col: 0, row: 1 }, { col: 3, row: 1 }, b)).toBe(true);
        expect(isSegmentBlocked({ col: 3, row: 1.5 }, { col: 0, row: 1.5 }, b)).toBe(true);
        expect(isSegmentBlocked({ col: 0, row: 0 }, { col: 3, row: 0 }, b)).toBe(false);
        expect(isSegmentBlocked({ col: 0, row: 0 }, { col: 0, row: 0 }, b)).toBe(false);
    });
});
describe('combat resolution, FSM hooks and cooldowns', () => {
    it('one activation applies damage once, and stale events never replay', () => {
        const first = stepCombat(createCombat(), actors, true, 16, []);
        expect(first.slime.hp).toBe(2); expect(first.activation).toBe(1);
        const again = stepCombat(first, actors, false, 16, []);
        expect(again.slime.hp).toBe(2); expect(again.events).toEqual([]);
    });
    it('cooldown drops spam instead of queuing attacks', () => {
        const first = stepCombat(createCombat(), actors, true, 10, []);
        const spam = advance(first, 440, actors, true);
        expect(spam.activation).toBe(1); expect(spam.slime.hp).toBe(2);
        const allowed = stepCombat(spam, actors, true, 10, []);
        expect(allowed.activation).toBe(2); expect(allowed.slime.hp).toBe(1);
    });
    it('three valid hits kill; DEAD cannot take damage or attack/move', () => {
        let state = createCombat(), monster = createMonster([]);
        for (let n = 0; n < 3; n++) {
            state = stepCombat(state, { ...actors, slimeMode: monster.mode }, true, 10, []);
            const event = state.events.find(e => e.type === 'slime-hit' || e.type === 'slime-dead');
            monster = monsterEvent(monster, event.type === 'slime-dead' ? 'DEAD' : 'HIT');
            if (n < 2) { expect(monster.mode).toBe('HIT'); state = advance(state, 450); }
        }
        expect(state.slime.hp).toBe(0); expect(monster.mode).toBe('DEAD');
        expect(updateMonster(monster, actors.player, 50, [])).toBe(monster);
        const after = advance(state, 2000, { ...actors, slimeMode: 'DEAD' }, true);
        expect(after.slime.hp).toBe(0); expect(after.player.hp).toBe(5);
    });
    it('HIT prevents retaliation and player attack wins same-frame resolution', () => {
        const close = { ...actors, slime: { col: 10.5, row: 10 } };
        expect(stepCombat(createCombat(), close, true, 10, []).player.hp).toBe(5);
        expect(stepCombat(createCombat(), { ...close, slimeMode: 'HIT' }, false, 10, []).player.hp).toBe(5);
    });
    it('Slime attacks only in CHASE/range with its independent cooldown', () => {
        const close = { ...actors, slime: { col: 10.85, row: 10 } };
        let s = stepCombat(createCombat(), close, false, 10, []); expect(s.player.hp).toBe(4);
        s = advance(s, 1190, close); expect(s.player.hp).toBe(4);
        s = stepCombat(s, close, false, 10, []); expect(s.player.hp).toBe(3);
        expect(stepCombat(createCombat(), actors, false, 10, []).player.hp).toBe(5);
        expect(stepCombat(createCombat(), { ...close, slimeMode: 'RETURN' }, false, 10, []).player.hp).toBe(5);
    });
    it('invulnerability blocks otherwise eligible damage until expiry', () => {
        const close = { ...actors, slime: { col: 10.5, row: 10 } };
        let s = { ...createCombat(), invulnerabilityMs: C.playerInvulnerabilityMs };
        s = advance(s, 490, close); expect(s.player.hp).toBe(5);
        expect(stepCombat(s, close, false, 10, []).player.hp).toBe(4);
    });
    it('knockout blocks attacks, HP stays zero, manual recovery restores health once', () => {
        const close = { ...actors, slime: { col: 10.5, row: 10 } };
        const s = stepCombat({ ...createCombat(), player: { hp: 1, maxHP: 5 } }, close, false, 10, []);
        expect(s.player.hp).toBe(0); expect(s.events.some(e => e.type === 'knockout')).toBe(true);
        const dead = advance(s, 3000, close, true); expect(dead.player.hp).toBe(0); expect(dead.activation).toBe(0);
        const revived = recoverCombat(dead); expect(revived.player.hp).toBe(5); expect(revived.invulnerabilityMs).toBe(1500);
        expect(recoverCombat(revived).events).toEqual([]);
    });
    it('normal timer partitions give equivalent results', () => {
        const state = stepCombat(createCombat(), actors, true, 10, []);
        expect(advance(state, 1000, actors, false, 10)).toEqual(advance(state, 1000, actors, false, 50));
    });
    it.each([0, -1, NaN, Infinity])('ignores abnormal delta %s without damage', dt => {
        expect(stepCombat(createCombat(), actors, true, dt, []).slime.hp).toBe(3);
    });
    it('caps a stall without spawning catch-up attacks', () => {
        const s = stepCombat(createCombat(), actors, true, 60000, []);
        expect(s.activation).toBe(1); expect(s.slime.hp).toBe(2); expect(s.playerCooldownMs).toBe(450);
    });
});
