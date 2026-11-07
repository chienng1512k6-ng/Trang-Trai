import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ Math: { Vector2: class { constructor(x, y) { this.x = x; this.y = y; } } }, TintModes: { FILL: 2 } }));
import { CombatController } from '../src/game/CombatController';
class Element extends EventTarget {
    children = []; parts = new Map(); textContent = ''; hidden = false;
    append(child) { this.children.push(child); child.parent = this; }
    querySelector(selector) { if (!this.parts.has(selector)) this.parts.set(selector, new Element()); return this.parts.get(selector); }
    remove() { this.parent.children = this.parent.children.filter(x => x !== this); }
}
const sprite = () => {
    const value = {};
    for (const method of ['setTint', 'setAlpha', 'clearTint', 'setTintMode']) value[method] = vi.fn(() => value);
    return value;
};
function fixture() {
    vi.stubGlobal('document', { createElement: () => new Element() });
    const parent = new Element(), graphics = {};
    for (const name of ['setDepth', 'clear', 'lineStyle', 'fillStyle', 'fillPoints', 'strokePoints', 'destroy']) graphics[name] = vi.fn(() => graphics);
    const scene = { add: { graphics: () => graphics }, events: new EventEmitter() };
    const player = { state: { position: { col: 20, row: 16.5 }, facing: 'southEast' }, view: { sprite: sprite() }, respawn: vi.fn() };
    const monster = { state: { body: { position: { col: 21, row: 16.5 } }, mode: 'CHASE' }, view: { sprite: sprite() }, reset: vi.fn(), event: vi.fn() };
    const attack = vi.fn(() => false);
    const make = () => new CombatController(scene, player, monster, [], parent, attack);
    const controller = make();
    return { controller, parent, graphics, scene, player, monster, attack, make };
}
afterEach(() => vi.unstubAllGlobals());
describe('combat scene adapter', () => {
    it('does not rewrite unchanged HUD text or recovery visibility each frame', () => {
        const f = fixture();
        const hp = f.controller.root.querySelector('.combat-hp'), button = f.controller.root.querySelector('button');
        let text = hp.textContent, hidden = button.hidden;
        const writeText = vi.fn(value => { text = value; }), writeHidden = vi.fn(value => { hidden = value; });
        Object.defineProperty(hp, 'textContent', { get: () => text, set: writeText });
        Object.defineProperty(button, 'hidden', { get: () => hidden, set: writeHidden });
        for (let n = 0; n < 120; n++) f.controller.update(16);
        expect(writeText).not.toHaveBeenCalled(); expect(writeHidden).not.toHaveBeenCalled();
        f.attack.mockReturnValueOnce(true); f.controller.update(16);
        expect(writeText).toHaveBeenCalledOnce(); expect(text).toContain('Slime HP 2/3');
    });
    it('resolves once per frame, delivers HIT once and uses Phaser 4 tint API', () => {
        const f = fixture(); f.attack.mockReturnValueOnce(true); f.controller.update(16);
        expect(f.attack).toHaveBeenCalledOnce(); expect(f.controller.state.slime.hp).toBe(2);
        expect(f.monster.event).toHaveBeenCalledExactlyOnceWith('HIT');
        expect(f.monster.view.sprite.setTintMode).toHaveBeenCalledWith(2);
        f.controller.update(16); expect(f.controller.state.slime.hp).toBe(2);
        expect(f.monster.event).toHaveBeenCalledOnce(); expect(f.graphics.fillPoints).toHaveBeenCalledOnce();
    });
    it('reflects HP and damage/knockout without an automatic respawn', () => {
        const f = fixture(); f.monster.state.body.position.col = 20.5;
        f.controller.current = { ...f.controller.state, player: { hp: 1, maxHP: 5 } };
        f.controller.update(16); expect(f.controller.canControl).toBe(false);
        expect(f.controller.root.querySelector('.combat-hp').textContent).toContain('Player HP 0/5');
        for (let n = 0; n < 100; n++) f.controller.update(50);
        expect(f.player.respawn).not.toHaveBeenCalled(); expect(f.controller.state.player.hp).toBe(0);
    });
    it('manual recovery validates a safe spawn, resets live Slime and grants protection', () => {
        const f = fixture(); f.controller.current = { ...f.controller.state, player: { hp: 0, maxHP: 5 } };
        f.controller.root.querySelector('button').dispatchEvent(new Event('click')); f.controller.update(16);
        expect(f.player.respawn).toHaveBeenCalledExactlyOnceWith({ col: 16.5, row: 16.5 });
        expect(f.monster.reset).toHaveBeenCalledOnce(); expect(f.controller.state.player.hp).toBe(5);
        expect(f.controller.state.invulnerabilityMs).toBe(1500);
        f.controller.update(16); expect(f.player.respawn).toHaveBeenCalledOnce();
    });
    it('removes UI, graphics and lifecycle listeners across restarts', () => {
        const f = fixture(); let controller = f.controller;
        for (let n = 0; n < 4; n++) {
            f.scene.events.emit('shutdown'); controller.destroy();
            expect(f.parent.children).toHaveLength(0);
            expect(f.scene.events.listenerCount('shutdown')).toBe(0); expect(f.scene.events.listenerCount('destroy')).toBe(0);
            controller = f.make(); expect(f.parent.children).toHaveLength(1);
        }
        f.scene.events.emit('destroy'); expect(f.parent.children).toHaveLength(0);
    });
    it('rejects a recovery point covered by authored collision metadata', () => {
        const f = fixture();
        expect(() => new CombatController(f.scene, f.player, f.monster,
            [{ id: 1, minCol: 16, maxCol: 17, minRow: 16, maxRow: 17 }], f.parent, f.attack)).toThrow(/spawn overlaps/);
    });
});
