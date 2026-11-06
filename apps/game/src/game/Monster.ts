import type { Scene, GameObjects } from 'phaser';
import { createMonster, updateMonster, monsterEvent, MONSTER_CONFIG, type MonsterConfig,
    type MonsterState } from '../core/monster';
import { gridToWorld, type GridPosition, type WorldPosition } from '../core/isometric';
import type { GridCollider } from '../core/collision';

export const SLIME_ART = Object.freeze({ key: 'green-slime', url: 'assets/monsters/green-slime.png', frameWidth: 32, frameHeight: 32 });
export class MonsterView {
    readonly sprite: GameObjects.Sprite;
    private animation = '';
    private depth?: number;
    constructor(scene: Scene, private readonly origin: WorldPosition) {
        if (!scene.textures.exists(SLIME_ART.key)) throw new Error('Green Slime texture is missing.');
        for (const [name, start, end, frameRate] of [
            ['idle', 0, 1, 3], ['move', 2, 5, 8], ['hit', 6, 6, 1], ['dead', 7, 7, 1],
        ] as const) {
            const key = `slime-${name}`;
            if (!scene.anims.exists(key)) scene.anims.create({ key,
                frames: scene.anims.generateFrameNumbers(SLIME_ART.key, { start, end }), frameRate,
                repeat: name === 'idle' || name === 'move' ? -1 : 0 });
        }
        this.sprite = scene.add.sprite(0, 0, SLIME_ART.key).setName('green-slime').setOrigin(0.5, 28 / 32).setScale(1.5);
    }
    sync(state: MonsterState) {
        const foot = gridToWorld(state.body.position, undefined, this.origin);
        this.sprite.setPosition(foot.x, foot.y);
        if (this.depth !== foot.y) { this.sprite.setDepth(foot.y); this.depth = foot.y; }
        const key = `slime-${state.mode === 'HIT' ? 'hit' : state.mode === 'DEAD' ? 'dead' : state.body.motion === 'walk' ? 'move' : 'idle'}`;
        if (key !== this.animation) { this.sprite.play(key, true); this.animation = key; }
    }
    destroy() { this.sprite.destroy(); }
}

/** Scene owns one lifecycle and one update; FSM has no Phaser/timer dependency. */
export class Monster {
    private current: MonsterState;
    readonly view: MonsterView;
    constructor(scene: Scene, origin: WorldPosition, private readonly colliders: readonly GridCollider[],
        private readonly config: MonsterConfig = MONSTER_CONFIG) {
        this.current = createMonster(colliders, config);
        this.view = new MonsterView(scene, origin);
        this.view.sync(this.current);
    }
    get state() { return this.current; }
    update(deltaMs: number, target?: GridPosition) {
        this.current = updateMonster(this.current, target, deltaMs, this.colliders, this.config);
        this.view.sync(this.current);
    }
    event(event: 'HIT' | 'DEAD') { this.current = monsterEvent(this.current, event); this.view.sync(this.current); }
    destroy() { this.view.destroy(); }
}
