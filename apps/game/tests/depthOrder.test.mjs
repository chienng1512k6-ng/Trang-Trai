import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createDepthComparator, installDepthOrder } from '../src/game/depthOrder';

describe('footpoint depth order', () => {
    const tree = { depth: 400 }, rock = { depth: 400 }, player = { depth: 400 };
    const compare = createDepthComparator(a => a.depth, [tree, rock, player]);
    it.each([[-0.01, -1], [0.01, 1], [0, 1]])('orders player at foot-Y offset %s', (dy, sign) => {
        const actor = { depth: 400 + dy };
        const comparator = createDepthComparator(a => a.depth, [tree, actor]);
        expect(Math.sign(comparator(actor, tree))).toBe(sign);
    });
    it('breaks exact ties deterministically irrespective of previous list order', () => {
        expect([player, tree, rock].sort(compare)).toEqual([tree, rock, player]);
        expect([rock, player, tree].sort(compare)).toEqual([tree, rock, player]);
    });
    it('keeps near-equal Y stable without a non-transitive pairwise epsilon', () => {
        const a = { depth: 400 - 1e-8 }, b = { depth: 400 }, c = { depth: 400 + 1e-8 };
        const comparator = createDepthComparator(o => o.depth, [c, b, a]);
        expect([a, c, b].sort(comparator)).toEqual([c, b, a]);
        expect(comparator(c, b)).toBeLessThan(0);
        expect(comparator(b, a)).toBeLessThan(0);
        expect(comparator(c, a)).toBeLessThan(0);
    });
    it('installs/restores the native comparator without listener accumulation', () => {
        const original = (a, b) => a.depth - b.depth;
        const scene = { children: { sortByDepth: original, queueDepthSort: vi.fn() }, events: new EventEmitter() };
        for (let n = 0; n < 4; n++) {
            installDepthOrder(scene, [tree, rock, player]);
            expect(scene.children.sortByDepth(player, tree)).toBeGreaterThan(0);
            scene.events.emit('shutdown');
            expect(scene.children.sortByDepth).toBe(original);
            expect(scene.events.listenerCount('destroy')).toBe(0);
            expect(scene.events.listenerCount('shutdown')).toBe(0);
        }
    });
});
