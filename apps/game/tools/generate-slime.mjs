// Original project-owned pixel art, MIT. No downloaded assets.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const width = 256, height = 32;
const pixels = Buffer.alloc((width * 4 + 1) * height);
for (let frame = 0; frame < 8; frame++) {
    const dead = frame === 7, hit = frame === 6;
    const squash = dead ? 6 : [0, 1, 2, -1, -3, -1, 1, 0][frame];
    const rx = 12 + squash / 2, ry = dead ? 3 : 9 - squash / 2;
    const cy = 27 - ry;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const d = ((x - 16) / rx) ** 2 + ((y - cy) / ry) ** 2;
        let color;
        if (d <= 1) color = d > 0.78 ? [25, 78, 42] : hit ? [207, 239, 155]
            : dead ? [57, 107, 53] : y < cy ? [117, 206, 80] : [61, 157, 63];
        if (!dead && y >= cy - 1 && y <= cy + 2 && (x === 12 || x === 20)) color = [20, 43, 38];
        if (!dead && x >= 10 && x <= 13 && y >= cy - 5 && y <= cy - 4) color = [193, 238, 137];
        if (color) pixels.set([...color, 255], y * (width * 4 + 1) + 1 + (frame * 32 + x) * 4);
    }
}
function chunk(name, data) {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); body.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
const output = new URL('../public/assets/monsters/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('green-slime.png', output), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
]));
console.log('Generated original Green Slime: 8 frames 32x32, footpoint (16,28).');
