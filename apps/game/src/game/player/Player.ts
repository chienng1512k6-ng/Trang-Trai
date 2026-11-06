import type { Scene } from 'phaser';
import { createPlayer, movePlayer, type PlayerState } from '../../core/player';
import type { WorldPosition } from '../../core/isometric';
import { idleInput, type PlayerInput } from './input';
import { PlayerView } from './PlayerView';

export class Player {
    private current: PlayerState = createPlayer();
    readonly view: PlayerView;
    constructor(scene: Scene, origin: WorldPosition, private input: PlayerInput = idleInput) {
        this.view = new PlayerView(scene, origin);
        this.view.sync(this.current);
    }
    get state(): PlayerState { return this.current; }
    setInput(input: PlayerInput) { this.input = input; }
    update(deltaMs: number) {
        this.current = movePlayer(this.current, this.input.sample(deltaMs), deltaMs);
        this.view.sync(this.current);
    }
    destroy() { this.view.destroy(); }
}
