import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Monster, MonsterView, SLIME_ART } from '../src/game/Monster';
import { createMonster, monsterEvent, MONSTER_CONFIG } from '../src/core/monster';
import { createDepthComparator } from '../src/game/depthOrder';
function fixture() {
    const sprite = {};
    for (const name of ['setName', 'setOrigin', 'setScale', 'setPosition', 'setDepth', 'play', 'destroy']) sprite[name] = vi.fn(() => sprite);
    const scene = { textures: { exists: () => true }, add: { sprite: vi.fn(() => sprite) },
        anims: { exists: () => false, create: vi.fn(), generateFrameNumbers: vi.fn((_key, range) => range) } };
    return { sprite, scene };
}
describe('Monster rendering and lifecycle', () => {
    it('creates idle/move/hit/dead animations without another sprite per frame', () => {
        const { sprite, scene } = fixture(); const monster = new Monster(scene, { x: 1024, y: 0 }, []);
        expect(scene.anims.create.mock.calls.map(([c]) => [c.key, c.frames.start, c.frames.end])).toEqual([
            ['slime-idle', 0, 1], ['slime-move', 2, 5], ['slime-hit', 6, 6], ['slime-dead', 7, 7],
        ]);
        for (let n = 0; n < 5; n++) monster.update(10);
        expect(scene.add.sprite).toHaveBeenCalledOnce(); expect(sprite.play).toHaveBeenCalledOnce();
        expect(sprite.setDepth).toHaveBeenCalledOnce();
    });
    it('places the authored footpoint at the existing projection', () => {
        const { sprite, scene } = fixture(); const view = new MonsterView(scene, { x: 1024, y: 0 });
        view.sync(createMonster([]));
        expect(sprite.setOrigin).toHaveBeenCalledWith(0.5, 28 / 32);
        expect(sprite.setPosition).toHaveBeenLastCalledWith(1216, 624);
        expect(sprite.setDepth).toHaveBeenLastCalledWith(624);
    });
    it('shares front/back and stable tie sorting with other actors', () => {
        const tree = { depth: 400 }, slime = { depth: 399 };
        const compare = createDepthComparator(o => o.depth, [tree, slime]);
        expect(compare(slime, tree)).toBeLessThan(0);
        slime.depth = 401; expect(compare(slime, tree)).toBeGreaterThan(0);
        slime.depth = 400; expect(compare(slime, tree)).toBeGreaterThan(0);
    });
    it('renders internal HIT/DEAD hooks and does not restart unchanged animations', () => {
        const { sprite, scene } = fixture(); const monster = new Monster(scene, { x: 1024, y: 0 }, []);
        monster.event('HIT'); expect(sprite.play).toHaveBeenLastCalledWith('slime-hit', true);
        monster.update(10, MONSTER_CONFIG.spawn); expect(sprite.play).toHaveBeenCalledTimes(2);
        monster.event('DEAD'); expect(sprite.play).toHaveBeenLastCalledWith('slime-dead', true);
        monster.update(50); expect(sprite.play).toHaveBeenCalledTimes(3);
        monster.destroy(); expect(sprite.destroy).toHaveBeenCalledOnce();
    });
    it('restarts with fresh seeded state, independent of the prior dead entity', () => {
        const f = fixture(), first = new Monster(f.scene, { x: 0, y: 0 }, []);
        first.event('DEAD'); first.destroy();
        const second = new Monster(f.scene, { x: 0, y: 0 }, []);
        expect(second.state).toEqual(createMonster([])); expect(second.state.mode).toBe('IDLE');
    });
    it('contains a correctly sized PNG atlas and original source attribution', () => {
        const png = readFileSync(new URL('../public/assets/monsters/green-slime.png', import.meta.url));
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(png.readUInt32BE(16)).toBe(SLIME_ART.frameWidth * 8); expect(png.readUInt32BE(20)).toBe(32);
        expect(readFileSync(new URL('../public/assets/ATTRIBUTION.md', import.meta.url), 'utf8')).toContain('FDS-010 Green Slime');
    });
    it('view sync is independent of camera zoom and scroll', () => {
        const { sprite, scene } = fixture(); scene.cameras = { main: { zoom: 0.5, scrollX: -900 } };
        const view = new MonsterView(scene, { x: 1024, y: 0 }); const s = monsterEvent(createMonster([]), 'HIT');
        view.sync(s); scene.cameras.main.zoom = 3; scene.cameras.main.scrollX = 1900; view.sync(s);
        expect(sprite.setPosition.mock.calls).toEqual([[1216, 624], [1216, 624]]);
    });
});
