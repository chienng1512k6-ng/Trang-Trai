import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevPerformance } from '../src/game/DevPerformance';

function fixture() {
    const parent = { children: [], append(child) { this.children.push(child); } };
    const doc = new EventTarget(), win = new EventTarget();
    doc.hidden = false;
    doc.createElement = () => ({ style: {}, remove() { parent.children = parent.children.filter(c => c !== this); } });
    doc.querySelectorAll = selector => parent.children.filter(c => '.' + c.className === selector);
    let now = 0;
    vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('performance', { now: () => now });
    const scene = { children: { list: [{ name: 'green-slime' }, { name: 'obstacle-tree' }] },
        events: new EventEmitter(), input: { keyboard: new EventEmitter() }, data: new Map() };
    const game = { events: new EventEmitter(), scale: new EventEmitter(), scene: { getScene: () => scene } };
    scene.game = game;
    const probe = DevPerformance.attach(scene, parent);
    return { scene, game, probe, parent, doc, win, tick(ms) { now += ms; game.events.emit('poststep'); } };
}
afterEach(() => vi.unstubAllGlobals());
describe('development performance probe lifecycle', () => {
    it('reuses one probe across scene attachment/restart and cleans up on Game destroy', () => {
        const f = fixture();
        const removeDoc = vi.spyOn(f.doc, 'removeEventListener'), removeWin = vi.spyOn(f.win, 'removeEventListener');
        for (let n = 0; n < 10; n++) expect(DevPerformance.attach(f.scene, f.parent)).toBe(f.probe);
        expect(f.parent.children).toHaveLength(1); expect(f.game.events.listenerCount('poststep')).toBe(1);
        expect(f.scene.events.listenerCount('update')).toBe(0);
        f.game.events.emit('destroy'); expect(f.parent.children).toHaveLength(0);
        expect(f.game.events.listenerCount('poststep')).toBe(0);
        expect(removeDoc).toHaveBeenCalledOnce(); expect(removeWin).toHaveBeenCalledTimes(2);
    });
    it('keeps real visible stalls and excludes explicit focus/visibility discontinuities', () => {
        const f = fixture(); f.tick(0); f.tick(16); f.tick(100);
        expect(f.probe.snapshot().frames).toMatchObject({ samples: 2, over50ms: 1, maxMs: 100 });
        f.win.dispatchEvent(new Event('blur')); f.tick(10000); f.tick(16);
        expect(f.probe.snapshot().frames.samples).toBe(3);
        expect(f.probe.snapshot().excludedDiscontinuities).toBe(1);
        f.doc.hidden = true; f.tick(10000); f.doc.hidden = false; f.tick(10000); f.tick(16);
        expect(f.probe.snapshot().frames.samples).toBe(4);
        f.game.events.emit('destroy');
    });
    it('exports object counts and AI milliseconds separately, and resets windows', () => {
        const f = fixture(); f.tick(0); f.tick(16); f.probe.recordAI(0); f.probe.recordAI(0.2);
        expect(f.probe.snapshot()).toMatchObject({ objects: { total: 2, slimes: 1, obstacles: 1 }, heapBytes: null,
            ai: { samples: 2, meanMs: 0.1 } });
        expect(f.probe.snapshot().ai).not.toHaveProperty('meanFPS');
        f.probe.reset(); expect(f.probe.snapshot().frames.samples).toBe(0); expect(f.probe.snapshot().ai.samples).toBe(0);
        f.game.events.emit('destroy');
    });
});
