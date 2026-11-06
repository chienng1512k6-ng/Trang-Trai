import type { Scene } from 'phaser';
import { createPlayer, movePlayer, type PlayerState } from '../../core/player';
import type { WorldPosition, GridPosition } from '../../core/isometric';
import { idleInput, type PlayerInput } from './input';
import { PlayerView } from './PlayerView';
import type { GridCollider } from '../../core/collision';

export class Player {
    private current: PlayerState;
    readonly view: PlayerView;
    constructor(scene: Scene, origin: WorldPosition, private input: PlayerInput = idleInput,
        private readonly colliders: readonly GridCollider[] = []) {
        this.current = createPlayer(undefined, colliders);
        this.view = new PlayerView(scene, origin);
        this.view.sync(this.current);
    }
    get state(): PlayerState { return this.current; }
    setInput(input: PlayerInput) { this.input = input; }
    update(deltaMs: number, enabled = true) {
        const input = this.input.sample(deltaMs);
        this.current = movePlayer(this.current, enabled ? input : { col: 0, row: 0 }, deltaMs, this.colliders);
        this.view.sync(this.current);
    }
    respawn(position?: GridPosition) {
        this.current = createPlayer(position, this.colliders); this.view.sync(this.current);
    }
    destroy() { this.view.destroy(); }
}
