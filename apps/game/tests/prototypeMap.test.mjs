import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MAP_ASSETS, MAP_ORIGIN, validatePrototypeMap } from '../src/core/prototypeMap.ts';
import { DEFAULT_TILE_DIMENSIONS as tile, gridToWorld, gridToWorldCenter, worldToGridCell } from '../src/core/isometric.ts';

const asset = (name) => new URL(`../public/assets/prototype/${name}`, import.meta.url);
const fixture = () => JSON.parse(readFileSync(asset('farm.tmj'), 'utf8'));

describe('prototype Tiled map assets', () => {
    it('has finite 32x32 isometric metadata and 64x32 tiles', () => {
        expect(fixture()).toMatchObject({ width: 32, height: 32, orientation: 'isometric',
            tilewidth: 64, tileheight: 32, infinite: false });
        expect(validatePrototypeMap(fixture())).toHaveLength(9);
    });

    it('contains grass/dirt ground, path/decorations detail and obstacle layers', () => {
        const layers = fixture().layers;
        expect(layers.map(layer => [layer.name, layer.type])).toEqual([
            ['Ground', 'tilelayer'], ['Detail', 'tilelayer'], ['Obstacles', 'objectgroup'],
        ]);
        expect(new Set(layers[0].data)).toEqual(new Set([1, 2]));
        expect(new Set(layers[1].data)).toEqual(new Set([0, 3, 4]));
        expect(layers[0].data).toHaveLength(1024);
        expect(layers[1].data).toHaveLength(1024);
    });

    it('links the declared tileset to a decodable 256x32 RGBA PNG', () => {
        expect(fixture().tilesets).toEqual([expect.objectContaining({ firstgid: 1,
            name: MAP_ASSETS.tilesetName, image: 'terrain.png', tilecount: 4, columns: 4 })]);
        const png = readFileSync(asset('terrain.png'));
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(png.readUInt32BE(16)).toBe(256);
        expect(png.readUInt32BE(20)).toBe(32);
        expect(png[25]).toBe(6);
        const chunks = [];
        for (let offset = 8; offset < png.length;) {
            const size = png.readUInt32BE(offset);
            if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + size));
            offset += size + 12;
        }
        const decoded = inflateSync(Buffer.concat(chunks));
        expect(decoded.length).toBe((256 * 4 + 1) * 32);
        expect(decoded.some(channel => channel !== 0)).toBe(true);
    });

    it('has unique integer obstacle cells and consistent kinds/Tiled positions', () => {
        const obstacles = validatePrototypeMap(fixture());
        expect(new Set(obstacles.map(cell => `${cell.col},${cell.row}`)).size).toBe(obstacles.length);
        expect(new Set(obstacles.map(cell => cell.kind))).toEqual(new Set(['tree', 'rock']));
        for (const cell of obstacles) {
            expect(worldToGridCell(gridToWorldCenter(cell, tile, MAP_ORIGIN), tile, MAP_ORIGIN))
                .toEqual({ col: cell.col, row: cell.row });
        }
    });

    it.each([[0, 0, 1024, 0], [5, 5, 1024, 160], [0, 31, 32, 496],
        [31, 0, 2016, 496], [31, 31, 1024, 992]])('projects checkpoint (%s,%s)', (col, row, x, y) => {
        expect(gridToWorld({ col, row }, tile, MAP_ORIGIN)).toEqual({ x, y });
    });

    it.each([['width', 31], ['height', 31], ['orientation', 'orthogonal'],
        ['tilewidth', 32], ['tileheight', 64], ['infinite', true]])('rejects invalid %s', (key, value) => {
        expect(() => validatePrototypeMap({ ...fixture(), [key]: value })).toThrow();
    });

    it('rejects missing required layers and invalid tile IDs', () => {
        const map = fixture();
        const layers = map.layers;
        expect(() => validatePrototypeMap({ ...map, layers: layers.slice(1) })).toThrow();
        expect(() => validatePrototypeMap({ ...map, layers: [{ ...layers[0], data: [999] }, ...layers.slice(1)] })).toThrow();
    });

    it('rejects a tileset path that would not match the texture loaded by Phaser', () => {
        const map = fixture();
        expect(() => validatePrototypeMap({ ...map, tilesets: [{ ...map.tilesets[0], image: 'missing.png' }] })).toThrow();
    });

    it('rejects inconsistent obstacle properties instead of silently placing it', () => {
        const map = fixture();
        const layers = map.layers;
        const objects = layers[2].objects ?? [];
        expect(() => validatePrototypeMap({ ...map, layers: [layers[0], layers[1], {
            ...layers[2], objects: [{ ...objects[0], properties: [] }],
        }] })).toThrow();
    });
});

