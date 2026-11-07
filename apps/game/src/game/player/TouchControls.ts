import type { Scene } from 'phaser';
import { VirtualJoystick, ActionPointer } from '../../core/virtualJoystick';
import { isEditableTarget } from './KeyboardInput';

/** Screen-space DOM overlay. Pointer IDs/capture are independent of Phaser's world pointers. */
export class TouchControls {
    readonly joystick: VirtualJoystick;
    readonly action = new ActionPointer();
    readonly root: HTMLDivElement;
    private readonly ring: HTMLDivElement;
    private readonly knob: HTMLSpanElement;
    private readonly button: HTMLButtonElement;
    private readonly removers: (() => void)[] = [];
    private portrait = false;
    private focused = true;
    private disposed = false;
    constructor(private readonly events: Pick<Scene['events'], 'on' | 'off'>,
        parent: HTMLElement, deadZone = 0.15) {
        this.joystick = new VirtualJoystick(deadZone);
        this.root = document.createElement('div');
        this.root.className = 'touch-controls';
        this.root.innerHTML = '<div class="virtual-joystick" aria-label="Movement joystick"><span class="joystick-knob"></span><span class="joystick-label">MOVE</span></div>'
            + '<button type="button" class="touch-action" aria-label="Attack" aria-pressed="false">ATTACK<small>Face the Slime</small></button>'
            + '<div class="orientation-prompt" role="status">Rotate your device to landscape<br><small>Xoay thiết bị sang ngang để chơi</small></div>';
        parent.append(this.root);
        this.ring = this.root.querySelector<HTMLDivElement>('.virtual-joystick')!;
        this.knob = this.root.querySelector<HTMLSpanElement>('.joystick-knob')!;
        this.button = this.root.querySelector<HTMLButtonElement>('.touch-action')!;

        this.listen(this.ring, 'pointerdown', event => {
            const pointer = event as PointerEvent;
            if (pointer.button !== 0 || this.isBlocked() || this.action.pointerId === pointer.pointerId
                || !this.joystick.begin(pointer.pointerId)) return;
            pointer.preventDefault(); pointer.stopPropagation();
            this.ring.setPointerCapture(pointer.pointerId);
            this.move(pointer);
        });
        this.listen(this.ring, 'pointermove', event => this.move(event as PointerEvent));
        this.listen(this.button, 'pointerdown', event => {
            const pointer = event as PointerEvent;
            if (pointer.button !== 0 || this.isBlocked() || this.joystick.pointerId === pointer.pointerId
                || !this.action.begin(pointer.pointerId)) return;
            pointer.preventDefault(); pointer.stopPropagation();
            this.button.setPointerCapture(pointer.pointerId);
            this.draw();
        });
        // Safari compatibility: CSS is the primary gesture policy, but device QA
        // found double-tap page zoom despite touch-action:none. Cancel only this
        // button's touch-end default; attacks still come exclusively from pointers.
        // No timing filter, document-wide gesture handler or synthetic click input.
        this.listen(this.button, 'touchend', event => {
            if (event.cancelable) event.preventDefault();
        }, { passive: false });
        for (const target of [this.ring, this.button]) {
            for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
                this.listen(target, name, event => {
                    const pointer = event as PointerEvent;
                    if (name !== 'pointerup' && this.action.pointerId === pointer.pointerId) this.action.reset();
                    this.joystick.release(pointer.pointerId);
                    this.action.release(pointer.pointerId);
                    this.draw();
                });
            }
            this.listen(target, 'contextmenu', event => event.preventDefault());
        }
        this.listen(window, 'blur', () => { this.focused = false; this.reset(); });
        this.listen(window, 'focus', () => { this.focused = true; this.reset(); });
        this.listen(document, 'visibilitychange', this.reset);
        this.listen(document, 'focusin', () => { if (isEditableTarget(document.activeElement)) this.reset(); });
        this.listen(window, 'resize', this.layout);
        for (const event of ['pause', 'sleep']) events.on(event, this.reset);
        for (const event of ['shutdown', 'destroy']) events.on(event, this.destroy);
        this.layout();
    }
    private listen(target: EventTarget, event: string, handler: EventListener, options?: AddEventListenerOptions) {
        target.addEventListener(event, handler, options);
        this.removers.push(() => target.removeEventListener(event, handler, options));
    }
    readonly isBlocked = () => this.disposed || this.portrait || !this.focused || document.hidden
        || !document.hasFocus() || isEditableTarget(document.activeElement);
    private move(event: PointerEvent) {
        if (this.joystick.pointerId !== event.pointerId) return;
        if (this.isBlocked()) { this.reset(); return; }
        event.preventDefault(); event.stopPropagation();
        const rect = this.ring.getBoundingClientRect();
        // Knob radius is 35% of ring radius; its center travels the remaining 65%.
        this.joystick.move(event.pointerId, { x: event.clientX - rect.left - rect.width / 2,
            y: event.clientY - rect.top - rect.height / 2 }, rect.width / 2 * 0.65);
        this.draw();
    }
    private draw() {
        const offset = this.joystick.displacement;
        const travel = this.ring.getBoundingClientRect().width / 2 * 0.65;
        this.knob.style.transform = `translate(${offset.x * travel}px, ${offset.y * travel}px)`;
        this.button.setAttribute('aria-pressed', String(this.action.pressed));
    }
    private readonly layout = () => {
        this.reset();
        this.portrait = window.innerHeight > window.innerWidth;
        this.root.classList.toggle('is-portrait', this.portrait);
    };
    readonly reset = () => {
        const captures = [[this.ring, this.joystick.pointerId], [this.button, this.action.pointerId]] as const;
        this.joystick.reset(); this.action.reset();
        for (const [element, id] of captures) {
            if (id !== null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
        }
        this.draw();
    };
    readonly destroy = () => {
        if (this.disposed) return;
        this.disposed = true;
        this.reset();
        this.removers.splice(0).forEach(remove => remove());
        for (const event of ['pause', 'sleep']) this.events.off(event, this.reset);
        for (const event of ['shutdown', 'destroy']) this.events.off(event, this.destroy);
        this.root.remove();
    };
}
