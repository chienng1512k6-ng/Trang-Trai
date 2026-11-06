import type { Scene } from 'phaser';
import { CAMERA_CONFIG, clampCameraZoom, viewportBounds, type WorldBounds } from '../core/camera';

/** Native Phaser follow owns frame updates. DOM UI stays outside world space. */
export class CameraController {
    readonly root: HTMLDivElement;
    private readonly status: HTMLElement;
    private readonly output: HTMLOutputElement;
    private disposed = false;
    private readonly camera;
    constructor(private readonly scene: Scene, private readonly target: { x: number; y: number },
        readonly mapBounds: WorldBounds, parent: HTMLElement) {
        this.camera = scene.cameras.main;
        this.root = document.createElement('div');
        this.root.className = 'camera-controls';
        this.root.innerHTML = '<div class="camera-status">FARM DEVELOPMENT · 32 × 32</div>'
            + '<div class="camera-zoom" role="group" aria-label="Camera zoom"><button type="button" aria-label="Zoom out">−</button>'
            + '<output aria-label="Zoom level"></output><button type="button" aria-label="Zoom in">+</button></div>';
        parent.append(this.root);
        this.status = this.root.querySelector('.camera-status')!;
        this.output = this.root.querySelector('output')!;
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('pointerdown', this.onPointerDown);
        scene.game.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        scene.scale.on('resize', this.onResize);
        scene.events.on('shutdown', this.destroy);
        scene.events.on('destroy', this.destroy);
        this.camera.setBackgroundColor('#172c2c');
        this.camera.startFollow(target, false, CAMERA_CONFIG.lerp, CAMERA_CONFIG.lerp);
        this.setZoom(CAMERA_CONFIG.defaultZoom);
        this.onResize(scene.scale.gameSize);
    }
    setStatus(text: string) { this.status.textContent = text; }
    setZoom(value: number) {
        if (this.disposed) return;
        this.camera.setZoom(clampCameraZoom(value));
        this.refreshBounds();
        this.output.value = `${Math.round(this.camera.zoom * 100)}%`;
    }
    zoomBy(factor: number) { this.setZoom(this.camera.zoom * factor); }
    private refreshBounds() {
        const c = this.camera;
        const b = viewportBounds(this.mapBounds, c.width, c.height, c.zoom);
        c.setBounds(b.x, b.y, b.width, b.height);
        // Reframe only on resize/zoom. No second camera update loop.
        c.centerOn(this.target.x, this.target.y);
    }
    private readonly onResize = (size: { width: number; height: number }) => {
        if (this.disposed || size.width <= 0 || size.height <= 0) return;
        this.camera.setViewport(0, 0, size.width, size.height);
        this.refreshBounds();
    };
    private readonly onClick = (event: Event) => {
        // Keyboard/assistive activation has detail 0. Pointer activation is
        // sampled on pointerdown: browsers can suppress clicks during multitouch.
        if ((event as MouseEvent).detail > 0) return;
        this.activateButton(event);
    };
    private readonly onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        this.activateButton(event);
    };
    private activateButton(event: Event) {
        const button = (event.target as HTMLElement).closest('button');
        if (button) this.zoomBy(button.getAttribute('aria-label') === 'Zoom in' ? CAMERA_CONFIG.zoomFactor : 1 / CAMERA_CONFIG.zoomFactor);
    }
    private readonly onWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
        event.preventDefault();
        this.zoomBy(event.deltaY < 0 ? CAMERA_CONFIG.zoomFactor : 1 / CAMERA_CONFIG.zoomFactor);
    };
    readonly destroy = () => {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.scale.off('resize', this.onResize);
        this.scene.events.off('shutdown', this.destroy);
        this.scene.events.off('destroy', this.destroy);
        this.scene.game.canvas.removeEventListener('wheel', this.onWheel);
        this.root.removeEventListener('click', this.onClick);
        this.root.removeEventListener('pointerdown', this.onPointerDown);
        this.root.remove();
        this.camera.stopFollow();
    };
}
