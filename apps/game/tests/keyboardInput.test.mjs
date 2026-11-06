import { describe, expect, it, vi } from 'vitest';
import { KeyboardInput, isEditableTarget } from '../src/game/player/KeyboardInput';

class Emitter {
    listeners = new Map();
    on(event, listener) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(listener);
    }
    off(event, listener) { this.listeners.get(event)?.delete(listener); }
    emit(event, value) { for (const listener of [...(this.listeners.get(event) ?? [])]) listener(value); }
    count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
class DomTarget extends Emitter {
    hidden = false;
    activeElement = null;
    hasFocus() { return true; }
    addEventListener(event, listener) { this.on(event, listener); }
    removeEventListener(event, listener) { this.off(event, listener); }
}
function fixture() {
    const keyboard = new Emitter(), events = new Emitter();
    const environment = { window: new DomTarget(), document: new DomTarget() };
    const input = new KeyboardInput(keyboard, events, environment);
    const key = (code, options = {}) => ({ code, repeat: false, preventDefault: vi.fn(), ...options });
    return { keyboard, events, environment, input, key };
}
const editable = (tag = 'input') => ({ closest: () => ({ matches: () => tag !== 'contenteditable', getAttribute: () => 'true' }) });

describe('Phaser keyboard adapter lifecycle and focus', () => {
    it('Space buffers one attack per press, preserving quick taps and simultaneous movement', () => {
        const { keyboard, input, key } = fixture();
        keyboard.emit('keydown', key('KeyW')); keyboard.emit('keydown', key('Space'));
        keyboard.emit('keyup', key('Space'));
        expect(input.consumeAttack()).toBe(true); expect(input.consumeAttack()).toBe(false);
        expect(input.sample().col).toBeLessThan(0);
        keyboard.emit('keydown', key('Space'));
        expect(input.consumeAttack()).toBe(true);
        for (let n = 0; n < 10; n++) { keyboard.emit('keydown', key('Space', { repeat: true })); expect(input.consumeAttack()).toBe(false); }
        input.destroy();
    });
    it.each(['blur', 'visibilitychange', 'pause', 'sleep'])('clears pending combat on %s', event => {
        const { keyboard, input, key, environment, events } = fixture(); keyboard.emit('keydown', key('Space'));
        (event === 'blur' ? environment.window : event === 'visibilitychange' ? environment.document : events).emit(event);
        expect(input.consumeAttack()).toBe(false); input.destroy();
    });
    it.each(['input', 'textarea', 'contenteditable'])('Space does not capture typing in %s', tag => {
        const { keyboard, input, key, environment } = fixture(); const target = editable(tag);
        environment.document.activeElement = target; const event = key('Space', { target });
        keyboard.emit('keydown', event); expect(event.preventDefault).not.toHaveBeenCalled();
        expect(input.consumeAttack()).toBe(false); input.destroy();
    });
    it('does not capture unimplemented actions or unrelated keys', () => {
        const { keyboard, input, key } = fixture();
        for (const code of ['KeyE', 'ArrowUp']) {
            const event = key(code);
            keyboard.emit('keydown', event);
            expect(event.preventDefault).not.toHaveBeenCalled();
        }
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        input.destroy();
    });
    it('handles repeated keydown and release without stacking movement', () => {
        const { keyboard, input, key } = fixture();
        const event = key('KeyW');
        keyboard.emit('keydown', event);
        const first = input.sample();
        keyboard.emit('keydown', key('KeyW', { repeat: true }));
        expect(input.sample()).toEqual(first);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        keyboard.emit('keyup', key('KeyW'));
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        keyboard.emit('keydown', key('KeyD'));
        expect(input.sample().col).toBeGreaterThan(0);
        input.destroy();
    });
    it('cancels simultaneous opposite key events', () => {
        const { keyboard, input, key } = fixture();
        keyboard.emit('keydown', key('KeyW')); keyboard.emit('keydown', key('KeyS'));
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        keyboard.emit('keyup', key('KeyS'));
        expect(input.sample().col).toBeLessThan(0);
        input.destroy();
    });
    it('clears held keys on blur and ignores repeat after focus returns', () => {
        const { keyboard, environment, input, key } = fixture();
        keyboard.emit('keydown', key('KeyW'));
        environment.window.emit('blur');
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        environment.window.emit('focus');
        keyboard.emit('keydown', key('KeyW', { repeat: true }));
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        keyboard.emit('keydown', key('KeyW'));
        expect(input.sample().col).toBeLessThan(0);
        input.destroy();
    });
    it('clears holds on tab visibility, scene pause and sleep', () => {
        const { keyboard, environment, events, input, key } = fixture();
        for (const event of ['pause', 'sleep', 'visibilitychange']) {
            keyboard.emit('keydown', key('KeyD'));
            (event === 'visibilitychange' ? environment.document : events).emit(event);
            expect(input.sample()).toEqual({ col: 0, row: 0 });
        }
        environment.document.hidden = true;
        keyboard.emit('keydown', key('KeyD'));
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        input.destroy();
    });
    it.each(['input', 'textarea', 'contenteditable'])('does not capture typing in %s', tag => {
        const { keyboard, environment, input, key } = fixture();
        const target = editable(tag);
        environment.document.activeElement = target;
        environment.document.emit('focusin');
        const event = key('KeyW', { target });
        keyboard.emit('keydown', event);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        input.destroy();
    });
    it('ignores editable event targets even if activeElement has changed', () => {
        const { keyboard, input, key } = fixture();
        const event = key('KeyA', { target: editable() });
        keyboard.emit('keydown', event);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        input.destroy();
    });
    it('clears previous holds when focus enters a text field', () => {
        const { keyboard, environment, input, key } = fixture();
        keyboard.emit('keydown', key('KeyA'));
        environment.document.emit('focusin');
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        input.destroy();
    });
    it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }])('respects shortcuts/composition %o', options => {
        const { keyboard, input, key } = fixture();
        const event = key('KeyD', options);
        keyboard.emit('keydown', event);
        expect(input.sample()).toEqual({ col: 0, row: 0 });
        expect(event.preventDefault).not.toHaveBeenCalled();
        input.destroy();
    });
    it('removes all owned listeners over repeated scene shutdown/restart cycles', () => {
        const { keyboard, events, environment, input } = fixture();
        input.destroy();
        for (let n = 0; n < 10; n++) {
            new KeyboardInput(keyboard, events, environment);
            expect(keyboard.count()).toBe(2);
            expect(environment.window.count()).toBe(2);
            expect(environment.document.count()).toBe(2);
            events.emit('shutdown');
            for (const target of [keyboard, events, environment.window, environment.document]) expect(target.count()).toBe(0);
        }
        input.destroy();
    });
    it('accepts null/non-element targets without accessing browser globals', () => {
        expect(isEditableTarget(null)).toBe(false);
        expect(isEditableTarget({})).toBe(false);
        expect(isEditableTarget({ closest: () => ({ matches: () => false, getAttribute: () => 'false' }) })).toBe(false);
    });
});
