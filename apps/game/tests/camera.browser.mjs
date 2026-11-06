import { Cameras } from 'phaser';
import { mapWorldBounds, viewportBounds } from '../src/core/camera';
import { MAP_ORIGIN } from '../src/core/prototypeMap';
import { gridToWorldCenter } from '../src/core/isometric';
import { pointerToGridCell } from '../src/game/isometricPointer';

/** Real Phaser 4 Camera, not a mock of its clamp/follow/matrix implementation. */
export function verifyCameraGeometry() {
    let checks = 0;
    const assert = (condition, message) => { if (!condition) throw new Error(message); checks++; };
    const map = mapWorldBounds(MAP_ORIGIN);
    for (const [width, height] of [[568, 320], [844, 390], [1024, 600], [1280, 720], [3000, 1800]]) {
        for (const zoom of [0.5, 1.5, 3]) {
            const camera = new Cameras.Scene2D.Camera(0, 0, width, height);
            camera.setZoom(zoom);
            const b = viewportBounds(map, width, height, zoom);
            camera.setBounds(b.x, b.y, b.width, b.height);
            const foot = { x: 1024, y: 528 };
            camera.startFollow(foot, false, 0.12, 0.12);
            for (const cell of [{ col: 0, row: 0 }, { col: 31, row: 0 }, { col: 0, row: 31 }, { col: 31, row: 31 }, { col: 16, row: 16 }]) {
                Object.assign(foot, gridToWorldCenter(cell, undefined, MAP_ORIGIN));
                for (let n = 0; n < 240; n++) camera.preRender();
                const view = camera.worldView;
                assert(view.x >= b.x - 1e-7 && view.y >= b.y - 1e-7
                    && view.right <= b.x + b.width + 1e-7 && view.bottom <= b.y + b.height + 1e-7, 'Native camera escaped bounds');
                if (width / zoom >= map.width) assert(Math.abs(view.centerX - 1024) < 1e-7, 'Oversized X not centered');
                if (height / zoom >= map.height) assert(Math.abs(view.centerY - 512) < 1e-7, 'Oversized Y not centered');
                const scroll = { x: camera.scrollX, y: camera.scrollY };
                camera.preRender();
                assert(Math.abs(camera.scrollX - scroll.x) < 1e-7 && Math.abs(camera.scrollY - scroll.y) < 1e-7, 'Camera oscillates');
                const point = camera.matrixCombined.transformPoint(foot.x, foot.y);
                const selected = pointerToGridCell(point, camera, undefined, MAP_ORIGIN);
                assert(selected.col === cell.col && selected.row === cell.row, 'Pointer grid mismatch after follow/zoom');
            }
            camera.destroy();
        }
    }
    return { checks, engine: 'real Phaser Camera' };
}
