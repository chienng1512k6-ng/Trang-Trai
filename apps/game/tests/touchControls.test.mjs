import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchControls } from '../src/game/player/TouchControls';

class Target {
    listeners = new Map(); children = []; attributes = new Map(); captures = new Set(); style = {};
    classList = { toggle: (name, enabled) => this.attributes.set(name, enabled) };
    on(name, fn) { this.addEventListener(name, fn); }
    off(name, fn) { this.removeEventListener(name, fn); }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name, event = {}) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(event); }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    querySelector(name) { return this.parts[name]; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}
function fixture() {
    const win = new Target(), doc = new Target(), events = new Target(), parent = new Target();
    Object.assign(win, { innerWidth: 800, innerHeight: 400 });
    Object.assign(doc, { hidden: false, activeElement: null, hasFocus: () => true });
    let ring, knob, button;
    doc.createElement = () => {
        const root = new Target(); ring = new Target(); knob = new Target(); button = new Target();
        root.parts = { '.virtual-joystick': ring, '.joystick-knob': knob, '.touch-action': button };
        return root;
    };
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
    const touch = new TouchControls(events, parent);
    const pointer = (pointerId, clientX = 100, clientY = 50) => ({ pointerId, clientX, clientY, button: 0,
        preventDefault: vi.fn(), stopPropagation: vi.fn() });
    return { win, doc, events, parent, touch, ring, knob, button, pointer };
}
afterEach(() => vi.unstubAllGlobals());

describe('touch overlay events and lifecycle', () => {
    it('cancels only Attack touch-end defaults, with an explicitly non-passive listener', () => {
        const add = vi.spyOn(Target.prototype, 'addEventListener');
        const f = fixture();
        const touch = f.touch;
        expect(add.mock.calls.filter((_, i) => add.mock.contexts[i] === f.button))
            .toContainEqual(['touchend', expect.any(Function), { passive: false }]);
        const end = { cancelable: true, preventDefault: vi.fn() };
        f.button.emit('touchend', end); expect(end.preventDefault).toHaveBeenCalledOnce();
        expect(touch.action.consumeAttack()).toBe(false);
        const notCancelable = { cancelable: false, preventDefault: vi.fn() };
        f.button.emit('touchend', notCancelable); expect(notCancelable.preventDefault).not.toHaveBeenCalled();
        expect(f.doc.listeners.has('touchend')).toBe(false); expect(f.win.listeners.has('touchend')).toBe(false);
        touch.destroy(); add.mockRestore();
    });
    it.each([2, 10])('%s rapid Attack taps preserve every pointer edge without duplicate touch-end attacks', count => {
        const { ring, button, touch, pointer } = fixture();
        ring.emit('pointerdown', pointer(1));
        for (let n = 0; n < count; n++) {
            button.emit('pointerdown', pointer(2)); button.emit('pointerup', pointer(2, -100, -100));
            button.emit('touchend', { cancelable: true, preventDefault() {} });
            button.emit('lostpointercapture', pointer(2));
            expect(touch.action.consumeAttack()).toBe(true); expect(touch.action.consumeAttack()).toBe(false);
            expect(touch.action.pressed).toBe(false); expect(touch.joystick.pointerId).toBe(1);
        }
        button.emit('pointerdown', pointer(2)); button.emit('pointercancel', pointer(2));
        button.emit('touchend', { cancelable: true, preventDefault() {} });
        expect(touch.action.consumeAttack()).toBe(false); touch.destroy();
    });
    it('quick Action release buffers once without stopping joystick', () => {
        const { ring, button, touch, pointer } = fixture();
        ring.emit('pointerdown', pointer(1)); button.emit('pointerdown', pointer(2));
        button.emit('pointerup', pointer(2)); button.emit('lostpointercapture', pointer(2));
        expect(touch.action.consumeAttack()).toBe(true); expect(touch.action.consumeAttack()).toBe(false);
        expect(touch.joystick.pointerId).toBe(1); touch.destroy();
    });
    it.each(['pointercancel', 'lostpointercapture'])('Action %s clears buffered activation but not joystick', event => {
        const { ring, button, touch, pointer } = fixture();
        ring.emit('pointerdown', pointer(1)); button.emit('pointerdown', pointer(2)); button.emit(event, pointer(2));
        expect(touch.action.consumeAttack()).toBe(false); expect(touch.joystick.pointerId).toBe(1); touch.destroy();
    });
    it('captures a joystick drag and releases safely outside the ring', () => {
        const { ring, touch, pointer } = fixture();
        ring.emit('pointerdown', pointer(1)); expect(ring.hasPointerCapture(1)).toBe(true);
        expect(touch.joystick.sample().col).toBeGreaterThan(0);
        ring.emit('pointermove', pointer(1, -100, 50)); expect(touch.joystick.sample().col).toBeLessThan(0);
        ring.emit('pointerup', pointer(1)); expect(touch.joystick.pointerId).toBeNull(); touch.destroy();
    });
    it.each(['pointercancel', 'lostpointercapture'])('stops owned movement on %s', event => {
        const { ring, touch, pointer } = fixture(); ring.emit('pointerdown', pointer(1)); ring.emit(event, pointer(1));
        expect(touch.joystick.sample()).toEqual({ col: 0, row: 0 }); touch.destroy();
    });
    it('keeps two pointer lifetimes separate and prevents stealing', () => {
        const { ring, button, touch, pointer } = fixture();
        ring.emit('pointerdown', pointer(1)); button.emit('pointerdown', pointer(2));
        ring.emit('pointerdown', pointer(3)); ring.emit('pointermove', pointer(3, -100, 50));
        expect(touch.joystick.pointerId).toBe(1); expect(touch.joystick.sample().col).toBeGreaterThan(0);
        button.emit('pointerup', pointer(2)); expect(touch.joystick.pointerId).toBe(1);
        button.emit('pointerdown', pointer(2)); ring.emit('pointerup', pointer(1));
        expect(touch.action.pressed).toBe(true); expect(button.attributes.get('aria-pressed')).toBe('true');
        button.emit('pointercancel', pointer(2)); expect(touch.action.pressed).toBe(false); touch.destroy();
    });
    it('resets captures and controls on resize/orientation then requires a new drag', () => {
        const { ring, touch, pointer, win } = fixture(); ring.emit('pointerdown', pointer(1));
        win.innerWidth = 400; win.innerHeight = 800; win.emit('resize');
        expect(touch.joystick.pointerId).toBeNull(); expect(ring.hasPointerCapture(1)).toBe(false);
        expect(touch.isBlocked()).toBe(true); expect(touch.root.attributes.get('is-portrait')).toBe(true);
        ring.emit('pointerdown', pointer(2)); expect(touch.joystick.pointerId).toBeNull();
        win.innerWidth = 800; win.innerHeight = 400; win.emit('resize'); expect(touch.isBlocked()).toBe(false); touch.destroy();
    });
    it.each(['blur', 'visibilitychange', 'pause', 'sleep'])('clears touch/action on %s', event => {
        const { ring, button, touch, pointer, win, doc, events } = fixture();
        ring.emit('pointerdown', pointer(1)); button.emit('pointerdown', pointer(2));
        (event === 'blur' ? win : event === 'visibilitychange' ? doc : events).emit(event);
        expect(touch.joystick.pointerId).toBeNull(); expect(touch.action.pressed).toBe(false); touch.destroy();
    });
    it('rejects touch while typing', () => {
        const { ring, touch, pointer, doc } = fixture();
        doc.activeElement = { closest: () => ({ matches: () => true }) };
        ring.emit('pointerdown', pointer(1)); expect(touch.joystick.pointerId).toBeNull(); touch.destroy();
    });
    it('removes overlay and all owned listeners on scene shutdown, including repeated disposal', () => {
        const { ring, button, touch, win, doc, events, parent } = fixture();
        events.emit('shutdown'); touch.destroy();
        for (const target of [ring, button, win, doc, events]) expect(target.count()).toBe(0);
        expect(parent.children).toHaveLength(0);
        const next = new TouchControls(events, parent); expect(parent.children).toHaveLength(1);
        events.emit('shutdown'); expect(parent.children).toHaveLength(0); next.destroy();
    });
});
