import { PROTOTYPE_MAP_BOUNDS, gridToWorld, type GridPosition, type WorldPosition } from './isometric';

export type Facing = 'southEast' | 'southWest' | 'northWest' | 'northEast';
export type Motion = 'idle' | 'walk';
/** Device-independent vector along orthonormal ground col/row axes, not screen pixels. */
export interface MovementInput { readonly col: number; readonly row: number }
export interface PlayerState {
    readonly position: GridPosition;
    readonly facing: Facing;
    readonly motion: Motion;
    /** Kahan summation correction; never used as a second gameplay position. */
    readonly integrationError: GridPosition;
}
export const PLAYER_SPEED = 3; // square ground cells / second
export const MAX_MOVEMENT_DELTA_MS = 50;
export const MAP_EDGE_INSET = 0.25;

export function createPlayer(position: GridPosition = { col: 16.5, row: 16.5 }): PlayerState {
    if (!Number.isFinite(position.col) || !Number.isFinite(position.row)
        || position.col < MAP_EDGE_INSET || position.row < MAP_EDGE_INSET
        || position.col > PROTOTYPE_MAP_BOUNDS.columns - MAP_EDGE_INSET
        || position.row > PROTOTYPE_MAP_BOUNDS.rows - MAP_EDGE_INSET) {
        throw new RangeError('Player spawn must be inside the map edge inset.');
    }
    return { position: { ...position }, facing: 'southEast', motion: 'idle', integrationError: { col: 0, row: 0 } };
}

export function movementDelta(deltaMs: number): number {
    return Number.isFinite(deltaMs) && deltaMs > 0 ? Math.min(deltaMs, MAX_MOVEMENT_DELTA_MS) : 0;
}

function integrate(position: number, error: number, distance: number, maximum: number) {
    if (distance === 0) return { position, error };
    const corrected = distance - error;
    const next = position + corrected;
    const clamped = Math.max(MAP_EDGE_INSET, Math.min(maximum - MAP_EDGE_INSET, next));
    return { position: clamped, error: clamped === next ? (next - position) - corrected : 0 };
}

/** Pure update: no Phaser/input devices, no world/screen-space movement or obstacle collision. */
export function movePlayer(state: PlayerState, input: MovementInput, deltaMs: number): PlayerState {
    const delta = movementDelta(deltaMs);
    const valid = Number.isFinite(input.col) && Number.isFinite(input.row);
    const length = valid ? Math.hypot(input.col, input.row) : 0;
    if (delta === 0 || length === 0 || !Number.isFinite(length)) return { ...state, motion: 'idle' };
    const scale = PLAYER_SPEED * delta / 1000 / Math.max(1, length);
    const col = integrate(state.position.col, state.integrationError.col, input.col * scale, PROTOTYPE_MAP_BOUNDS.columns);
    const row = integrate(state.position.row, state.integrationError.row, input.row * scale, PROTOTYPE_MAP_BOUNDS.rows);
    const dc = col.position - state.position.col;
    const dr = row.position - state.position.row;
    const walking = dc !== 0 || dr !== 0;
    const facing = !walking ? state.facing : Math.abs(dc === 0 ? 0 : input.col) >= Math.abs(dr === 0 ? 0 : input.row)
        ? (dc >= 0 ? 'southEast' : 'northWest') : (dr >= 0 ? 'southWest' : 'northEast');
    return { position: { col: col.position, row: row.position }, facing, motion: walking ? 'walk' : 'idle',
        integrationError: { col: col.error, row: row.error } };
}

/** Position already denotes the footpoint, including any half-cell spawn offset. */
export function playerWorldPosition(state: PlayerState, origin: WorldPosition): WorldPosition {
    return gridToWorld(state.position, undefined, origin);
}
