import { Tilemaps } from 'phaser';
import StartGame from '../src/game/main';
import { gridToWorldCenter } from '../src/core/isometric';
import { MAP_ORIGIN } from '../src/core/prototypeMap';
import { pointerToGridCell } from '../src/game/isometricPointer';

/** Start a temporary real scene, verify loaded/rendered layers, then destroy it. */
export async function runTilemapBrowserChecks() {
    const game = StartGame('game-container');
    try {
        let scene;
        for (let attempt = 0; attempt < 100; attempt++) {
            scene = game.scene.getScene('Game');
            if (scene?.data?.get('coordinateChecks')) break;
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        if (!scene?.data?.get('coordinateChecks')) throw new Error('Map scene did not become ready.');
        await new Promise(resolve => setTimeout(resolve, 100));
        const ground = scene.data.get('ground');
        const detail = scene.data.get('detail');
        if (!(ground instanceof Tilemaps.TilemapLayer) || !(detail instanceof Tilemaps.TilemapLayer)) {
            throw new Error('Expected ordinary TilemapLayer instances.');
        }
        if (ground.tilesDrawn <= 0) throw new Error('No ground tiles rendered.');
        const checks = scene.data.get('coordinateChecks');
        const camera = scene.cameras.main;
        camera.preRender();
        for (const cell of checks) {
            const world = gridToWorldCenter(cell, undefined, MAP_ORIGIN);
            const screen = camera.matrixCombined.transformPoint(world.x, world.y);
            const picked = pointerToGridCell(screen, camera, undefined, MAP_ORIGIN);
            if (picked.col !== cell.col || picked.row !== cell.row) throw new Error('Pointer coordinate mismatch.');
        }
        const map = scene.data.get('map');
        return { status: 'PASS', width: map.width, height: map.height, orientation: map.orientation,
            layers: [ground.type, detail.type], tilesDrawn: ground.tilesDrawn,
            groundTiles: ground.layer.data.flat().filter(tile => tile.index > 0).length,
            obstacles: scene.data.get('obstacleCount'), coordinateChecks: checks };
    } finally {
        game.destroy(true);
    }
}
