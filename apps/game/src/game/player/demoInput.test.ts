import { expect, it } from 'vitest';
import { createPlayer, movePlayer } from '../../core/player';
import { DemoInput } from './demoInput';
import { idleInput } from './input';

it('provides a neutral default input', () => {
    expect(idleInput.sample(16)).toEqual({ col: 0, row: 0 });
});
it('returns to spawn across demo laps without frame-boundary drift', () => {
    const input = new DemoInput();
    let state = createPlayer();
    // 12 seconds, two complete laps, frames crossing walk/idle boundaries.
    for (let i = 0; i < 720; i++) state = movePlayer(state, input.sample(1000 / 60), 1000 / 60);
    expect(state.position.col).toBeCloseTo(16.5, 9);
    expect(state.position.row).toBeCloseTo(16.5, 9);
});
it('keeps the demo clock still on unsafe delta', () => {
    const input = new DemoInput();
    expect(input.sample(NaN)).toEqual({ col: 0, row: 0 });
    expect(input.sample(16)).toEqual({ col: 1, row: 0 });
});
