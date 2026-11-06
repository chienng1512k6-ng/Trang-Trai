import type { Input, Scene } from 'phaser';
import { keyboardIntent, MOVEMENT_CODES } from '../../core/keyboardIntent';
import type { PlayerInput } from './input';
import { PressLatch } from '../../core/pressLatch';

/** DOM boundary kept injectable so listener/focus behavior can be tested without Phaser/DOM rendering. */
export interface KeyboardEnvironment {
    readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
    readonly document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'activeElement' | 'hidden' | 'hasFocus'>;
}

export function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as Element | null;
    if (typeof element?.closest !== 'function') return false;
    const editable = element.closest('input, textarea, select, [contenteditable]');
    return editable !== null && (editable.matches('input, textarea, select') || editable.getAttribute('contenteditable') !== 'false');
}

export class KeyboardInput implements PlayerInput {
    private readonly pressed = new Set<string>();
    private readonly attack = new PressLatch();
    private focused = true;
    private disposed = false;
    private readonly reset = () => { this.pressed.clear(); this.attack.reset(); };
    private readonly blur = () => { this.focused = false; this.reset(); };
    private readonly focus = () => { this.focused = true; this.reset(); };
    private readonly down = (event: KeyboardEvent) => {
        if (event.code !== 'Space' && !MOVEMENT_CODES.some(code => code === event.code)) return;
        if (this.blocked() || isEditableTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
            this.reset();
            return;
        }
        if (event.code === 'Space') { this.attack.down(event.repeat); event.preventDefault(); return; }
        // After focus loss, an OS auto-repeat must not resurrect an old hold.
        if (event.repeat && !this.pressed.has(event.code)) return;
        this.pressed.add(event.code);
        event.preventDefault();
    };
    private readonly up = (event: KeyboardEvent) => { this.pressed.delete(event.code); if (event.code === 'Space') this.attack.up(); };

    constructor(
        private readonly keyboard: Pick<Input.Keyboard.KeyboardPlugin, 'on' | 'off'>,
        private readonly events: Pick<Scene['events'], 'on' | 'off'>,
        private readonly environment: KeyboardEnvironment = { window, document },
    ) {
        keyboard.on('keydown', this.down);
        keyboard.on('keyup', this.up);
        environment.window.addEventListener('blur', this.blur);
        environment.window.addEventListener('focus', this.focus);
        environment.document.addEventListener('visibilitychange', this.reset);
        environment.document.addEventListener('focusin', this.reset);
        events.on('pause', this.reset);
        events.on('sleep', this.reset);
        events.on('shutdown', this.destroy);
        events.on('destroy', this.destroy);
    }
    private blocked() {
        const doc = this.environment.document;
        return this.disposed || !this.focused || doc.hidden || !doc.hasFocus() || isEditableTarget(doc.activeElement);
    }
    sample() {
        if (this.blocked()) this.reset();
        return keyboardIntent(this.pressed);
    }
    consumeAttack() { if (this.blocked()) this.reset(); return this.attack.consume(); }
    readonly destroy = () => {
        if (this.disposed) return;
        this.disposed = true;
        this.reset();
        this.keyboard.off('keydown', this.down);
        this.keyboard.off('keyup', this.up);
        this.environment.window.removeEventListener('blur', this.blur);
        this.environment.window.removeEventListener('focus', this.focus);
        this.environment.document.removeEventListener('visibilitychange', this.reset);
        this.environment.document.removeEventListener('focusin', this.reset);
        this.events.off('pause', this.reset);
        this.events.off('sleep', this.reset);
        this.events.off('shutdown', this.destroy);
        this.events.off('destroy', this.destroy);
    };
}
