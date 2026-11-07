import { describe, expect, it } from 'vitest';
import { JSON_LIMITS, parseBoundedJson } from './boundedJson';

const rejected = (text: string, code: string) => {
    const result = parseBoundedJson(text);
    expect(result).toMatchObject({ ok: false, code });
    if (result.ok) throw new Error('Expected rejection');
    expect(Number.isInteger(result.offset)).toBe(true);
    expect(Object.keys(result).sort()).toEqual(['code', 'offset', 'ok']); // No unbounded path/source dump.
};
describe('bounded strict JSON gate (T16, T27, T29-T36 pure)', () => {
    it.each(['null', 'true', 'false', '0', '-0', '1.0', '1e3', '10e-1', '-9007199254740991', '9007199254740991', '0e308'])('matches JSON values without rounding: %s', text => {
        const result = parseBoundedJson(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual(JSON.parse(text));
    });
    it.each(['9007199254740993', '9007199254740991.1', '1.0000000000000001', '1e-308', '1.5', '-9007199254740992'])('rejects inexact/unsafe decimal %s', text => rejected(text, 'invalid-json-number'));
    it.each(['', ' ', '\uFEFF{}', '[1,]', '{"a":0,}', '{a:1}', '01', '+1', '.1', '1.', '1e', '--1', 'NaN', 'Infinity', '{} false', '/*x*/{}', '"\\x41"', '"\\u000x"', '"\n"', '"unterminated', '{', '[', '{"a" 0}', '[0 1]'])('rejects strict grammar violation %j', text => rejected(text, 'malformed-json'));
    it.each(['{"a":1,"a":1}', '{"a":0,"\\u0061":1}', '{"a":{"b":0,"b":1}}', '[{"a":0,"a":1}]', '{"😀":0,"\\ud83d\\ude00":1}', '{"\\\\":0,"\\u005c":1}', String.raw`{"\"":0,"\u0022":1}`])('rejects decoded duplicates %s', text => rejected(text, 'duplicate-json-key'));
    it('keeps per-object sets and does not normalize case or Unicode', () => {
        expect(parseBoundedJson('[{"a":0},{"a":1}]').ok).toBe(true);
        expect(parseBoundedJson('{"a":0,"A":1,"é":2,"e\\u0301":3}').ok).toBe(true);
    });
    it('treats prototype-like names as own data, never changes prototypes', () => {
        const result = parseBoundedJson('{"__proto__":{"polluted":true},"constructor":0}');
        if (!result.ok) throw new Error('Expected data');
        expect(Object.getPrototypeOf(result.value)).toBe(null);
        expect(Object.prototype).not.toHaveProperty('polluted');
        rejected('{"__proto__":0,"__proto__":1}', 'duplicate-json-key');
    });
    it('preserves exact source formatting and escaped/lone surrogate code units', () => {
        const source = ' \r\n ' + String.raw`{"x":"\ud800\n\t\b\f\r\/\\\"","n":1.0}` + ' \n';
        const result = parseBoundedJson(source);
        if (!result.ok) throw new Error('Expected parsed source');
        expect(result.source).toBe(source); expect(result.value).toEqual(JSON.parse(source));
    });
    it('enforces inclusive input length before parsing', () => {
        const text = '0' + ' '.repeat(JSON_LIMITS.input - 1);
        expect(parseBoundedJson(text).ok).toBe(true);
        rejected(text + ' ', 'parse-limit-exceeded');
    });
    it('bounds mixed object/array nesting independently of schema', () => {
        expect(parseBoundedJson('['.repeat(16) + '0' + ']'.repeat(16)).ok).toBe(true);
        rejected('['.repeat(17) + '0' + ']'.repeat(17), 'parse-limit-exceeded');
        rejected('{"a":'.repeat(17) + '0' + '}'.repeat(17), 'parse-limit-exceeded');
    });
    it('bounds decoded names incrementally, including escape-heavy strings', () => {
        expect(parseBoundedJson(`{"${'a'.repeat(128)}":0}`).ok).toBe(true);
        rejected(`{"${'a'.repeat(129)}":0}`, 'parse-limit-exceeded');
        expect(parseBoundedJson(`"${'\\u0061'.repeat(1024)}"`).ok).toBe(true);
        rejected(`"${'\\u0061'.repeat(1025)}"`, 'parse-limit-exceeded');
    });
    it('bounds each object and array, not just the total document', () => {
        const object = (count: number) => '{' + Array.from({ length: count }, (_, i) => `"k${i}":0`).join(',') + '}';
        expect(parseBoundedJson(object(64)).ok).toBe(true); rejected(object(65), 'parse-limit-exceeded');
        expect(parseBoundedJson(JSON.stringify(Array(1000).fill(0))).ok).toBe(true);
        rejected(JSON.stringify(Array(1001).fill(0)), 'parse-limit-exceeded');
    });
    it('bounds numeric lexemes and exponents before conversion, even for zero', () => {
        expect(parseBoundedJson('0.' + '0'.repeat(126)).ok).toBe(true);
        rejected('0.' + '0'.repeat(127), 'parse-limit-exceeded');
        for (const text of ['0e309', '0e-309', '1e-324', '0e999999999', '1e309']) rejected(text, 'parse-limit-exceeded');
        expect(parseBoundedJson('0e-308').ok).toBe(true);
    });
    it('accepts exactly 16384 nodes / 32767 tokens, then fails the next node', () => {
        // root + 17 child arrays + 16366 primitive entries; all arrays <=1000.
        const rows = Array.from({ length: 17 }, (_, i) => Array(i < 16 ? 1000 : 366).fill(0));
        const result = parseBoundedJson(JSON.stringify(rows));
        expect(result).toMatchObject({ ok: true, metrics: { nodes: 16384, tokens: 32767 } });
        rows[16].push(0); rejected(JSON.stringify(rows), 'parse-limit-exceeded');
    });
    it('enforces token budget independently of node budget', () => {
        // 126 full 64-member objects, one 63-member object and an empty array:
        // Empty arrays contribute two tokens; final scalar gives exactly 32768.
        const rows: unknown[] = Array.from({ length: 127 }, (_, i) => Object.fromEntries(Array.from({ length: i < 126 ? 64 : 63 }, (_, j) => [`k${j}`, 0])));
        rows.push([]); rows.push(0);
        const result = parseBoundedJson(JSON.stringify(rows));
        expect(result).toMatchObject({ ok: true, metrics: { tokens: 32768 } });
        rows[rows.length - 1] = []; // 32769 tokens, still well below node budget.
        rejected(JSON.stringify(rows), 'parse-limit-exceeded');
    });
    it('bounds deeply nested long diagnostic names without returning paths', () => {
        const text = ('{"' + 'x'.repeat(128) + '":').repeat(16) + '1.5' + '}'.repeat(16);
        rejected(text, 'invalid-json-number');
    });
    it.each([
        ['{"a":1,"a":2}', 'duplicate-json-key', 10],
        ['[0,]', 'malformed-json', 3], ['01', 'malformed-json', 1],
        ['[1.5]', 'invalid-json-number', 4], ['"\\x"', 'malformed-json', 3],
        ['['.repeat(17) + '0' + ']'.repeat(17), 'parse-limit-exceeded', 16],
    ])('reports exact first fatal offset for %s', (source, code, offset) => {
        expect(parseBoundedJson(source as string)).toEqual({ ok: false, code, offset });
    });
    it('accepts mixed containers at depth 16 and rejects the next container at its opening offset', () => {
        const prefix = '{"k":['.repeat(8), suffix = ']}'.repeat(8);
        expect(parseBoundedJson(prefix + '0' + suffix)).toMatchObject({ ok: true, metrics: { maxDepth: 16 } });
        expect(parseBoundedJson(prefix + '[0]' + suffix)).toEqual({ ok: false, code: 'parse-limit-exceeded', offset: prefix.length });
    });
    it('counts escaped decoded key length and surrogate pairs in UTF-16 code units', () => {
        for (const key of ['\\u0061'.repeat(128), '\\ud83d\\ude00'.repeat(64)]) {
            expect(parseBoundedJson(`{"${key}":0}`).ok).toBe(true);
            rejected(`{"${key}a":0}`, 'parse-limit-exceeded');
        }
    });
    it('replays seeded valid documents against native JSON parsing', () => {
        let seed = 73;
        for (let i = 0; i < 200; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const text = JSON.stringify({ i, values: [null, seed, String.fromCharCode(seed % 65536), true, { nested: -i }] });
            const result = parseBoundedJson(text);
            expect(result).toMatchObject({ ok: true, value: JSON.parse(text) });
        }
    });
    it('records local worst-budget accepted/late-rejected scan observations without a timing guarantee', () => {
        const rows: unknown[] = Array.from({ length: 127 }, (_, i) => Object.fromEntries(Array.from({ length: i < 126 ? 64 : 63 }, (_, j) => [`k${j}`, 0])));
        rows.push([], 0);
        const accepted = JSON.stringify(rows).padEnd(JSON_LIMITS.input, ' ');
        const rejected = accepted.slice(0, -1) + '!';
        // Optional Node diagnostic only; no Node typings/dependency in the app.
        const runtime = globalThis as typeof globalThis & { process?: { memoryUsage(): { heapUsed: number } } };
        const before = runtime.process?.memoryUsage().heapUsed, samples: number[] = [];
        for (let i = 0; i < 20; i++) {
            const start = performance.now();
            const result = parseBoundedJson(i % 2 ? rejected : accepted);
            samples.push(performance.now() - start);
            expect(result.ok).toBe(i % 2 === 0);
        }
        const after = runtime.process?.memoryUsage().heapUsed;
        const delta = before === undefined || after === undefined ? null : after - before;
        samples.sort((a, b) => a - b);
        console.info('Bounded JSON local observation (20 mixed scans; heap delta is GC-sensitive, not peak allocation/leak):',
            JSON.stringify({ inputCodeUnits: accepted.length, meanMs: samples.reduce((a, b) => a + b) / samples.length,
                p95Ms: samples[18], heapDeltaBytes: delta }));
    });
});
