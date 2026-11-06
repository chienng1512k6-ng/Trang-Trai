import type { Input } from 'phaser';
import {
    DEFAULT_TILE_DIMENSIONS, worldToGridCell,
    type GridPosition, type TileDimensions, type WorldPosition,
} from '../core/isometric';

/** Use Phaser canvas-space pointer coordinates, not DOM clientX/clientY.
 * Camera matrices must be current (Phaser updates them during preRender).
 * Normal world layer only: scroll factors 1, scale 1; map origin is its top vertex.
 */
export function pointerToGridCell(
    pointer: Pick<Input.Pointer, 'x' | 'y'>,
    camera: { getWorldPoint(x: number, y: number): WorldPosition },
    tile: TileDimensions = DEFAULT_TILE_DIMENSIONS,
    origin: WorldPosition = { x: 0, y: 0 },
): GridPosition {
    return worldToGridCell(camera.getWorldPoint(pointer.x, pointer.y), tile, origin);
}
