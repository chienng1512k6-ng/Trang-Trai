import { createPlayer, movePlayer, movementDelta, PLAYER_SPEED, type PlayerState } from './player';
import type { GridCollider } from './collision';
import type { GridPosition } from './isometric';
import { findMonsterPath, groundDistance, validMonsterPosition } from './monsterPath';

export interface MonsterConfig {
    readonly wanderSpeed: number; readonly chaseSpeed: number; readonly returnSpeed: number;
    readonly detectionRange: number; readonly disengageRange: number; readonly leashDistance: number;
    readonly wanderRadius: number; readonly idleMinMs: number; readonly idleMaxMs: number;
    readonly replanMs: number; readonly blockedTimeoutMs: number; readonly hitMs: number;
    readonly arrivalDistance: number; readonly spawn: GridPosition; readonly seed: number;
    readonly targetReplanDistance: number; readonly wanderAttempts: number;
}
export const MONSTER_CONFIG: MonsterConfig = Object.freeze({ wanderSpeed: 0.8, chaseSpeed: 1.8, returnSpeed: 1.2,
    detectionRange: 4, disengageRange: 6, leashDistance: 8, wanderRadius: 3,
    idleMinMs: 1000, idleMaxMs: 3000, replanMs: 500, blockedTimeoutMs: 2000, hitMs: 300,
    arrivalDistance: 0.025, targetReplanDistance: 0.5, wanderAttempts: 8,
    spawn: Object.freeze({ col: 22.5, row: 16.5 }), seed: 104729 });
export type MonsterMode = 'IDLE' | 'WANDER' | 'CHASE' | 'RETURN' | 'HIT' | 'DEAD';
export interface MonsterState {
    readonly body: PlayerState;
    readonly spawn: GridPosition;
    readonly mode: MonsterMode;
    readonly elapsedMs: number;
    readonly waitMs: number;
    readonly seed: number;
    readonly goal?: GridPosition;
    readonly path: readonly GridPosition[];
    readonly replanMs: number;
    readonly blockedMs: number;
}
/** Seed is part of state: repeatable and independent of global Math.random. */
function random(seed: number) {
    const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return { seed: next, value: next / 2 ** 32 };
}
function idle(state: MonsterState, config: MonsterConfig): MonsterState {
    const roll = random(state.seed);
    return { ...state, mode: 'IDLE', elapsedMs: 0, seed: roll.seed,
        waitMs: config.idleMinMs + roll.value * (config.idleMaxMs - config.idleMinMs),
        path: [], goal: undefined, blockedMs: 0, replanMs: 0, body: { ...state.body, motion: 'idle' } };
}
function transition(state: MonsterState, mode: MonsterMode, goal?: GridPosition): MonsterState {
    return { ...state, mode, elapsedMs: 0, goal, path: [], replanMs: 0, blockedMs: 0,
        body: { ...state.body, motion: 'idle' } };
}
export function validateMonsterConfig(c: MonsterConfig) {
    const numbers = [c.wanderSpeed, c.chaseSpeed, c.returnSpeed, c.detectionRange, c.disengageRange,
        c.leashDistance, c.wanderRadius, c.idleMinMs, c.idleMaxMs, c.replanMs, c.blockedTimeoutMs, c.hitMs, c.arrivalDistance,
        c.targetReplanDistance, c.wanderAttempts];
    if (!numbers.every(n => Number.isFinite(n) && n > 0) || c.disengageRange <= c.detectionRange
        || c.idleMaxMs < c.idleMinMs || c.wanderRadius > c.leashDistance
        || Math.max(c.wanderSpeed, c.chaseSpeed, c.returnSpeed) > PLAYER_SPEED
        || !Number.isInteger(c.wanderAttempts) || c.wanderAttempts > 32
        || !Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff) throw new RangeError('Invalid monster configuration.');
}
export function createMonster(colliders: readonly GridCollider[], config: MonsterConfig = MONSTER_CONFIG): MonsterState {
    validateMonsterConfig(config);
    const body = createPlayer(config.spawn, colliders);
    return idle({ body, spawn: { ...config.spawn }, mode: 'IDLE', elapsedMs: 0, waitMs: 0,
        seed: config.seed, path: [], replanMs: 0, blockedMs: 0 }, config);
}
/** Internal preparation hooks only: no damage, HP, attack or loot. */
export function monsterEvent(state: MonsterState, event: 'HIT' | 'DEAD'): MonsterState {
    return state.mode === 'DEAD' ? state : transition(state, event);
}
export function updateMonster(initial: MonsterState, target: GridPosition | undefined, deltaMs: number,
    colliders: readonly GridCollider[], config: MonsterConfig = MONSTER_CONFIG): MonsterState {
    const dt = movementDelta(deltaMs);
    if (initial.mode === 'DEAD' || dt === 0) return initial;
    let state = { ...initial, elapsedMs: initial.elapsedMs + dt };
    if (state.mode === 'HIT') return state.elapsedMs >= config.hitMs ? transition(state, 'RETURN', state.spawn) : state;
    const targetValid = target !== undefined && Number.isFinite(target.col) && Number.isFinite(target.row);
    const distance = targetValid ? groundDistance(state.body.position, target) : Infinity;
    const insideLeash = targetValid && groundDistance(target, state.spawn) <= config.leashDistance;
    if (state.mode === 'CHASE' && (distance > config.disengageRange || !insideLeash)) state = transition(state, 'RETURN', state.spawn);
    else if ((state.mode === 'IDLE' || state.mode === 'WANDER') && distance <= config.detectionRange && insideLeash) {
        state = transition(state, 'CHASE', target);
    }
    if (state.mode === 'IDLE') {
        if (state.elapsedMs < state.waitMs) return state;
        if (groundDistance(state.body.position, state.spawn) > config.arrivalDistance) return transition(state, 'RETURN', state.spawn);
        // Fixed attempt budget even if every sampled destination is obstructed.
        for (let attempt = 0; attempt < config.wanderAttempts; attempt++) {
            const angle = random(state.seed), radius = random(angle.seed);
            state = { ...state, seed: radius.seed };
            const r = Math.sqrt(radius.value) * config.wanderRadius;
            const goal = { col: state.spawn.col + Math.cos(angle.value * Math.PI * 2) * r,
                row: state.spawn.row + Math.sin(angle.value * Math.PI * 2) * r };
            if (validMonsterPosition(goal, colliders)) return transition(state, 'WANDER', goal);
        }
        return idle(state, config);
    }
    const goal = state.mode === 'CHASE' ? target : state.goal;
    if (!goal) return idle(state, config);
    if (groundDistance(state.body.position, goal) <= config.arrivalDistance) {
        if (state.mode === 'CHASE') return { ...state, body: { ...state.body, motion: 'idle' } };
        return idle(state, config);
    }
    let path = [...state.path];
    let replanMs = state.replanMs - dt;
    if (path.length === 0 || (state.mode === 'CHASE' && groundDistance(path[path.length - 1], goal) > config.targetReplanDistance)) {
        // Failed searches also respect the cooldown; no BFS every render frame.
        if (replanMs <= 0) {
            path = findMonsterPath(state.body.position, goal, state.spawn, config.leashDistance, colliders);
            replanMs = config.replanMs;
        }
    }
    while (path.length && groundDistance(state.body.position, path[0]) <= config.arrivalDistance) path.shift();
    const next = path[0];
    let body = { ...state.body, motion: 'idle' as PlayerState['motion'] };
    if (next) {
        const length = groundDistance(body.position, next);
        const speed = state.mode === 'CHASE' ? config.chaseSpeed : state.mode === 'RETURN' ? config.returnSpeed : config.wanderSpeed;
        const strength = Math.min(speed / PLAYER_SPEED, length / (PLAYER_SPEED * dt / 1000));
        body = movePlayer(body, { col: (next.col - body.position.col) / length * strength,
            row: (next.row - body.position.row) / length * strength }, dt, colliders);
        if (groundDistance(body.position, state.spawn) > config.leashDistance + 1e-9) return transition(state, 'RETURN', state.spawn);
    }
    const blockedMs = groundDistance(body.position, state.body.position) < 1e-9 ? state.blockedMs + dt : 0;
    state = { ...state, body, path, goal, replanMs, blockedMs };
    if (blockedMs >= config.blockedTimeoutMs) {
        return state.mode === 'CHASE' ? transition(state, 'RETURN', state.spawn) : idle(state, config);
    }
    return state;
}
