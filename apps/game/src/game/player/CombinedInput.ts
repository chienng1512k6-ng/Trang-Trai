import type { PlayerInput } from './input';
import type { VirtualJoystick } from '../../core/virtualJoystick';

/** Held joystick owns movement even in its dead zone; never sum two devices. */
export class CombinedInput implements PlayerInput {
    constructor(private readonly keyboard: PlayerInput, private readonly joystick: VirtualJoystick,
        private readonly blocked: () => boolean) {}
    sample(deltaMs: number) {
        // Always sample keyboard so its focus-reset behavior still runs.
        const keys = this.keyboard.sample(deltaMs);
        if (this.blocked()) return { col: 0, row: 0 };
        return this.joystick.pointerId !== null ? this.joystick.sample() : keys;
    }
}
