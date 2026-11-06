import type { Scene, GameObjects } from 'phaser';
import { playerWorldPosition, type PlayerState, type Facing } from '../../core/player';
import type { WorldPosition } from '../../core/isometric';

export const PLAYER_ART = Object.freeze({ key: 'player-placeholder', url: 'assets/player/farmer.png',
    frameWidth: 32, frameHeight: 48, footX: 16, footY: 46, columns: 6 });
export const PLAYER_FACINGS: readonly Facing[] = ['southEast', 'southWest', 'northWest', 'northEast'];

export class PlayerView {
    readonly sprite: GameObjects.Sprite;
    private animation = '';
    constructor(scene: Scene, private readonly origin: WorldPosition) {
        if (!scene.textures.exists(PLAYER_ART.key)) throw new Error('Player spritesheet is missing.');
        for (const [row, facing] of PLAYER_FACINGS.entries()) {
            for (const motion of ['idle', 'walk'] as const) {
                const key = `player-${motion}-${facing}`;
                if (!scene.anims.exists(key)) scene.anims.create({ key,
                    frames: scene.anims.generateFrameNumbers(PLAYER_ART.key, {
                        start: row * PLAYER_ART.columns + (motion === 'idle' ? 0 : 2),
                        end: row * PLAYER_ART.columns + (motion === 'idle' ? 1 : 5),
                    }), frameRate: motion === 'idle' ? 2 : 8, repeat: -1 });
            }
        }
        this.sprite = scene.add.sprite(0, 0, PLAYER_ART.key)
            .setOrigin(PLAYER_ART.footX / PLAYER_ART.frameWidth, PLAYER_ART.footY / PLAYER_ART.frameHeight)
            .setScale(1.5);
    }
    sync(state: PlayerState) {
        const foot = playerWorldPosition(state, this.origin);
        this.sprite.setPosition(foot.x, foot.y).setDepth(foot.y);
        const key = `player-${state.motion}-${state.facing}`;
        if (key !== this.animation) {
            this.sprite.play(key, true);
            this.animation = key;
        }
    }
    destroy() { this.sprite.destroy(); }
}
