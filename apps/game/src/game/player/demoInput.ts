import { movementDelta } from '../../core/player';
import type { PlayerInput } from './input';

/** Imported only by the DEV branch; no keyboard, touch or gameplay controls. */
export class DemoInput implements PlayerInput {
    private elapsed = 0;
    sample(deltaMs: number) {
        const delta = movementDelta(deltaMs);
        const result = { col: 0, row: 0 };
        let remaining = delta;
        // Average partial walk/idle intervals so crossing a phase boundary does
        // not add an extra frame of movement on each lap.
        while (remaining > 0) {
            const segment = Math.floor(this.elapsed / 1500) % 4;
            const phase = this.elapsed % 1500;
            const walking = phase < 1000;
            const duration = Math.min(remaining, (walking ? 1000 : 1500) - phase);
            if (walking) {
                const direction = [{ col: 1, row: 0 }, { col: 0, row: 1 },
                    { col: -1, row: 0 }, { col: 0, row: -1 }][segment];
                result.col += direction.col * duration / delta;
                result.row += direction.row * duration / delta;
            }
            this.elapsed += duration;
            remaining -= duration;
        }
        return result;
    }
}
