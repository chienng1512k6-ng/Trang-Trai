import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameGestureGuard } from '../src/game/GameGestureGuard';

class Target {
    listeners = new Map();
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name, event) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(event); }
    contains(element) { return element.scope === this; }
    count() { return [...this.listeners.values()].reduce((n, list) => n + list.size, 0); }
}
function fixture() {
    const root = new Target(), win = new Target(), doc = new Target(), events = new EventEmitter();
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
    const guard = new GameGestureGuard(root, events);
    const target = (kind, scope = root) => {
        const element = { scope, disabled: false, hidden: false, click: vi.fn(),
            getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
            closest(selector) { return selector.split(',').map(s => s.trim()).includes(kind) ? this : null; } };
        return element;
    };
    const point = (identifier = 1, clientX = 50, clientY = 50) => ({ identifier, clientX, clientY });
    const send = (type, element, touches = [point()], cancelable = true) => {
        const event = { target: element, changedTouches: touches, cancelable, preventDefault: vi.fn() };
        root.emit(type, event); return event;
    };
    return { root, win, doc, events, guard, target, point, send };
}
afterEach(() => vi.unstubAllGlobals());
describe('scoped Safari game gesture compatibility', () => {
    it.each(['#game-container', '.virtual-joystick', '.camera-zoom button', '.orientation-prompt'])('suppresses touch-end defaults only on %s without generating another action', kind => {
        const f = fixture(), target = f.target(kind);
        expect(f.send('touchend', target).preventDefault).toHaveBeenCalledOnce();
        expect(target.click).not.toHaveBeenCalled(); f.guard.destroy();
    });
    it.each(['.touch-action', 'input', 'textarea', 'select', '[contenteditable]', 'a', '.ordinary-content'])('leaves %s to its own policy (including verified Attack)', kind => {
        const f = fixture();
        expect(f.send('touchend', f.target(kind)).preventDefault).not.toHaveBeenCalled(); f.guard.destroy();
    });
    it('does not cancel outside-root, non-element or noncancelable events', () => {
        const f = fixture();
        for (const target of [f.target('#game-container', {}), null, {}])
            expect(f.send('touchend', target).preventDefault).not.toHaveBeenCalled();
        expect(f.send('touchend', f.target('#game-container'), [], false).preventDefault).not.toHaveBeenCalled();
        f.guard.destroy();
    });
    it('preserves each Recover tap click with no debounce or duplicate native touch click', () => {
        const f = fixture(), button = f.target('.combat-recover');
        for (let n = 0; n < 10; n++) {
            f.send('touchstart', button);
            expect(f.send('touchend', button).preventDefault).toHaveBeenCalledOnce();
            expect(button.click).toHaveBeenCalledTimes(n + 1);
        }
        // The guard never owns native mouse/keyboard clicks.
        expect(f.root.listeners.has('click')).toBe(false); expect(f.root.listeners.has('pointerdown')).toBe(false);
        f.guard.destroy();
    });
    it('rejects moved, outside, disabled, hidden and canceled Recover taps', () => {
        const f = fixture(), b = f.target('.combat-recover');
        f.send('touchstart', b); f.send('touchmove', b, [f.point(1, 80)]); f.send('touchend', b);
        f.send('touchstart', b); f.send('touchend', b, [f.point(1, 120)]);
        b.disabled = true; f.send('touchstart', b); f.send('touchend', b); b.disabled = false;
        b.hidden = true; f.send('touchstart', b); f.send('touchend', b); b.hidden = false;
        f.send('touchstart', b); f.send('touchcancel', b); f.send('touchend', b);
        expect(b.click).not.toHaveBeenCalled(); f.guard.destroy();
    });
    it('a second touch cannot steal a pending Recover owner', () => {
        const f = fixture(), b = f.target('.combat-recover');
        f.send('touchstart', b, [f.point(1)]); f.send('touchstart', b, [f.point(2)]);
        f.send('touchend', b, [f.point(2)]); expect(b.click).not.toHaveBeenCalled();
        f.send('touchend', b, [f.point(1)]); expect(b.click).toHaveBeenCalledOnce(); f.guard.destroy();
    });
    it('does not restore a Recover click that another local handler canceled', () => {
        const f = fixture(), b = f.target('.combat-recover'); f.send('touchstart', b);
        f.root.emit('touchend', { target: b, changedTouches: [f.point()], cancelable: true,
            defaultPrevented: true, preventDefault() {} });
        expect(b.click).not.toHaveBeenCalled(); f.guard.destroy();
    });
    it.each(['blur', 'visibilitychange', 'pause', 'sleep'])('drops pending native tap on %s', name => {
        const f = fixture(), b = f.target('.combat-recover'); f.send('touchstart', b);
        (name === 'blur' ? f.win : name === 'visibilitychange' ? f.doc : f.events).emit(name);
        f.send('touchend', b); expect(b.click).not.toHaveBeenCalled(); f.guard.destroy();
    });
    it('restarts without accumulating root, DOM or scene listeners', () => {
        const f = fixture(); let guard = f.guard;
        for (let n = 0; n < 5; n++) {
            f.events.emit('shutdown'); guard.destroy();
            expect(f.root.count() + f.win.count() + f.doc.count() + f.events.eventNames().length).toBe(0);
            guard = new GameGestureGuard(f.root, f.events); expect(f.root.count()).toBe(4);
        }
        f.events.emit('destroy'); expect(f.root.count()).toBe(0);
    });
});
