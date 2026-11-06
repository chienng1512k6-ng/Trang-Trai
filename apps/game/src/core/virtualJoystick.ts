import { screenIntentToGrid } from './keyboardIntent';

export interface JoystickPosition { readonly x: number; readonly y: number }

export class VirtualJoystick {
    private owner: number | null = null;
    private knob: JoystickPosition = { x: 0, y: 0 };
    constructor(readonly deadZone = 0.15) {
        if (!Number.isFinite(deadZone) || deadZone < 0 || deadZone >= 1) throw new RangeError('Dead zone must be in [0,1).');
    }
    get pointerId() { return this.owner; }
    get displacement(): JoystickPosition { return { ...this.knob }; }
    begin(pointerId: number) {
        if (this.owner !== null) return false;
        this.owner = pointerId;
        return true;
    }
    /** Coordinates relative to fixed ring center; radius in CSS pixels. */
    move(pointerId: number, offset: JoystickPosition, radius: number) {
        if (pointerId !== this.owner) return;
        if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
            this.knob = { x: 0, y: 0 };
            return;
        }
        const x = offset.x / radius, y = offset.y / radius;
        const length = Math.hypot(x, y);
        if (!Number.isFinite(length)) { this.knob = { x: 0, y: 0 }; return; }
        const scale = Math.max(1, length);
        this.knob = { x: x / scale, y: y / scale };
    }
    release(pointerId: number) {
        if (pointerId === this.owner) this.reset();
    }
    reset() { this.owner = null; this.knob = { x: 0, y: 0 }; }
    sample() {
        const length = Math.hypot(this.knob.x, this.knob.y);
        const magnitude = Math.max(0, Math.min(1, (length - this.deadZone) / (1 - this.deadZone)));
        return screenIntentToGrid(this.knob, magnitude);
    }
}

export class ActionPointer {
    private owner: number | null = null;
    get pointerId() { return this.owner; }
    get pressed() { return this.owner !== null; }
    begin(pointerId: number) {
        if (this.owner !== null) return false;
        this.owner = pointerId;
        return true;
    }
    release(pointerId: number) { if (this.owner === pointerId) this.reset(); }
    reset() { this.owner = null; }
}
