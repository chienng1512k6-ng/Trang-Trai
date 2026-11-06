import { Math as PhaserMath, type Scene } from 'phaser';
import { gridToWorldCenter, DEFAULT_TILE_DIMENSIONS as tile } from '../core/isometric';
import { MAP_ORIGIN, type Obstacle } from '../core/prototypeMap';

export function renderObstacle(scene: Scene, obstacle: Obstacle) {
    const center = gridToWorldCenter(obstacle, tile, MAP_ORIGIN);
    const graphic = scene.add.graphics({ x: center.x, y: center.y }).setDepth(center.y);
    graphic.setName(`obstacle-${obstacle.id}`);
    graphic.fillStyle(0x263c2c, 0.35).fillEllipse(0, 0, 34, 14);
    if (obstacle.kind === 'tree') {
        graphic.fillStyle(0x63482e).fillRect(-4, -34, 8, 34);
        graphic.fillStyle(0x244e3c).fillPoints([{ x: -26, y: -20 }, { x: 0, y: -70 }, { x: 26, y: -20 }].map(({ x, y }) => new PhaserMath.Vector2(x, y)), true);
        graphic.fillStyle(0x397351).fillPoints([{ x: -22, y: -36 }, { x: 0, y: -78 }, { x: 22, y: -36 }].map(({ x, y }) => new PhaserMath.Vector2(x, y)), true);
        graphic.fillStyle(0x56905d).fillTriangle(-12, -50, 0, -78, 0, -50);
    } else {
        graphic.fillStyle(0x68777b).fillPoints([{ x: -19, y: -2 }, { x: -14, y: -22 },
            { x: 7, y: -28 }, { x: 21, y: -12 }, { x: 15, y: 1 }].map(({ x, y }) => new PhaserMath.Vector2(x, y)), true);
        graphic.fillStyle(0x9da99c).fillTriangle(-14, -22, 7, -28, 1, -10);
    }
    return graphic;
}
