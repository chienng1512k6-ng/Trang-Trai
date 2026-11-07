import { Math as PhaserMath, TintModes, type Scene, type GameObjects } from 'phaser';
import { COMBAT_CONFIG, createCombat, stepCombat, recoverCombat, FACING_VECTOR, type CombatState } from '../core/combat';
import { gridToWorld, type GridPosition } from '../core/isometric';
import { movementDelta } from '../core/player';
import { MAP_ORIGIN } from '../core/prototypeMap';
import { assertClearSpawn, type GridCollider } from '../core/collision';
import type { Player } from './player/Player';
import type { Monster } from './Monster';

/** One combat update, no movement/AI loop and no asynchronous combat timers. */
export class CombatController {
    private current = createCombat();
    readonly root: HTMLDivElement;
    private readonly hp: HTMLElement;
    private readonly message: HTMLElement;
    private readonly recover: HTMLButtonElement;
    private readonly swing: GameObjects.Graphics;
    private playerFlash = 0;
    private slimeFlash = 0;
    private swingRemaining = 0;
    private recovering = false;
    private disposed = false;
    constructor(private readonly scene: Scene, private readonly player: Player, private readonly monster: Monster,
        private readonly colliders: readonly GridCollider[], parent: HTMLElement, private readonly sampleAttack: () => boolean) {
        assertClearSpawn(COMBAT_CONFIG.recoveryPosition, colliders);
        this.root = document.createElement('div'); this.root.className = 'combat-hud';
        this.root.innerHTML = '<div class="combat-hp"></div><div class="combat-message" role="status">Space / ATTACK · E reserved</div>'
            + '<button type="button" class="combat-recover" hidden>Recover at safe spawn</button>';
        parent.append(this.root);
        this.hp = this.root.querySelector('.combat-hp')!; this.message = this.root.querySelector('.combat-message')!;
        this.recover = this.root.querySelector('button')!;
        this.recover.addEventListener('click', this.requestRecovery);
        this.swing = scene.add.graphics().setDepth(2000);
        scene.events.once('shutdown', this.destroy); scene.events.once('destroy', this.destroy);
        this.render();
    }
    get state(): CombatState { return this.current; }
    get canControl() { return this.current.player.hp > 0; }
    private readonly requestRecovery = () => { if (!this.canControl) this.recovering = true; };
    update(deltaMs: number) {
        const attack = this.sampleAttack(); // Always drain input, including cooldown/knockout frames.
        const dt = movementDelta(deltaMs);
        this.playerFlash = Math.max(0, this.playerFlash - dt); this.slimeFlash = Math.max(0, this.slimeFlash - dt);
        this.swingRemaining = Math.max(0, this.swingRemaining - dt);
        if (this.recovering) {
            this.recovering = false;
            if (!this.canControl) {
                this.player.respawn(COMBAT_CONFIG.recoveryPosition);
                if (this.current.slime.hp > 0) this.monster.reset();
                this.current = recoverCombat(this.current);
                this.message.textContent = 'Recovered at safe spawn';
            }
        } else {
            this.current = stepCombat(this.current, { player: this.player.state.position, facing: this.player.state.facing,
                slime: this.monster.state.body.position, slimeMode: this.monster.state.mode }, attack, dt, this.colliders);
            for (const event of this.current.events) {
                if (event.type === 'attack') {
                    this.swingRemaining = COMBAT_CONFIG.swingMs;
                    this.drawSwing(event.origin, event.facing, event.result === 'hit' ? 0xa8f080 : 0xffd077);
                    this.message.textContent = event.result === 'hit' ? 'Hit!' : event.result === 'blocked' ? 'Blocked by obstacle' : 'Miss';
                } else if (event.type === 'slime-hit' || event.type === 'slime-dead') {
                    this.slimeFlash = COMBAT_CONFIG.flashMs;
                    this.monster.event(event.type === 'slime-dead' ? 'DEAD' : 'HIT');
                    if (event.type === 'slime-dead') this.message.textContent = 'Slime defeated';
                } else if (event.type === 'player-hit') {
                    this.playerFlash = COMBAT_CONFIG.flashMs; this.message.textContent = 'Player hurt';
                } else if (event.type === 'knockout') this.message.textContent = 'Knocked out — recover when ready';
            }
        }
        this.player.view.sprite.setTint(this.playerFlash > 0 ? 0xff7777 : 0xffffff).setAlpha(this.canControl ? 1 : 0.4);
        this.monster.view.sprite.clearTint();
        if (this.slimeFlash > 0) this.monster.view.sprite.setTint(0xffffff).setTintMode(TintModes.FILL);
        if (this.swingRemaining === 0) this.swing.clear();
        this.render();
    }
    private drawSwing(origin: GridPosition, facing: keyof typeof FACING_VECTOR, color: number) {
        const vector = FACING_VECTOR[facing], angle = Math.atan2(vector.row, vector.col);
        const half = COMBAT_CONFIG.playerArcDegrees * Math.PI / 360;
        const points = [gridToWorld(origin, undefined, MAP_ORIGIN)];
        for (let n = 0; n <= 12; n++) {
            const a = angle - half + 2 * half * n / 12;
            points.push(gridToWorld({ col: origin.col + Math.cos(a) * COMBAT_CONFIG.playerRange,
                row: origin.row + Math.sin(a) * COMBAT_CONFIG.playerRange }, undefined, MAP_ORIGIN));
        }
        this.swing.clear().lineStyle(2, color, 0.9).fillStyle(color, 0.18)
            .fillPoints(points.map(p => new PhaserMath.Vector2(p.x, p.y)), true)
            .strokePoints(points.map(p => new PhaserMath.Vector2(p.x, p.y)), true);
    }
    private render() {
        const { player, slime } = this.current;
        const text = `Player HP ${player.hp}/${player.maxHP} · Slime HP ${slime.hp}/${slime.maxHP}`;
        if (this.hp.textContent !== text) this.hp.textContent = text;
        if (this.recover.hidden !== this.canControl) this.recover.hidden = this.canControl;
    }
    readonly destroy = () => {
        if (this.disposed) return; this.disposed = true;
        this.scene.events.off('shutdown', this.destroy); this.scene.events.off('destroy', this.destroy);
        this.recover.removeEventListener('click', this.requestRecovery); this.root.remove(); this.swing.destroy();
    };
}
