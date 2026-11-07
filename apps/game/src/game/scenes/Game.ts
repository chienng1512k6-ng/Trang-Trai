import { Scene, Tilemaps, Math as PhaserMath, type Loader } from 'phaser';
import { DEFAULT_TILE_DIMENSIONS as tile, PROTOTYPE_MAP_BOUNDS as bounds,
    gridToWorld, gridToWorldCenter, isGridCellWithinBounds } from '../../core/isometric';
import { MAP_ASSETS, MAP_ORIGIN, validatePrototypeMap, obstacleColliders } from '../../core/prototypeMap';
import { pointerToGridCell } from '../isometricPointer';
import { Player } from '../player/Player';
import { PLAYER_ART } from '../player/PlayerView';
import { KeyboardInput } from '../player/KeyboardInput';
import { TouchControls } from '../player/TouchControls';
import { CombinedInput } from '../player/CombinedInput';
import { CameraController } from '../CameraController';
import { mapWorldBounds } from '../../core/camera';
import { renderObstacle } from '../ObstacleRenderer';
import { installDepthOrder } from '../depthOrder';
import { Monster, SLIME_ART } from '../Monster';
import { CombatController } from '../CombatController';
import type { DevPerformance } from '../DevPerformance';

export class Game extends Scene {
    private player?: Player;
    private monster?: Monster;
    private combat?: CombatController;
    private cameraController?: CameraController;
    private performanceProbe?: DevPerformance;
    constructor() { super('Game'); }

    preload() {
        const onLoadError = (file: Loader.File) => {
            console.error(`Map asset failed: ${file.key} (${file.url})`);
        };
        this.load.on('loaderror', onLoadError);
        this.events.once('shutdown', () => this.load.off('loaderror', onLoadError));
        this.load.tilemapTiledJSON(MAP_ASSETS.mapKey, MAP_ASSETS.mapUrl);
        this.load.image(MAP_ASSETS.textureKey, MAP_ASSETS.textureUrl);
        this.load.spritesheet(PLAYER_ART.key, PLAYER_ART.url, { frameWidth: PLAYER_ART.frameWidth, frameHeight: PLAYER_ART.frameHeight });
        this.load.spritesheet(SLIME_ART.key, SLIME_ART.url, { frameWidth: SLIME_ART.frameWidth, frameHeight: SLIME_ART.frameHeight });
    }

    create() {
        try {
            const { obstacles, obstacleViews } = this.createMap();
            this.player = new Player(this, MAP_ORIGIN, undefined, obstacleColliders(obstacles));
            this.monster = new Monster(this, MAP_ORIGIN, obstacleColliders(obstacles));
            installDepthOrder(this, [...obstacleViews, this.monster.view.sprite, this.player.view.sprite]);
            this.data.set('monster', this.monster);
            this.data.set('player', this.player);
            const cameraParent = this.game.canvas.closest<HTMLElement>('#app') ?? this.game.canvas.parentElement;
            if (!cameraParent) throw new Error('Game container unavailable.');
            this.cameraController = new CameraController(this, this.player.view.sprite, mapWorldBounds(MAP_ORIGIN), cameraParent);
            this.data.set('cameraController', this.cameraController);
            if (import.meta.env.DEV && new URLSearchParams(location.search).get('perf') === '1') {
                void import('../DevPerformance').then(({ DevPerformance }) => {
                    if (this.sys.isActive()) this.performanceProbe = DevPerformance.attach(this, cameraParent);
                });
            }
            this.events.once('shutdown', () => { this.performanceProbe = undefined; });
            let attackInput = () => false;
            this.combat = new CombatController(this, this.player, this.monster, obstacleColliders(obstacles), cameraParent, () => attackInput());
            this.data.set('combat', this.combat);
            this.events.once('shutdown', () => { this.combat = undefined; });
            this.events.once('shutdown', () => { this.player?.destroy(); this.player = undefined; });
            this.events.once('shutdown', () => { this.monster?.destroy(); this.monster = undefined; });
            if (import.meta.env.DEV && new URLSearchParams(location.search).get('playerDemo') === '1') {
                void import('../player/demoInput').then(({ DemoInput }) => {
                    if (this.sys.isActive()) this.player?.setInput(new DemoInput());
                });
            } else {
                if (!this.input.keyboard) throw new Error('Keyboard plugin is unavailable.');
                const keyboard = new KeyboardInput(this.input.keyboard, this.events);
                const parent = this.game.canvas.closest<HTMLElement>('#app') ?? this.game.canvas.parentElement;
                if (!parent) throw new Error('Game container is unavailable for touch controls.');
                const touch = new TouchControls(this.events, parent);
                attackInput = () => {
                    const keys = keyboard.consumeAttack(), action = touch.action.consumeAttack();
                    return !touch.isBlocked() && (keys || action);
                };
                this.player.setInput(new CombinedInput(keyboard, touch.joystick, touch.isBlocked));
                this.data.set('keyboardInput', keyboard);
                this.data.set('touchControls', touch);
            }
        } catch (error) {
            console.error(error);
            this.add.text(24, 24, 'Scene could not load. Check asset paths and browser console.', { color: '#ffb4a2' });
        }
    }

    update(_time: number, delta: number) {
        this.player?.update(delta, this.combat?.canControl ?? true);
        const aiStart = this.performanceProbe ? performance.now() : 0;
        this.monster?.update(delta, this.combat?.canControl ? this.player?.state.position : undefined);
        if (this.performanceProbe) this.performanceProbe.recordAI(performance.now() - aiStart);
        this.combat?.update(delta);
    }

    private createMap() {
        if (!this.cache.tilemap.exists(MAP_ASSETS.mapKey) || !this.textures.exists(MAP_ASSETS.textureKey)) {
            throw new Error('Required map JSON or tileset image is missing.');
        }
        const raw: unknown = this.cache.tilemap.get(MAP_ASSETS.mapKey).data;
        const obstacles = validatePrototypeMap(raw);
        const map = this.make.tilemap({ key: MAP_ASSETS.mapKey });
        // Phaser 4.0.0 types say string; parser source returns numeric Orientation.
        const orientation: unknown = map.orientation;
        if (orientation !== Tilemaps.Orientation.ISOMETRIC) throw new Error('Map orientation mismatch.');
        const tileset = map.addTilesetImage(MAP_ASSETS.tilesetName, MAP_ASSETS.textureKey);
        if (!tileset) throw new Error('Map tileset name or texture does not match.');
        // FDS-003: layer origin is image top-left, half a tile left of diamond top.
        const layerX = MAP_ORIGIN.x - tile.width / 2;
        const ground = map.createLayer('Ground', tileset, layerX, MAP_ORIGIN.y);
        const detail = map.createLayer('Detail', tileset, layerX, MAP_ORIGIN.y);
        if (!ground || !detail || !map.getObjectLayer('Obstacles')) throw new Error('Required map layer is missing.');
        ground.setDepth(-2);
        detail.setDepth(-1);
        const obstacleViews = [...obstacles].sort((a, b) => a.id - b.id).map(obstacle => renderObstacle(this, obstacle));
        this.data.set({ obstacles, obstacleViews, colliders: obstacleColliders(obstacles) });

        const bottom = gridToWorld({ col: bounds.columns, row: bounds.rows }, tile, MAP_ORIGIN);
        const camera = this.cameras.main;

        const checkpoints = [{ col: 0, row: 0 }, { col: 5, row: 5 }, { col: 0, row: 31 },
            { col: 31, row: 0 }, { col: 31, row: 31 }];
        const coordinateChecks = checkpoints.map(cell => {
            const actual = ground.tileToWorldXY(cell.col, cell.row);
            const expected = gridToWorld(cell, tile, MAP_ORIGIN);
            const top = { x: actual.x + tile.width / 2, y: actual.y };
            if (top.x !== expected.x || top.y !== expected.y) throw new Error('FDS-003 layer coordinate mismatch.');
            const center = gridToWorldCenter(cell, tile, MAP_ORIGIN);
            this.add.circle(center.x, center.y, 5, 0xffe3a3).setDepth(bottom.y + 1);
            return { ...cell, actual: top, expected };
        });
        this.data.set({ map, ground, detail, coordinateChecks, obstacleCount: obstacles.length });

        const highlight = this.add.graphics().setDepth(bottom.y + 1);
        this.input.on('pointermove', (pointer: Parameters<typeof pointerToGridCell>[0]) => {
            const cell = pointerToGridCell(pointer, camera, tile, MAP_ORIGIN);
            highlight.clear();
            this.cameraController?.setStatus(`FARM DEVELOPMENT  /  ISOMETRIC MAP\n${isGridCellWithinBounds(cell) ? `Cell ${cell.col}, ${cell.row}` : 'Outside map'} · 32 × 32`);
            if (!isGridCellWithinBounds(cell)) return;
            const top = gridToWorld(cell, tile, MAP_ORIGIN);
            highlight.lineStyle(2, 0xffe3a3).strokePoints([
                { x: top.x, y: top.y }, { x: top.x + tile.width / 2, y: top.y + tile.height / 2 },
                { x: top.x, y: top.y + tile.height }, { x: top.x - tile.width / 2, y: top.y + tile.height / 2 },
            ].map(({ x, y }) => new PhaserMath.Vector2(x, y)), true);
        });
        return { obstacles, obstacleViews };
    }

}
