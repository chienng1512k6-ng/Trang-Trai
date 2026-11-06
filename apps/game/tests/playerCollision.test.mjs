import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/game/player/PlayerView', () => ({ PlayerView: class {
    sync = vi.fn(); destroy = vi.fn();
} }));
import { Player } from '../src/game/player/Player';
import { CombinedInput } from '../src/game/player/CombinedInput';
import { VirtualJoystick } from '../src/core/virtualJoystick';
import { screenIntentToGrid } from '../src/core/keyboardIntent';
import { isPositionBlocked } from '../src/core/collision';

const collider = { id: 1, minCol: 16.8, maxCol: 17.2, minRow: 15.5, maxRow: 17.5 };
describe('Player uses one collision path for device-independent input', () => {
    it('knockout gating drains input without moving; explicit safe respawn validates collision', () => {
        const input = { sample: vi.fn(() => ({ col: 1, row: 0 })) };
        const player = new Player({}, { x: 1024, y: 0 }, input, [collider]);
        const initial = player.state.position; player.update(16, false);
        expect(player.state.position).toEqual(initial); expect(player.state.motion).toBe('idle');
        expect(input.sample).toHaveBeenCalledOnce(); player.respawn({ col: 15, row: 15 });
        expect(player.state.position).toEqual({ col: 15, row: 15 });
        expect(() => player.respawn({ col: 17, row: 16 })).toThrow();
    });
    it.each(['keyboard', 'joystick'])('resolves %s input before syncing the view', device => {
        const joystick = new VirtualJoystick();
        const keyboard = { sample: () => device === 'keyboard' ? screenIntentToGrid({ x: 1, y: 0 }) : { col: 0, row: 0 } };
        if (device === 'joystick') { joystick.begin(2); joystick.move(2, { x: 100, y: 0 }, 50); }
        const input = new CombinedInput(keyboard, joystick, () => false);
        const player = new Player({}, { x: 1024, y: 0 }, input, [collider]);
        for (let n = 0; n < 5; n++) {
            player.update(16);
            expect(isPositionBlocked(player.state.position, [collider])).toBe(false);
        }
        expect(player.state.position.col).toBeCloseTo(16.62);
        expect(player.state.position.row).toBeLessThan(16.5);
        expect(player.view.sync).toHaveBeenLastCalledWith(player.state);
    });
    it('rejects the default spawn when map metadata covers it', () => {
        expect(() => new Player({}, { x: 1024, y: 0 }, undefined,
            [{ id: 1, minCol: 16, maxCol: 17, minRow: 16, maxRow: 17 }])).toThrow(/spawn overlaps/);
    });
});
