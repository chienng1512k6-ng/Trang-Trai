import { gridToWorld, DEFAULT_TILE_DIMENSIONS, PROTOTYPE_MAP_BOUNDS,
    type WorldPosition } from './isometric';

export interface WorldBounds { x: number; y: number; width: number; height: number }
export const CAMERA_CONFIG = Object.freeze({ minZoom: 0.5, maxZoom: 3, defaultZoom: 1.5, lerp: 0.12, zoomFactor: 1.2 });

/** AABB of all four outer diamond vertices, using the existing projection. */
export function mapWorldBounds(origin: WorldPosition): WorldBounds {
    const { columns, rows } = PROTOTYPE_MAP_BOUNDS;
    const vertices = [[0, 0], [columns, 0], [0, rows], [columns, rows]]
        .map(([col, row]) => gridToWorld({ col, row }, DEFAULT_TILE_DIMENSIONS, origin));
    const x = Math.min(...vertices.map(p => p.x));
    const y = Math.min(...vertices.map(p => p.y));
    return { x, y, width: Math.max(...vertices.map(p => p.x)) - x,
        height: Math.max(...vertices.map(p => p.y)) - y };
}

export function clampCameraZoom(value: number): number {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Zoom must be finite and positive.');
    return Math.min(CAMERA_CONFIG.maxZoom, Math.max(CAMERA_CONFIG.minZoom, value));
}

/** Phaser clamps oversized views to an edge. Expand bounds symmetrically so
 * its native clamp instead fixes that axis at the map center. */
export function viewportBounds(map: WorldBounds, width: number, height: number, zoom: number): WorldBounds {
    if (![width, height, zoom].every(n => Number.isFinite(n) && n > 0)) throw new RangeError('Invalid viewport.');
    const extraX = Math.max(0, width / zoom - map.width);
    const extraY = Math.max(0, height / zoom - map.height);
    return { x: map.x - extraX / 2, y: map.y - extraY / 2,
        width: map.width + extraX, height: map.height + extraY };
}
