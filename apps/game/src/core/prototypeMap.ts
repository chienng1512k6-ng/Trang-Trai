import { DEFAULT_TILE_DIMENSIONS, PROTOTYPE_MAP_BOUNDS, isGridCellWithinBounds } from './isometric';
import type { GridCollider } from './collision';

export const MAP_ASSETS = Object.freeze({
    mapKey: 'prototype-map', mapUrl: 'assets/prototype/farm.tmj',
    textureKey: 'prototype-terrain', textureUrl: 'assets/prototype/terrain.png',
    tilesetName: 'prototype-terrain',
});
export const MAP_ORIGIN = Object.freeze({
    x: PROTOTYPE_MAP_BOUNDS.rows * DEFAULT_TILE_DIMENSIONS.width / 2, y: 0,
});
export interface Obstacle {
    readonly id: number;
    readonly col: number;
    readonly row: number;
    readonly kind: 'tree' | 'rock';
    readonly collisionWidth: number;
    readonly collisionDepth: number;
}

export function obstacleColliders(obstacles: readonly Obstacle[]): GridCollider[] {
    return obstacles.map(o => ({ id: o.id,
        minCol: o.col + 0.5 - o.collisionWidth / 2, maxCol: o.col + 0.5 + o.collisionWidth / 2,
        minRow: o.row + 0.5 - o.collisionDepth / 2, maxRow: o.row + 0.5 + o.collisionDepth / 2 }));
}

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) throw new Error('Expected map object.');
    return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw new Error('Expected map array.');
    return value;
}

/** Validate this prototype's asset contract, not a general-purpose Tiled importer. */
export function validatePrototypeMap(value: unknown): Obstacle[] {
    const map = record(value);
    const { columns, rows } = PROTOTYPE_MAP_BOUNDS;
    const { width, height } = DEFAULT_TILE_DIMENSIONS;
    if (map.type !== 'map' || map.orientation !== 'isometric' || map.infinite !== false
        || map.width !== columns || map.height !== rows || map.tilewidth !== width || map.tileheight !== height) {
        throw new Error('Expected finite 32x32 isometric map with 64x32 tiles.');
    }
    const tilesets = array(map.tilesets).map(record);
    const tileset = tilesets[0];
    if (tilesets.length !== 1 || tileset.name !== MAP_ASSETS.tilesetName || tileset.firstgid !== 1
        || tileset.image !== 'terrain.png' || tileset.tilewidth !== width || tileset.tileheight !== height
        || tileset.columns !== 4 || tileset.tilecount !== 4 || tileset.imagewidth !== width * 4
        || tileset.imageheight !== height || tileset.margin !== 0 || tileset.spacing !== 0) {
        throw new Error('Unexpected prototype tileset metadata.');
    }
    const layers = array(map.layers).map(record);
    for (const name of ['Ground', 'Detail']) {
        const matches = layers.filter(layer => layer.name === name);
        const layer = matches[0];
        if (matches.length !== 1 || layer.type !== 'tilelayer' || layer.width !== columns
            || layer.height !== rows || layer.x !== 0 || layer.y !== 0) throw new Error(`Invalid layer ${name}.`);
        const data = array(layer.data);
        if (data.length !== columns * rows || !data.every(gid => typeof gid === 'number'
            && Number.isInteger(gid) && gid >= (name === 'Ground' ? 1 : 0) && gid <= 4)) {
            throw new Error(`Invalid tile data in ${name}.`);
        }
    }
    const objectLayers = layers.filter(layer => layer.name === 'Obstacles');
    if (objectLayers.length !== 1 || objectLayers[0].type !== 'objectgroup') throw new Error('Missing Obstacles object layer.');
    const occupied = new Set<string>();
    const ids = new Set<number>();
    return array(objectLayers[0].objects).map(value => {
        const object = record(value);
        const properties = array(object.properties).map(record);
        const col = properties.find(property => property.name === 'col' && property.type === 'int')?.value;
        const row = properties.find(property => property.name === 'row' && property.type === 'int')?.value;
        const kind = object.type;
        const collisionWidth = properties.find(p => p.name === 'collisionWidth' && p.type === 'float')?.value;
        const collisionDepth = properties.find(p => p.name === 'collisionDepth' && p.type === 'float')?.value;
        const shape = properties.find(p => p.name === 'collisionShape' && p.type === 'string')?.value;
        if (shape !== 'grid-aabb' || typeof collisionWidth !== 'number' || typeof collisionDepth !== 'number'
            || !Number.isFinite(collisionWidth) || !Number.isFinite(collisionDepth)
            || collisionWidth <= 0 || collisionDepth <= 0 || collisionWidth > 1 || collisionDepth > 1
            || typeof object.id !== 'number' || !Number.isSafeInteger(object.id) || object.id <= 0 || ids.has(object.id)
            || new Set(properties.map(p => p.name)).size !== properties.length) {
            throw new Error('Invalid or duplicate obstacle collision metadata/id.');
        }
        ids.add(object.id);
        if (typeof col !== 'number' || typeof row !== 'number' || !isGridCellWithinBounds({ col, row })
            || (kind !== 'tree' && kind !== 'rock') || object.point !== true
            || object.x !== (col + 0.5) * height || object.y !== (row + 0.5) * height) {
            throw new Error('Invalid obstacle grid position, kind or Tiled object coordinates.');
        }
        const key = `${col},${row}`;
        if (occupied.has(key)) throw new Error('Duplicate obstacle cell.');
        occupied.add(key);
        return { id: object.id, col, row, kind, collisionWidth, collisionDepth };
    });
}
