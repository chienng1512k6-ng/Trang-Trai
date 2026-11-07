import { describe, expect, it } from 'vitest';
import { FrameMetrics } from './frameMetrics';
describe('raw performance statistics', () => {
    it('reports no fabricated FPS before samples', () => {
        expect(new FrameMetrics().snapshot()).toMatchObject({ samples: 0, meanFPS: null, p95Ms: null, p5FPS: null });
    });
    it('uses time-weighted FPS, nearest-rank p95 and strict thresholds', () => {
        const m = new FrameMetrics(); for (let n = 0; n < 19; n++) m.add(10); m.add(100);
        expect(m.snapshot()).toMatchObject({ samples: 20, sampledMs: 290, meanMs: 14.5, p95Ms: 10,
            p5FPS: 100, over33_3ms: 1, over50ms: 1, maxMs: 100 });
        expect(m.snapshot().meanFPS).toBeCloseTo(20000 / 290);
    });
    it('bounds storage, resets, and ignores invalid intervals', () => {
        const m = new FrameMetrics(2); [1, 2, 3, 4, NaN, Infinity, 0, -1].forEach(n => m.add(n));
        expect(m.snapshot()).toMatchObject({ samples: 2, meanMs: 3.5 }); m.reset(); expect(m.snapshot().samples).toBe(0);
        expect(() => new FrameMetrics(0)).toThrow();
    });
    it('does not hide long frames behind the simulation delta cap', () => {
        const m = new FrameMetrics(); [33.3, 50, 2000].forEach(n => m.add(n));
        expect(m.snapshot()).toMatchObject({ over33_3ms: 2, over50ms: 1, maxMs: 2000 });
    });
    it('includes zero-duration AI measurements below timer resolution', () => {
        const m = new FrameMetrics(10, true); m.add(0); m.add(0); m.add(0.3);
        expect(m.snapshot().samples).toBe(3); expect(m.snapshot().meanMs).toBeCloseTo(0.1);
    });
});
