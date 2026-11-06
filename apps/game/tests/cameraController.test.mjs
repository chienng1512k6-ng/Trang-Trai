import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraController } from '../src/game/CameraController';
import { mapWorldBounds } from '../src/core/camera';
import { MAP_ORIGIN } from '../src/core/prototypeMap';

class Target {
    listeners = new Map(); children = [];
    on(name, fn) { this.addEventListener(name, fn); }
    off(name, fn) { this.removeEventListener(name, fn); }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name, value) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(value); }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    querySelector() { return {}; }
    count(name) { return this.listeners.get(name)?.size ?? 0; }
}
function fixture() {
    vi.stubGlobal('document', { createElement: () => new Target() });
    const canvas = new Target(), scale = new Target(), events = new Target(), parent = new Target();
    scale.gameSize = { width: 844, height: 390 };
    const camera = { width: 844, height: 390, zoom: 1,
        setBackgroundColor: vi.fn(), startFollow: vi.fn(), stopFollow: vi.fn(), setBounds: vi.fn(), centerOn: vi.fn(),
        setZoom(z) { this.zoom = z; }, setViewport(x, y, w, h) { this.width = w; this.height = h; } };
    const scene = { cameras: { main: camera }, game: { canvas }, scale, events };
    const foot = { x: 1024, y: 528 };
    const controller = new CameraController(scene, foot, mapWorldBounds(MAP_ORIGIN), parent);
    return { controller, camera, foot, canvas, scale, events, parent, scene };
}
afterEach(() => vi.unstubAllGlobals());
describe('native follow adapter and lifecycle', () => {
    it('follows the live sprite footpoint with smoothing, without a second update loop', () => {
        const { camera, foot, events } = fixture();
        expect(camera.startFollow).toHaveBeenCalledWith(foot, false, 0.12, 0.12);
        foot.x += 40;
        expect(camera.startFollow.mock.calls[0][0].x).toBe(1064);
        expect(events.count('update')).toBe(0);
    });
    it('zoom clamps and never mutates player world position', () => {
        const { controller, camera, foot } = fixture();
        controller.setZoom(99); expect(camera.zoom).toBe(3);
        controller.setZoom(0.01); expect(camera.zoom).toBe(0.5);
        expect(foot).toEqual({ x: 1024, y: 528 });
        expect(() => controller.setZoom(NaN)).toThrow(); expect(camera.zoom).toBe(0.5);
    });
    it.each([[568, 320], [844, 390], [1024, 600], [1280, 720], [390, 844]])('resizes native viewport %s × %s', (width, height) => {
        const { scale, camera, foot } = fixture();
        scale.emit('resize', { width, height });
        expect([camera.width, camera.height]).toEqual([width, height]);
        expect(camera.centerOn).toHaveBeenLastCalledWith(foot.x, foot.y);
        expect(camera.setBounds).toHaveBeenLastCalledWith(0, 0, 2048, 1024);
    });
    it('ignores transient zero-size layout', () => {
        const { scale, camera } = fixture(); scale.emit('resize', { width: 0, height: 0 });
        expect(camera.width).toBe(844);
    });
    it('zooms only canvas wheel, leaving browser pinch shortcuts available', () => {
        const { canvas, camera } = fixture(); const preventDefault = vi.fn();
        canvas.emit('wheel', { deltaY: -1, preventDefault }); expect(camera.zoom).toBeCloseTo(1.8);
        canvas.emit('wheel', { deltaY: 1, preventDefault }); expect(camera.zoom).toBeCloseTo(1.5);
        canvas.emit('wheel', { deltaY: 1, ctrlKey: true, preventDefault }); expect(camera.zoom).toBeCloseTo(1.5);
        expect(preventDefault).toHaveBeenCalledTimes(2);
    });
    it('accepts a second touch pointer without relying on synthesized click or double zoom', () => {
        const { controller, camera } = fixture();
        const button = { getAttribute: () => 'Zoom in' };
        const event = { pointerId: 2, button: 0, target: { closest: () => button }, preventDefault: vi.fn() };
        controller.root.emit('pointerdown', event);
        expect(camera.zoom).toBeCloseTo(1.8);
        controller.root.emit('click', { ...event, detail: 1 });
        expect(camera.zoom).toBeCloseTo(1.8);
        controller.root.emit('click', { ...event, detail: 0 });
        expect(camera.zoom).toBeCloseTo(2.16);
    });
    it('restarts without duplicate scale, wheel or lifecycle listeners', () => {
        const f = fixture();
        for (let n = 0; n < 4; n++) {
            f.events.emit('shutdown'); f.controller.destroy();
            expect(f.scale.count('resize')).toBe(0); expect(f.canvas.count('wheel')).toBe(0);
            expect(f.parent.children).toHaveLength(0);
            f.controller = new CameraController(f.scene, f.foot, mapWorldBounds(MAP_ORIGIN), f.parent);
            expect(f.scale.count('resize')).toBe(1); expect(f.canvas.count('wheel')).toBe(1);
            expect(f.events.count('shutdown')).toBe(1);
        }
        f.events.emit('destroy'); expect(f.parent.children).toHaveLength(0);
    });
});
