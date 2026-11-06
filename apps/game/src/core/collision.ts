import type { GridPosition } from './isometric';

/** Ground-plane rectangles, independent of image dimensions and camera. */
export interface GridCollider {
    readonly id: number;
    readonly minCol: number;
    readonly maxCol: number;
    readonly minRow: number;
    readonly maxRow: number;
}
export const PLAYER_HALF_EXTENT = 0.18;
const EPSILON = 1e-10;

function expanded(collider: GridCollider) {
    return { minCol: collider.minCol - PLAYER_HALF_EXTENT, maxCol: collider.maxCol + PLAYER_HALF_EXTENT,
        minRow: collider.minRow - PLAYER_HALF_EXTENT, maxRow: collider.maxRow + PLAYER_HALF_EXTENT };
}

export function isPositionBlocked(position: GridPosition, colliders: readonly GridCollider[]): boolean {
    return colliders.some(collider => {
        const b = expanded(collider);
        return position.col > b.minCol + EPSILON && position.col < b.maxCol - EPSILON
            && position.row > b.minRow + EPSILON && position.row < b.maxRow - EPSILON;
    });
}

export function assertClearSpawn(position: GridPosition, colliders: readonly GridCollider[]) {
    if (isPositionBlocked(position, colliders)) throw new Error('Player spawn overlaps an obstacle footprint.');
}

/** Sweep each axis to its nearest contact, then slide on the other axis.
 * Each segment is checked over its full length, including arbitrarily thin
 * colliders. Col then row is a deterministic (slightly axis-biased) policy.
 * Tangential contact is allowed; there are no iterative pushes or retries. */
export function resolveMovement(from: GridPosition, desired: GridPosition, colliders: readonly GridCollider[]): GridPosition {
    assertClearSpawn(from, colliders);
    let col = desired.col;
    for (const collider of colliders) {
        const b = expanded(collider);
        if (from.row <= b.minRow + EPSILON || from.row >= b.maxRow - EPSILON) continue;
        if (col > from.col && from.col <= b.minCol + EPSILON) col = Math.min(col, b.minCol);
        else if (col < from.col && from.col >= b.maxCol - EPSILON) col = Math.max(col, b.maxCol);
    }
    let row = desired.row;
    for (const collider of colliders) {
        const b = expanded(collider);
        if (col <= b.minCol + EPSILON || col >= b.maxCol - EPSILON) continue;
        if (row > from.row && from.row <= b.minRow + EPSILON) row = Math.min(row, b.minRow);
        else if (row < from.row && from.row >= b.maxRow - EPSILON) row = Math.max(row, b.maxRow);
    }
    return { col, row };
}
