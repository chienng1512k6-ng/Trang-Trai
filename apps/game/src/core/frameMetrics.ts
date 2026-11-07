/** Bounded raw timing samples; never use the simulation's capped delta as FPS. */
export class FrameMetrics {
    private values: number[] = [];
    private cursor = 0;
    constructor(readonly capacity = 4096, private readonly allowZero = false) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Invalid sample capacity.');
    }
    add(milliseconds: number) {
        if (!Number.isFinite(milliseconds) || milliseconds < 0 || (!this.allowZero && milliseconds === 0)) return;
        if (this.values.length < this.capacity) this.values.push(milliseconds);
        else { this.values[this.cursor] = milliseconds; this.cursor = (this.cursor + 1) % this.capacity; }
    }
    reset() { this.values = []; this.cursor = 0; }
    snapshot() {
        const sorted = [...this.values].sort((a, b) => a - b), n = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);
        const p95 = n ? sorted[Math.ceil(n * 0.95) - 1] : null;
        return { samples: n, sampledMs: sum, meanMs: n ? sum / n : null,
            p95Ms: p95, meanFPS: sum > 0 ? 1000 * n / sum : null, p5FPS: p95 === null || p95 === 0 ? null : 1000 / p95,
            over33_3ms: sorted.filter(x => x > 33.3).length, over50ms: sorted.filter(x => x > 50).length,
            maxMs: n ? sorted[n - 1] : null };
    }
}
