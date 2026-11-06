/** One activation per press; release preserves a tap until the next sample. */
export class PressLatch {
    private held = false;
    private pending = false;
    down(repeat = false) { if (repeat) return; if (!this.held) this.pending = true; this.held = true; }
    up() { this.held = false; }
    consume() { const result = this.pending; this.pending = false; return result; }
    reset() { this.held = false; this.pending = false; }
}
