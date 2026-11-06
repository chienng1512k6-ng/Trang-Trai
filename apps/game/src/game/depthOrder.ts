import type { Scene } from 'phaser';

/** Subpixel sort buckets suppress floating-point tie jitter. Only the SORT KEY
 * is quantized to 1/1024 pixel; position and public foot-Y depth stay exact.
 * Buckets form a transitive order, unlike a pairwise epsilon comparison. */
export function createDepthComparator<T extends object>(getDepth: (actor: T) => number, actors: readonly T[]) {
    const order = new WeakMap(actors.map((actor, index) => [actor, index + 1]));
    return (a: T, b: T) => Math.round(getDepth(a) * 1024) - Math.round(getDepth(b) * 1024)
        || (order.get(a) ?? 0) - (order.get(b) ?? 0);
}

/** Phaser 4 DisplayList.depthSort delegates to its public sortByDepth method. */
export function installDepthOrder(scene: Scene, actors: readonly Parameters<Scene['children']['sortByDepth']>[0][]) {
    const list = scene.children;
    const original = list.sortByDepth;
    const compare = createDepthComparator((actor: Parameters<typeof original>[0]) =>
        'depth' in actor && typeof actor.depth === 'number' ? actor.depth : 0, actors);
    list.sortByDepth = compare;
    list.queueDepthSort();
    const restore = () => {
        if (list.sortByDepth === compare) list.sortByDepth = original;
        scene.events.off('shutdown', restore);
        scene.events.off('destroy', restore);
    };
    scene.events.once('shutdown', restore);
    scene.events.once('destroy', restore);
}
