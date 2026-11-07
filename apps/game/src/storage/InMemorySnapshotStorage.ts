import type { SnapshotStorage } from '../core/gameStatePersistence';

/** Per-instance strings: no shared singleton or caller-owned object references. */
export class InMemorySnapshotStorage implements SnapshotStorage {
    private readonly values = new Map<string, string>();
    async read(key: string) { return this.values.get(key) ?? null; }
    async write(key: string, value: string) { this.values.set(key, value); }
    async remove(key: string) { this.values.delete(key); }
}
