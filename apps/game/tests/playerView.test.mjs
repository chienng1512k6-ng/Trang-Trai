import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PlayerView, PLAYER_ART } from '../src/game/player/PlayerView';
import { createPlayer, movePlayer } from '../src/core/player';

function fixture() {
    const sprite = {};
    for (const method of ['setOrigin', 'setScale', 'setPosition', 'setDepth', 'play', 'destroy']) {
        sprite[method] = vi.fn(() => sprite);
    }
    const scene = { textures: { exists: () => true }, add: { sprite: () => sprite },
        anims: { exists: () => false, create: vi.fn(), generateFrameNumbers: vi.fn((_key, range) => range) } };
    return { scene, sprite };
}
describe('player visual contract', () => {
    it('registers idle and walk for all four directions with correct frame ranges', () => {
        const { scene } = fixture();
        new PlayerView(scene, { x: 1024, y: 0 });
        expect(scene.anims.create).toHaveBeenCalledTimes(8);
        expect(scene.anims.create.mock.calls.map(([config]) => [config.key, config.frames.start, config.frames.end]))
            .toEqual(['southEast', 'southWest', 'northWest', 'northEast'].flatMap((direction, row) => [
                [`player-idle-${direction}`, row * 6, row * 6 + 1],
                [`player-walk-${direction}`, row * 6 + 2, row * 6 + 5],
            ]));
    });
    it('uses the sprite footpoint, world position and Y depth without restarting unchanged animation', () => {
        const { scene, sprite } = fixture();
        const view = new PlayerView(scene, { x: 1024, y: 0 });
        expect(sprite.setOrigin).toHaveBeenCalledWith(0.5, 46 / 48);
        const state = createPlayer();
        view.sync(state); view.sync(state);
        expect(sprite.setDepth).toHaveBeenCalledTimes(1);
        expect(sprite.play).toHaveBeenCalledTimes(1);
        expect(sprite.setPosition).toHaveBeenLastCalledWith(1024, 528);
        expect(sprite.setDepth).toHaveBeenLastCalledWith(528);
        view.sync(movePlayer(state, { col: 1, row: 0 }, 16));
        expect(sprite.play).toHaveBeenLastCalledWith('player-walk-southEast', true);
        expect(sprite.play).toHaveBeenCalledTimes(2);
        view.destroy(); expect(sprite.destroy).toHaveBeenCalledOnce();
    });
    it('loads a PNG atlas large enough for all 24 frames', () => {
        const png = readFileSync(new URL('../public/assets/player/farmer.png', import.meta.url));
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(png.readUInt32BE(16)).toBe(PLAYER_ART.frameWidth * 6);
        expect(png.readUInt32BE(20)).toBe(PLAYER_ART.frameHeight * 4);
    });
});
