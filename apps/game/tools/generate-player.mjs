// Original Farm Development pixel art. MIT; see public/assets/ATTRIBUTION.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const frameWidth = 32, frameHeight = 48, columns = 6, rows = 4;
const width = frameWidth * columns, height = frameHeight * rows;
const pixels = Buffer.alloc((width * 4 + 1) * height);
const palette = { outline: [34, 40, 43], skin: [226, 163, 104], hair: [92, 56, 39],
    hat: [232, 194, 105], brim: [184, 134, 65], shirt: [65, 137, 163],
    light: [103, 178, 187], pants: [45, 69, 98], boot: [66, 45, 36] };
for (let row = 0; row < rows; row++) {
    for (let frame = 0; frame < columns; frame++) {
        const walk = frame >= 2;
        const phase = walk ? frame - 2 : 0;
        const bob = walk ? phase % 2 : frame;
        const stride = walk ? [0, 3, 0, -3][phase] : 0;
        const rect = (x, y, w, h, color) => {
            for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
                const px = frame * frameWidth + x + dx, py = row * frameHeight + y + dy;
                pixels.set([...palette[color], 255], py * (width * 4 + 1) + 1 + px * 4);
            }
        };
        rect(10, 32, 5, 11 - Math.max(0, stride), 'pants');
        rect(18, 32, 5, 11 + Math.min(0, stride), 'pants');
        rect(9, 42 - Math.max(0, stride), 7, 4, 'boot');
        rect(18, 42 + Math.min(0, stride), 7, 4, 'boot');
        rect(8, 23 - bob, 17, 13, 'outline');
        rect(9, 24 - bob, 15, 11, 'shirt');
        rect(10, 25 - bob, 4, 8, 'light');
        rect(5, 25 - bob + (phase % 2), 4, 10, 'skin');
        rect(24, 25 - bob - (phase % 2), 4, 10, 'skin');
        rect(9, 10 - bob, 16, 15, 'hair');
        if (row < 2) {
            rect(10, 13 - bob, 14, 11, 'skin');
            rect(row === 0 ? 19 : 12, 16 - bob, 2, 3, 'outline');
            rect(row === 0 ? 23 : 9, 19 - bob, 3, 3, 'skin');
            rect(16, 26 - bob, 2, 7, 'hat');
        } else {
            rect(row === 2 ? 9 : 22, 15 - bob, 2, 5, 'skin');
            rect(12, 24 - bob, 9, 3, 'pants');
        }
        rect(9, 6 - bob, 16, 6, 'hat');
        rect(6, 11 - bob, 22, 4, 'brim');
        rect(10, 6 - bob, 5, 4, 'hat');
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
    result.writeUInt32BE(data.length);
    body.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
const output = new URL('../public/assets/player/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('farmer.png', output), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
]));
console.log('Generated original farmer.png: 24 frames, 32x48, footpoint (16,46).');
