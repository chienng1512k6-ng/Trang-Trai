export interface GridPosition { readonly col: number; readonly row: number }
export interface WorldPosition { readonly x: number; readonly y: number }
export interface TileDimensions { readonly width: number; readonly height: number }
export interface GridBounds { readonly columns: number; readonly rows: number }

export const DEFAULT_TILE_DIMENSIONS: TileDimensions = Object.freeze({ width: 64, height: 32 });
export const PROTOTYPE_MAP_BOUNDS: GridBounds = Object.freeze({ columns: 32, rows: 32 });
const ZERO: WorldPosition = Object.freeze({ x: 0, y: 0 });

function validateDimensions(tile: TileDimensions): void {
    if (!Number.isFinite(tile.width) || !Number.isFinite(tile.height)
        || tile.width <= 0 || tile.height <= 0 || tile.width !== 2 * tile.height) {
        throw new RangeError('Tile dimensions must be finite, positive and diamond 2:1.');
    }
}

/** Continuous grid projection. Integer grid positions refer to diamond TOP vertices. */
export function gridToWorld(
    grid: GridPosition, tile = DEFAULT_TILE_DIMENSIONS, origin = ZERO,
): WorldPosition {
    validateDimensions(tile);
    return {
        x: origin.x + (grid.col - grid.row) * tile.width / 2,
        y: origin.y + (grid.col + grid.row) * tile.height / 2,
    };
}

/** Continuous inverse; never rounds or clamps to map bounds. */
export function worldToGrid(
    world: WorldPosition, tile = DEFAULT_TILE_DIMENSIONS, origin = ZERO,
): GridPosition {
    validateDimensions(tile);
    const x = (world.x - origin.x) / tile.width;
    const y = (world.y - origin.y) / tile.height;
    return { col: y + x, row: y - x };
}

export function gridToWorldCenter(
    grid: GridPosition, tile = DEFAULT_TILE_DIMENSIONS, origin = ZERO,
): WorldPosition {
    return gridToWorld({ col: grid.col + 0.5, row: grid.row + 0.5 }, tile, origin);
}

/** Half-open cells [col,col+1) × [row,row+1); floor also handles negative coordinates. */
export function worldToGridCell(
    world: WorldPosition, tile = DEFAULT_TILE_DIMENSIONS, origin = ZERO,
): GridPosition {
    const grid = worldToGrid(world, tile, origin);
    return { col: Math.floor(grid.col), row: Math.floor(grid.row) };
}

/** Bounds checks do not clamp; fractional positions are not cell indices. */
export function isGridCellWithinBounds(cell: GridPosition, bounds = PROTOTYPE_MAP_BOUNDS): boolean {
    if (!Number.isInteger(bounds.columns) || !Number.isInteger(bounds.rows)
        || bounds.columns < 0 || bounds.rows < 0) {
        throw new RangeError('Grid bounds must be nonnegative integer dimensions.');
    }
    return Number.isInteger(cell.col) && Number.isInteger(cell.row)
        && cell.col >= 0 && cell.row >= 0 && cell.col < bounds.columns && cell.row < bounds.rows;
}
