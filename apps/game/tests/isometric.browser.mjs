import { Cameras, Math as PhaserMath, Tilemaps, VERSION } from 'phaser';
import { gridToWorld, gridToWorldCenter, worldToGridCell } from '../src/core/isometric';
import { pointerToGridCell } from '../src/game/isometricPointer';

/** Run through Vite in a real browser; no map, renderer or game instance needed. */
export function runIsometricBrowserChecks() {
    let checks = 0;
    const equal = (actual, expected) => {
        if (actual.col !== expected.col || actual.row !== expected.row) {
            throw new Error(`Cell mismatch: ${JSON.stringify({ actual, expected })}`);
        }
        checks++;
    };
    if (VERSION !== '4.0.0') throw new Error(`Unexpected Phaser ${VERSION}`);
    const cells = [{ col: 0, row: 0 }, { col: 5, row: 5 }, { col: -2, row: 3 }, { col: 32, row: 32 }];
    const origin = { x: 140, y: -50 };
    for (const zoom of [0.5, 1, 2, 3]) {
        for (const rotation of [0, 0.2]) {
            const camera = new Cameras.Scene2D.Camera(25, 40, 800, 600);
            camera.setScroll(-120, 75).setZoom(zoom).setRotation(rotation);
            camera.preRender();
            try {
                for (const cell of cells) {
                    const world = gridToWorldCenter(cell, undefined, origin);
                    const screen = camera.matrixCombined.transformPoint(world.x, world.y);
                    equal(pointerToGridCell(screen, camera, undefined, origin), cell);
                }
            } finally {
                camera.destroy();
            }
        }
    }
    const layer = {
        baseTileWidth: 64, baseTileHeight: 32,
        tilemapLayer: { x: origin.x - 32, y: origin.y, scaleX: 1, scaleY: 1, scrollFactorX: 1, scrollFactorY: 1 },
    };
    const camera = { scrollX: -120, scrollY: 75 };
    for (const cell of cells) {
        const point = new PhaserMath.Vector2();
        const projected = Tilemaps.Components.IsometricTileToWorldXY(cell.col, cell.row, point, camera, layer);
        const top = gridToWorld(cell, undefined, origin);
        if (top.x !== projected.x + 32 || top.y !== projected.y) throw new Error('Tile projection mismatch');
        checks++;
        const center = gridToWorldCenter(cell, undefined, origin);
        const picked = Tilemaps.Components.IsometricWorldToTileXY(center.x, center.y, true, point, camera, layer, true);
        equal(worldToGridCell(center, undefined, origin), { col: picked.x, row: picked.y });
    }
    return { phaser: VERSION, checks, status: 'PASS' };
}
