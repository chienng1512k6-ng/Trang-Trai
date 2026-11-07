import { SnapshotStorageError, type SnapshotStorage } from '../core/gameStatePersistence';

/** Structural interface: native localStorage or a mock, without DOM type imports. */
export interface LocalStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/** Inject () => window.localStorage at explicit composition time, NOT on import.
 * Even acquiring the native storage property can throw SecurityError. */
export class BrowserLocalStorageAdapter implements SnapshotStorage {
    constructor(private readonly getStorage: () => LocalStorageLike) {}
    private async access<T>(operation: (storage: LocalStorageLike) => T): Promise<T> {
        try { return operation(this.getStorage()); }
        catch (error) {
            const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
            throw new SnapshotStorageError(name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
                ? 'quota-exceeded' : 'storage-unavailable');
        }
    }
    read(key: string) { return this.access(storage => storage.getItem(key)); }
    write(key: string, value: string) { return this.access(storage => storage.setItem(key, value)); }
    remove(key: string) { return this.access(storage => storage.removeItem(key)); }
}
