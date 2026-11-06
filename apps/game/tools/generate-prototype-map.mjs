// Original Farm Development placeholder art/data. MIT; see public/assets/ATTRIBUTION.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { DEFAULT_TILE_DIMENSIONS as tile, PROTOTYPE_MAP_BOUNDS as bounds } from '../src/core/isometric.ts';

const output = new URL('../public/assets/prototype/', import.meta.url);
mkdirSync(output, { recursive: true });
const width = tile.width * 4;
const height = tile.height;
const pixels = Buffer.alloc((width * 4 + 1) * height);
const palettes = [[76, 122, 64], [139, 103, 65], [187, 154, 99], [76, 122, 64]];
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const localX = x % tile.width;
        const index = Math.floor(x / tile.width);
        const diamond = Math.abs((localX + 0.5 - tile.width / 2) / (tile.width / 2))
            + Math.abs((y + 0.5 - tile.height / 2) / (tile.height / 2));
        if (diamond > 1) continue;
        const grain = ((localX * 13 + y * 31) % 17 === 0) ? 12 : 0;
        const shade = diamond > 0.94 ? -14 : grain;
        let color = palettes[index].map(channel => channel + shade);
        if (index === 3 && ((localX - 22) ** 2 + (y - 14) ** 2 < 5
            || (localX - 39) ** 2 + (y - 18) ** 2 < 5)) color = [238, 206, 104];
        const offset = y * (width * 4 + 1) + 1 + x * 4;
        pixels.set([...color, 255], offset);
    }
}
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
    const type = Buffer.from(name);
    const result = Buffer.alloc(12 + data.length);
    result.writeUInt32BE(data.length);
    type.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length);
    return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6; // RGBA, lossless PNG, filter 0 per row.
writeFileSync(new URL('terrain.png', output), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
]));

const ground = [];
const detail = [];
for (let row = 0; row < bounds.rows; row++) {
    for (let col = 0; col < bounds.columns; col++) {
        ground.push(col >= 8 && col <= 13 && row >= 7 && row <= 12 ? 2 : 1);
        detail.push(col === 16 || col === 17 || row === 16 || row === 17 ? 3
            : ((col * 7 + row * 11) % 53 === 0 ? 4 : 0));
    }
}
const locations = [
    [4, 7, 'tree'], [7, 24, 'tree'], [12, 5, 'tree'], [24, 10, 'tree'],
    [26, 23, 'tree'], [22, 26, 'tree'], [9, 21, 'rock'], [23, 7, 'rock'], [28, 19, 'rock'],
];
const layer = (id, name, data) => ({ id, name, type: 'tilelayer', width: bounds.columns,
    height: bounds.rows, x: 0, y: 0, opacity: 1, visible: true, data });
const map = {
    type: 'map', version: '1.10', orientation: 'isometric', renderorder: 'right-down',
    infinite: false, width: bounds.columns, height: bounds.rows,
    tilewidth: tile.width, tileheight: tile.height, nextlayerid: 4, nextobjectid: locations.length + 1,
    layers: [layer(1, 'Ground', ground), layer(2, 'Detail', detail), {
        id: 3, name: 'Obstacles', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0,
        opacity: 1, visible: true,
        objects: locations.map(([col, row, kind], index) => ({
            id: index + 1, name: `${kind}-${index + 1}`, type: kind, point: true,
            // Tiled isometric object space: square sides = tileheight, at cell center.
            x: (col + 0.5) * tile.height, y: (row + 0.5) * tile.height,
            width: 0, height: 0, rotation: 0, visible: true,
            properties: [{ name: 'col', type: 'int', value: col }, { name: 'row', type: 'int', value: row }],
        })),
    }],
    tilesets: [{ firstgid: 1, name: 'prototype-terrain', image: 'terrain.png',
        imagewidth: width, imageheight: height, tilewidth: tile.width, tileheight: tile.height,
        tilecount: 4, columns: 4, margin: 0, spacing: 0 }],
};
writeFileSync(new URL('farm.tmj', output), JSON.stringify(map, null, 2) + '\n');
console.log('Generated farm.tmj and terrain.png (original project assets).');
