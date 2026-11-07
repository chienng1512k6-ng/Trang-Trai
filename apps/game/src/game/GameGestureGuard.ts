import type { Scene } from 'phaser';

const RECOVERY_TAP_SLOP_PX = 10;

/** Browser gesture compatibility only. No movement, attack or camera actions. */
export class GameGestureGuard {
    private recovery?: { id: number; button: HTMLButtonElement; x: number; y: number; moved: boolean };
    private disposed = false;
    private readonly options = { passive: false, capture: false };
    constructor(private readonly root: HTMLElement, private readonly events: Pick<Scene['events'], 'on' | 'off'>) {
        root.addEventListener('touchstart', this.start, { passive: true });
        root.addEventListener('touchmove', this.move, { passive: true });
        root.addEventListener('touchend', this.end, this.options);
        root.addEventListener('touchcancel', this.reset);
        window.addEventListener('blur', this.reset);
        document.addEventListener('visibilitychange', this.reset);
        for (const event of ['pause', 'sleep']) events.on(event, this.reset);
        for (const event of ['shutdown', 'destroy']) events.on(event, this.destroy);
    }
    private target(event: TouchEvent): Element | undefined {
        const element = event.target as Element | null;
        if (!element || typeof element.closest !== 'function' || !this.root.contains(element)
            || element.closest('input, textarea, select, [contenteditable], a')) return;
        return element;
    }
    private readonly start = (event: TouchEvent) => {
        const button = this.target(event)?.closest<HTMLButtonElement>('.combat-recover');
        if (!button || this.recovery || event.changedTouches.length !== 1) return;
        const touch = event.changedTouches[0];
        this.recovery = { id: touch.identifier, button, x: touch.clientX, y: touch.clientY, moved: false };
    };
    private readonly move = (event: TouchEvent) => {
        const owner = this.recovery;
        if (!owner) return;
        for (const touch of Array.from(event.changedTouches)) {
            if (touch.identifier === owner.id && Math.hypot(touch.clientX - owner.x, touch.clientY - owner.y) > RECOVERY_TAP_SLOP_PX)
                owner.moved = true;
        }
    };
    private readonly end = (event: TouchEvent) => {
        const element = this.target(event);
        if (!element || !event.cancelable) { this.reset(); return; }
        const button = element.closest<HTMLButtonElement>('.combat-recover');
        if (button) {
            // Canceling touchend suppresses the native compatibility click too.
            // Restore ONE native button activation only for a valid owned tap.
            // Keyboard/mouse/assistive clicks never pass through this handler.
            const alreadyPrevented = event.defaultPrevented;
            event.preventDefault();
            if (alreadyPrevented) { this.reset(); return; }
            const owner = this.recovery;
            if (!owner) return;
            const touch = Array.from(event.changedTouches).find(t => t.identifier === owner.id);
            if (!touch) return;
            this.reset();
            const rect = button.getBoundingClientRect();
            if (owner.button === button && !owner.moved && !button.disabled && !button.hidden
                && Math.hypot(touch.clientX - owner.x, touch.clientY - owner.y) <= RECOVERY_TAP_SLOP_PX
                && touch.clientX >= rect.left && touch.clientX <= rect.right
                && touch.clientY >= rect.top && touch.clientY <= rect.bottom) button.click();
        } else if (element.closest('#game-container, .virtual-joystick, .camera-zoom button, .orientation-prompt')) {
            // These already act via Phaser / pointerdown, not touch-generated clicks.
            // Attack retains its separately device-verified FIX-001 handler.
            event.preventDefault();
        }
    };
    private readonly reset = () => { this.recovery = undefined; };
    readonly destroy = () => {
        if (this.disposed) return; this.disposed = true; this.reset();
        this.root.removeEventListener('touchstart', this.start, this.options);
        this.root.removeEventListener('touchmove', this.move, this.options);
        this.root.removeEventListener('touchend', this.end, this.options);
        this.root.removeEventListener('touchcancel', this.reset);
        window.removeEventListener('blur', this.reset);
        document.removeEventListener('visibilitychange', this.reset);
        for (const event of ['pause', 'sleep']) this.events.off(event, this.reset);
        for (const event of ['shutdown', 'destroy']) this.events.off(event, this.destroy);
    };
}
