import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
    AUTO: 0,
    Scale: { FIT: 3, CENTER_BOTH: 1 },
    Scene: class {},
    Game: vi.fn(function () {}),
}));

import { Game } from 'phaser';
import StartGame from './main';
import { Game as MainScene } from './scenes/Game';

describe('game bootstrap', () => {
    beforeEach(() => vi.clearAllMocks());

    it('mounts the game in the requested container and registers the initial scene', () => {
        const game = StartGame('test-container');
        expect(Game).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            parent: 'test-container',
            scene: [MainScene],
        }));
        expect(game).toBeInstanceOf(Game);
    });

    it('creates independent game instances for different containers', () => {
        const first = StartGame('first');
        const second = StartGame('second');
        expect(first).not.toBe(second);
        expect(Game).toHaveBeenNthCalledWith(2, expect.objectContaining({ parent: 'second' }));
    });
});
