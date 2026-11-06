import StartGame from '../src/game/main';
import { playerWorldPosition } from '../src/core/player';
import { MAP_ORIGIN } from '../src/core/prototypeMap';

/** Run on the default development URL (without playerDemo) for repeatable checks. */
export async function runPlayerBrowserChecks() {
    const game = StartGame('game-container');
    try {
        let player, scene;
        for (let attempt = 0; attempt < 100; attempt++) {
            scene = game.scene.getScene('Game');
            player = scene?.data?.get('player');
            if (player) break;
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        if (!player) throw new Error('Player failed to load.');
        const initial = { ...player.state.position };
        if (initial.col !== 16.5 || initial.row !== 16.5) throw new Error('Spawn position mismatch.');
        const frames = [];
        const directions = [];
        for (const input of [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: -1, row: 0 }, { col: 0, row: -1 }]) {
            player.setInput({ sample: () => input });
            player.update(16);
            const sprite = player.view.sprite;
            const before = sprite.frame.name;
            // Let real scene updates and Phaser's animation clock run.
            await new Promise(resolve => setTimeout(resolve, 220));
            const after = sprite.frame.name;
            if (before === after) throw new Error('Walk animation frame did not advance.');
            if (player.state.motion !== 'walk') throw new Error('Player did not walk.');
            const expected = playerWorldPosition(player.state, MAP_ORIGIN);
            if (sprite.x !== expected.x || sprite.y !== expected.y || sprite.depth !== expected.y) throw new Error('Footpoint/depth mismatch.');
            frames.push([before, after]); directions.push(player.state.facing);
            player.setInput({ sample: () => ({ col: 0, row: 0 }) });
            player.update(16);
            const stopped = { ...player.state.position };
            await new Promise(resolve => setTimeout(resolve, 100));
            if (player.state.motion !== 'idle' || player.state.facing !== directions.at(-1)
                || player.state.position.col !== stopped.col || player.state.position.row !== stopped.row) {
                throw new Error('Idle/facing retention failed.');
            }
        }
        if (new Set(directions).size !== 4) throw new Error('Missing facing.');
        return { status: 'PASS', initial, directions, walkFrameChanges: frames,
            animations: game.anims.anims.getArray().filter(animation => animation.key.startsWith('player-')).length,
            footOrigin: { x: player.view.sprite.originX, y: player.view.sprite.originY },
            obstacles: scene.data.get('obstacleCount'), groundTiles: scene.data.get('ground').tilesDrawn };
    } finally { game.destroy(true); }
}
