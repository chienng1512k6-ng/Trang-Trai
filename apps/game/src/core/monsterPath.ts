import { isPositionBlocked, resolveMovement, type GridCollider } from './collision';
import { PROTOTYPE_MAP_BOUNDS, type GridPosition } from './isometric';
import { MAP_EDGE_INSET } from './player';

export const groundDistance = (a: GridPosition, b: GridPosition) => Math.hypot(a.col - b.col, a.row - b.row);
export function validMonsterPosition(p: GridPosition, colliders: readonly GridCollider[]): boolean {
    return Number.isFinite(p.col) && Number.isFinite(p.row)
        && p.col >= MAP_EDGE_INSET && p.row >= MAP_EDGE_INSET
        && p.col <= PROTOTYPE_MAP_BOUNDS.columns - MAP_EDGE_INSET
        && p.row <= PROTOTYPE_MAP_BOUNDS.rows - MAP_EDGE_INSET && !isPositionBlocked(p, colliders);
}

/** Visibility predicate delegates every short segment to the existing resolver.
 * No second intersection/collision implementation. */
export function canTraverse(from: GridPosition, to: GridPosition, colliders: readonly GridCollider[]): boolean {
    if (!validMonsterPosition(from, colliders) || !validMonsterPosition(to, colliders)) return false;
    const count = Math.max(1, Math.ceil(groundDistance(from, to) / 0.1));
    let current = from;
    for (let n = 1; n <= count; n++) {
        const next = { col: from.col + (to.col - from.col) * n / count, row: from.row + (to.row - from.row) * n / count };
        if (groundDistance(resolveMovement(current, next, colliders), next) > 1e-9) return false;
        current = next;
    }
    return true;
}

/** Bounded four-neighbor BFS (at most 1024 nodes), with virtual start/goal
 * connections for fractional positions. Stable neighbor order prevents jitter. */
export function findMonsterPath(from: GridPosition, to: GridPosition, spawn: GridPosition,
    leash: number, colliders: readonly GridCollider[]): GridPosition[] {
    const allowed = (p: GridPosition) => groundDistance(p, spawn) <= leash + 1e-9 && validMonsterPosition(p, colliders);
    if (!allowed(from) || !allowed(to)) return [];
    if (canTraverse(from, to, colliders)) return [to];
    const queue: { position: GridPosition; parent: number }[] = [];
    const visited = new Set<string>();
    const add = (p: GridPosition, parent: number) => {
        const key = `${p.col},${p.row}`;
        if (visited.has(key) || !allowed(p)) return;
        visited.add(key); queue.push({ position: p, parent });
    };
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const p = { col: Math.floor(from.col) + dc + 0.5, row: Math.floor(from.row) + dr + 0.5 };
        if (allowed(p) && canTraverse(from, p, colliders)) add(p, -1);
    }
    const budget = PROTOTYPE_MAP_BOUNDS.columns * PROTOTYPE_MAP_BOUNDS.rows;
    for (let index = 0; index < queue.length && index < budget; index++) {
        const p = queue[index].position;
        if (groundDistance(p, to) <= 1.5 && canTraverse(p, to, colliders)) {
            const path = [to];
            for (let i = index; i !== -1; i = queue[i].parent) path.unshift(queue[i].position);
            return path;
        }
        for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            const next = { col: p.col + dc, row: p.row + dr };
            if (allowed(next) && groundDistance(resolveMovement(p, next, colliders), next) < 1e-9) add(next, index);
        }
    }
    return [];
}
