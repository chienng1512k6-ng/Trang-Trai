import type { GridPosition } from './isometric';
import { movementDelta, type Facing } from './player';
import { isSegmentBlocked, type GridCollider } from './collision';
import type { MonsterMode } from './monster';

export const COMBAT_CONFIG = Object.freeze({ playerHP: 5, playerDamage: 1, playerRange: 1.3,
    playerArcDegrees: 100, playerCooldownMs: 450, playerInvulnerabilityMs: 500,
    slimeHP: 3, slimeDamage: 1, slimeRange: 0.85, slimeCooldownMs: 1200,
    flashMs: 180, swingMs: 160, recoveryProtectionMs: 1500,
    recoveryPosition: Object.freeze({ col: 16.5, row: 16.5 }) });
export interface Health { readonly hp: number; readonly maxHP: number }
export function createHealth(maxHP: number): Health {
    if (!Number.isSafeInteger(maxHP) || maxHP <= 0) throw new RangeError('Invalid maximum HP.');
    return { hp: maxHP, maxHP };
}
export function damageHealth(health: Health, amount: number): Health {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Invalid damage.');
    return { ...health, hp: Math.max(0, Math.min(health.maxHP, health.hp - amount)) };
}
export const FACING_VECTOR: Readonly<Record<Facing, GridPosition>> = Object.freeze({
    southEast: { col: 1, row: 0 }, southWest: { col: 0, row: 1 },
    northWest: { col: -1, row: 0 }, northEast: { col: 0, row: -1 },
});
export interface CombatActors {
    readonly player: GridPosition; readonly facing: Facing;
    readonly slime: GridPosition; readonly slimeMode: MonsterMode;
}
export type AttackResult = 'hit' | 'miss' | 'blocked';
export type CombatEvent = { type: 'attack'; activation: number; result: AttackResult; origin: GridPosition; facing: Facing }
    | { type: 'slime-hit' | 'slime-dead' | 'player-hit' | 'knockout' | 'recover' };
export interface CombatState {
    readonly player: Health; readonly slime: Health;
    readonly playerCooldownMs: number; readonly slimeCooldownMs: number;
    readonly invulnerabilityMs: number; readonly activation: number;
    readonly events: readonly CombatEvent[];
}
export function createCombat(): CombatState {
    return { player: createHealth(COMBAT_CONFIG.playerHP), slime: createHealth(COMBAT_CONFIG.slimeHP),
        playerCooldownMs: 0, slimeCooldownMs: 0, invulnerabilityMs: 0, activation: 0, events: [] };
}
export function playerAttackResult(a: CombatActors, colliders: readonly GridCollider[]): AttackResult {
    if (![a.player.col, a.player.row, a.slime.col, a.slime.row].every(Number.isFinite)) return 'miss';
    if (a.slimeMode === 'DEAD') return 'miss';
    const dc = a.slime.col - a.player.col, dr = a.slime.row - a.player.row;
    const length = Math.hypot(dc, dr), facing = FACING_VECTOR[a.facing];
    if (length > COMBAT_CONFIG.playerRange + 1e-10) return 'miss';
    if (length > 1e-10 && (dc * facing.col + dr * facing.row) / length
        < Math.cos(COMBAT_CONFIG.playerArcDegrees / 2 * Math.PI / 180) - 1e-10) return 'miss';
    return isSegmentBlocked(a.player, a.slime, colliders) ? 'blocked' : 'hit';
}
/** Immediate activation: one resolution per tick, no lingering damaging hitbox.
 * Player attack resolves first; a newly hit Slime cannot retaliate this frame. */
export function stepCombat(initial: CombatState, a: CombatActors, attack: boolean, deltaMs: number,
    colliders: readonly GridCollider[]): CombatState {
    const dt = movementDelta(deltaMs);
    if (dt === 0) return { ...initial, events: [] };
    let state: CombatState = { ...initial, events: [], playerCooldownMs: Math.max(0, initial.playerCooldownMs - dt),
        slimeCooldownMs: Math.max(0, initial.slimeCooldownMs - dt), invulnerabilityMs: Math.max(0, initial.invulnerabilityMs - dt) };
    const events: CombatEvent[] = [];
    let hit = false;
    if (attack && state.player.hp > 0 && state.playerCooldownMs === 0) {
        const result = state.slime.hp > 0 ? playerAttackResult(a, colliders) : 'miss';
        state = { ...state, activation: state.activation + 1, playerCooldownMs: COMBAT_CONFIG.playerCooldownMs };
        events.push({ type: 'attack', activation: state.activation, result, origin: { ...a.player }, facing: a.facing });
        if (result === 'hit') {
            hit = true;
            const slime = damageHealth(state.slime, COMBAT_CONFIG.playerDamage);
            state = { ...state, slime }; events.push({ type: slime.hp === 0 ? 'slime-dead' : 'slime-hit' });
        }
    }
    if (!hit && state.slime.hp > 0 && a.slimeMode === 'CHASE' && state.player.hp > 0
        && state.slimeCooldownMs === 0 && state.invulnerabilityMs === 0
        && Math.hypot(a.slime.col - a.player.col, a.slime.row - a.player.row) <= COMBAT_CONFIG.slimeRange
        && !isSegmentBlocked(a.slime, a.player, colliders)) {
        const player = damageHealth(state.player, COMBAT_CONFIG.slimeDamage);
        state = { ...state, player, slimeCooldownMs: COMBAT_CONFIG.slimeCooldownMs,
            invulnerabilityMs: COMBAT_CONFIG.playerInvulnerabilityMs };
        events.push({ type: 'player-hit' }); if (player.hp === 0) events.push({ type: 'knockout' });
    }
    return { ...state, events };
}
/** Explicit recovery only; no auto-respawn loop, no rewards or persistence. */
export function recoverCombat(state: CombatState): CombatState {
    if (state.player.hp > 0) return { ...state, events: [] };
    return { ...state, player: createHealth(COMBAT_CONFIG.playerHP), playerCooldownMs: 0,
        slimeCooldownMs: COMBAT_CONFIG.slimeCooldownMs, invulnerabilityMs: COMBAT_CONFIG.recoveryProtectionMs,
        events: [{ type: 'recover' }] };
}
