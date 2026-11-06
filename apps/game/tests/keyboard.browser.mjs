import StartGame from '../src/game/main';
import { playerWorldPosition, createPlayer } from '../src/core/player';
import { isPositionBlocked, PLAYER_HALF_EXTENT } from '../src/core/collision';
import { MAP_ORIGIN } from '../src/core/prototypeMap';
import { verifyCameraGeometry } from './camera.browser.mjs';
import { pointerToGridCell } from '../src/game/isometricPointer';
import { createMonster, MONSTER_CONFIG } from '../src/core/monster';
import { createCombat } from '../src/core/combat';

/** Fixture for real browser key presses; dispose it when verification finishes. */
export async function startKeyboardBrowserCheck() {
    const game = StartGame('game-container');
    async function ready(previous) {
        for (let n = 0; n < 100; n++) {
            const scene = game.scene.getScene('Game');
            const player = scene?.data?.get('player');
            if (player && player !== previous && scene.sys.isActive()) return scene;
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        throw new Error('Keyboard scene did not become ready.');
    }
    let scene = await ready();
    let watch;
    let samples = 0;
    let penetrations = 0;
    return {
        combatCase(kind = 'hit') {
            const combat = scene.data.get('combat'); combat.current = createCombat();
            const blocked = kind === 'blocked';
            const playerPosition = blocked ? { col: 4.1, row: 7.5 } : { col: 20, row: 16.5 };
            const slime = blocked ? { col: 4.9, row: 7.5 } : { col: kind === 'outside' ? 24 : kind === 'knockout' ? 20.5 : 21, row: 16.5 };
            this.placePlayerForMonster(playerPosition);
            const player = scene.data.get('player');
            player.current = { ...player.state, facing: kind === 'back' ? 'northWest' : 'southEast' };
            player.view.sync(player.state);
            this.resetMonster({ ...MONSTER_CONFIG, spawn: slime });
            if (kind === 'knockout') combat.current = { ...combat.current, player: { hp: 1, maxHP: 5 } };
            return this.combatSnapshot();
        },
        combatSnapshot() {
            const combat = scene.data.get('combat');
            return { state: combat.state, canControl: combat.canControl,
                hud: globalThis.document.querySelector('.combat-hp')?.textContent,
                message: globalThis.document.querySelector('.combat-message')?.textContent,
                swingActive: combat.swingRemaining > 0, monster: this.monsterSnapshot(), player: this.snapshot(),
                overlays: globalThis.document.querySelectorAll('.combat-hud').length };
        },
        monsterSnapshot() {
            const monster = scene.data.get('monster');
            const sprite = monster.view.sprite;
            scene.children.depthSort();
            return { mode: monster.state.mode, position: { ...monster.state.body.position }, spawn: monster.state.spawn,
                seed: monster.state.seed, motion: monster.state.body.motion,
                animation: sprite.anims.currentAnim?.key, frame: sprite.frame.name,
                foot: { x: sprite.x, y: sprite.y }, depth: sprite.depth,
                index: scene.children.list.indexOf(sprite),
                blocked: isPositionBlocked(monster.state.body.position, scene.data.get('colliders')),
                count: scene.children.list.filter(o => o.name === 'green-slime').length,
                shutdownListeners: scene.events.listenerCount('shutdown'),
                cameraFollowsPlayer: scene.cameras.main._follow === scene.data.get('player').view.sprite };
        },
        // Test fixture reseeding only. This module is absent from production imports.
        resetMonster(config = MONSTER_CONFIG) {
            const monster = scene.data.get('monster');
            monster.config = config;
            monster.current = createMonster(scene.data.get('colliders'), config);
            monster.view.sync(monster.state);
        },
        placePlayerForMonster(position) {
            const player = scene.data.get('player');
            player.current = createPlayer(position, scene.data.get('colliders'));
            player.view.sync(player.state);
        },
        stepMonster(target, frames = 1, dt = 20) {
            const monster = scene.data.get('monster');
            const modes = new Set();
            for (let n = 0; n < frames; n++) {
                monster.update(dt, target); modes.add(monster.state.mode);
                if (isPositionBlocked(monster.state.body.position, scene.data.get('colliders'))) throw new Error('Monster penetration');
            }
            return { modes: [...modes], snapshot: this.monsterSnapshot() };
        },
        monsterEvent(event) { scene.data.get('monster').event(event); },
        async sampleSlimeOcclusion(atTree = false) {
            const sprite = scene.data.get('monster').view.sprite;
            const tree = scene.data.get('obstacleViews')[0];
            const screen = scene.cameras.main.matrixCombined.transformPoint(atTree ? tree.x : sprite.x, atTree ? tree.y - 8 : sprite.y - 14);
            if (screen.x < 0 || screen.y < 0 || screen.x >= game.canvas.width || screen.y >= game.canvas.height) {
                throw new Error('Occlusion sample outside camera viewport; zoom out first.');
            }
            return new Promise(resolve => game.renderer.snapshotPixel(Math.round(screen.x), Math.round(screen.y),
                color => resolve({ r: color.r, g: color.g, b: color.b })));
        },
        beginCollisionWatch() {
            if (watch) throw new Error('Collision watch already active.');
            samples = 0; penetrations = 0;
            watch = () => {
                samples++;
                if (isPositionBlocked(scene.data.get('player').state.position, scene.data.get('colliders'))) penetrations++;
            };
            scene.events.on('postupdate', watch);
        },
        endCollisionWatch() {
            scene.events.off('postupdate', watch); watch = undefined;
            return { samples, penetrations };
        },
        // QA-only valid state reseeding, never imported by the production entry.
        placeNearObstacle(kind, side = 'left') {
            const obstacle = scene.data.get('obstacles').find(o => o.kind === kind);
            const center = { col: obstacle.col + 0.5, row: obstacle.row + 0.5 };
            const position = side === 'behind' ? { col: center.col - 0.5, row: center.row - 0.5 }
                : side === 'front' ? { col: center.col + 0.5, row: center.row + 0.5 }
                : side === 'tie' ? { col: center.col - 0.6, row: center.row + 0.6 }
                : { col: center.col - obstacle.collisionWidth / 2 - PLAYER_HALF_EXTENT - 0.05, row: center.row };
            const player = scene.data.get('player');
            player.current = createPlayer(position, scene.data.get('colliders'));
            player.view.sync(player.state);
            scene.cameras.main.centerOn(player.view.sprite.x, player.view.sprite.y);
            return this.collisionSnapshot();
        },
        collisionSnapshot() {
            const player = scene.data.get('player');
            scene.children.depthSort();
            return { ...this.snapshot(), blocked: isPositionBlocked(player.state.position, scene.data.get('colliders')),
                obstacles: scene.data.get('obstacleViews').map(o => ({ name: o.name, depth: o.depth, x: o.x, y: o.y,
                    index: scene.children.list.indexOf(o) })),
                playerIndex: scene.children.list.indexOf(player.view.sprite),
                objectCount: scene.children.list.filter(o => o.name.startsWith('obstacle-')).length,
                shutdownListeners: scene.events.listenerCount('shutdown') };
        },
        stepCollisionKeys(codes, frames = 8) {
            const player = scene.data.get('player');
            for (const code of codes) scene.input.keyboard.emit('keydown', { code, preventDefault() {} });
            const trace = [];
            try {
                for (let n = 0; n < frames; n++) {
                    player.update(16);
                    if (isPositionBlocked(player.state.position, scene.data.get('colliders'))) throw new Error('Penetration');
                    trace.push({ ...player.state.position });
                }
            } finally {
                for (const code of codes) scene.input.keyboard.emit('keyup', { code });
                player.update(16);
            }
            return { trace, snapshot: this.collisionSnapshot() };
        },
        async sampleTreePixel() {
            const tree = scene.data.get('obstacleViews')[0];
            const screen = scene.cameras.main.matrixCombined.transformPoint(tree.x, tree.y - 24);
            return new Promise(resolve => game.renderer.snapshotPixel(Math.round(screen.x), Math.round(screen.y),
                color => resolve({ r: color.r, g: color.g, b: color.b })));
        },
        verifyCameraGeometry,
        cameraSnapshot() {
            const camera = scene.cameras.main;
            const foot = scene.data.get('player').view.sprite;
            const screenFoot = camera.matrixCombined.transformPoint(foot.x, foot.y);
            return { zoom: camera.zoom, width: camera.width, height: camera.height,
                scroll: { x: camera.scrollX, y: camera.scrollY },
                view: { x: camera.worldView.x, y: camera.worldView.y, width: camera.worldView.width, height: camera.worldView.height },
                foot: { x: foot.x, y: foot.y },
                screenFoot, pickedFoot: pointerToGridCell(screenFoot, camera, undefined, MAP_ORIGIN), depth: foot.depth,
                scaleListeners: game.scale.listenerCount('resize'),
                overlays: globalThis.document.querySelectorAll('.camera-controls').length };
        },
        snapshot() {
            const player = scene.data.get('player');
            const touch = scene.data.get('touchControls');
            return { position: { ...player.state.position }, world: playerWorldPosition(player.state, MAP_ORIGIN),
                motion: player.state.motion, facing: player.state.facing,
                animation: player.view.sprite.anims.currentAnim.key,
                keyboardListeners: scene.input.keyboard.listenerCount('keydown'),
                hasKeyboard: Boolean(scene.data.get('keyboardInput')),
                touch: touch ? { pointerId: touch.joystick.pointerId, displacement: touch.joystick.displacement,
                    actionPointerId: touch.action.pointerId, actionPressed: touch.action.pressed, blocked: touch.isBlocked(),
                    overlays: touch.root.parentElement.querySelectorAll('.touch-controls').length } : null };
        },
        async restart() {
            if (watch) this.endCollisionWatch();
            const previous = scene.data.get('player');
            scene.scene.restart();
            scene = await ready(previous);
        },
        // Deterministic edge stress through the same keyboard adapter and movement
        // used in real frame updates; no direct edits to player position.
        stressBounds() {
            const player = scene.data.get('player');
            for (const [code, keyCode] of [['KeyW', 87], ['KeyD', 68], ['KeyS', 83], ['KeyA', 65]]) {
                scene.input.keyboard.emit('keydown', { code, keyCode, preventDefault() {} });
                for (let n = 0; n < 1000; n++) player.update(50);
                scene.input.keyboard.emit('keyup', { code });
                player.update(16);
                const { col, row } = player.state.position;
                if (col < 0.25 || row < 0.25 || col > 31.75 || row > 31.75) throw new Error('Player escaped map.');
            }
            return this.snapshot();
        },
        dispose() { if (watch) this.endCollisionWatch(); game.destroy(true); },
    };
}
