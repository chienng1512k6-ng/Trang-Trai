import type { Scene, Game } from 'phaser';
import { FrameMetrics } from '../core/frameMetrics';

const instances = new WeakMap<Game, DevPerformance>();
/** Loaded only through the DEV dynamic import. No production global or overlay. */
export class DevPerformance {
    private readonly frames = new FrameMetrics();
    private readonly ai = new FrameMetrics(4096, true);
    private last?: number;
    private lastPaint = 0;
    private excluded = 0;
    private readonly overlay: HTMLPreElement;
    private disposed = false;
    private constructor(private readonly game: Game, parent: HTMLElement) {
        this.overlay = document.createElement('pre'); this.overlay.className = 'performance-overlay';
        this.overlay.style.cssText = 'position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:20;pointer-events:none;background:#102322dd;color:#d5efb3;padding:5px;font:10px monospace;margin:0;max-width:45%;white-space:pre-wrap';
        parent.append(this.overlay);
        game.events.on('poststep', this.frame);
        game.events.once('destroy', this.destroy);
        document.addEventListener('visibilitychange', this.discontinuity);
        window.addEventListener('blur', this.discontinuity);
        window.addEventListener('focus', this.discontinuity);
    }
    static attach(scene: Scene, parent: HTMLElement) {
        let instance = instances.get(scene.game);
        if (!instance) { instance = new DevPerformance(scene.game, parent); instances.set(scene.game, instance); }
        scene.data.set('performance', instance);
        return instance;
    }
    recordAI(ms: number) { this.ai.add(ms); }
    reset() { this.frames.reset(); this.ai.reset(); this.last = undefined; this.excluded = 0; }
    private readonly discontinuity = () => { this.last = undefined; this.excluded++; };
    private readonly frame = () => {
        const now = performance.now();
        if (document.hidden) { this.last = undefined; return; }
        if (this.last !== undefined) this.frames.add(now - this.last);
        this.last = now;
        if (now - this.lastPaint >= 1000) {
            this.lastPaint = now;
            const s = this.frames.snapshot();
            this.overlay.textContent = `DEV measured: ${s.meanFPS?.toFixed(1) ?? '-'} FPS / p5 ${s.p5FPS?.toFixed(1) ?? '-'}\nframe mean ${s.meanMs?.toFixed(2) ?? '-'}ms p95 ${s.p95Ms?.toFixed(2) ?? '-'}ms\n>33.3: ${s.over33_3ms} >50: ${s.over50ms}`;
        }
    };
    snapshot() {
        const scene = this.game.scene.getScene('Game');
        const list = scene.children.list;
        const memory = 'memory' in performance ? performance.memory : undefined;
        const heapBytes = memory && typeof memory === 'object' && 'usedJSHeapSize' in memory
            && typeof memory.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
        const ai = this.ai.snapshot();
        return { build: 'development', clock: 'performance.now between Phaser poststep events',
            frames: this.frames.snapshot(), ai: { samples: ai.samples, sampledMs: ai.sampledMs,
                meanMs: ai.meanMs, p95Ms: ai.p95Ms, maxMs: ai.maxMs }, excludedDiscontinuities: this.excluded, heapBytes,
            objects: { total: list.length, slimes: list.filter(o => o.name === 'green-slime').length,
                obstacles: list.filter(o => o.name.startsWith('obstacle-')).length },
            listeners: { shutdown: scene.events.listenerCount('shutdown'), keydown: scene.input.keyboard?.listenerCount('keydown') ?? 0,
                keyup: scene.input.keyboard?.listenerCount('keyup') ?? 0, resize: this.game.scale.listenerCount('resize'),
                poststep: this.game.events.listenerCount('poststep') },
            overlays: Object.fromEntries(['touch-controls', 'camera-controls', 'combat-hud', 'performance-overlay']
                .map(name => [name, document.querySelectorAll(`.${name}`).length])) };
    }
    private readonly destroy = () => {
        if (this.disposed) return; this.disposed = true;
        this.game.events.off('poststep', this.frame); this.game.events.off('destroy', this.destroy);
        document.removeEventListener('visibilitychange', this.discontinuity);
        window.removeEventListener('blur', this.discontinuity); window.removeEventListener('focus', this.discontinuity);
        this.overlay.remove(); instances.delete(this.game);
    };
}
