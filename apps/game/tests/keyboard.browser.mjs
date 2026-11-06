import StartGame from '../src/game/main';
import { playerWorldPosition } from '../src/core/player';
import { MAP_ORIGIN } from '../src/core/prototypeMap';

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
    return {
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
        dispose() { game.destroy(true); },
    };
}
