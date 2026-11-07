/** New snapshot boundary only. Legacy JSON codecs deliberately remain unchanged. */
export const JSON_LIMITS = Object.freeze({ input: 262144, depth: 16, tokens: 32768, nodes: 16384,
    members: 64, elements: 1000, key: 128, string: 1024, number: 128, exponent: 308, path: 256 });
export type JsonErrorCode = 'malformed-json' | 'duplicate-json-key' | 'parse-limit-exceeded' | 'invalid-json-number';
export interface JsonFailure { readonly ok: false; readonly code: JsonErrorCode; readonly offset: number }
export interface JsonMetrics { readonly tokens: number; readonly nodes: number; readonly maxDepth: number }
export type BoundedJsonResult = { readonly ok: true; readonly value: unknown; readonly source: string;
    readonly metrics: JsonMetrics } | JsonFailure;
type Frame = { kind: 'object'; value: Record<string, unknown>; keys: Set<string>;
    phase: 'first' | 'key' | 'colon' | 'value' | 'comma'; key: string; count: number }
    | { kind: 'array'; value: unknown[]; phase: 'first' | 'value' | 'comma'; count: number };
class ParseFailure { constructor(readonly code: JsonErrorCode, readonly offset: number) {} }

/** Exact decimal arithmetic on bounded digit strings, before any Number rounding.
 * Never constructs powers/BigInts; exponent and lexeme have already been bounded. */
function exactInteger(text: string): boolean {
    const [mantissa, exponentText = '0'] = text.toLowerCase().split('e');
    const unsigned = mantissa.replace(/^-/, '');
    const dot = unsigned.indexOf('.');
    let digits = unsigned.replace('.', '').replace(/^0+/, '');
    if (!digits) return true;
    let scale = Number(exponentText) - (dot < 0 ? 0 : unsigned.length - dot - 1);
    if (scale < 0) {
        const discard = -scale;
        if (discard > digits.length || !/^0*$/.test(digits.slice(-discard))) return false;
        digits = digits.slice(0, -discard); scale = 0;
    }
    if (digits.length + scale > 16) return false;
    digits += '0'.repeat(scale);
    return digits.length < 16 || digits <= '9007199254740991';
}

/** Explicit stack; null-prototype objects; first fatal code/offset only (no paths
 * or source dumps). Input is retained exactly, including UTF-16 lone surrogates. */
export function parseBoundedJson(source: string): BoundedJsonResult {
    let at = 0, tokens = 0, nodes = 0, maxDepth = 0;
    const stack: Frame[] = [];
    const fail = (code: JsonErrorCode): never => { throw new ParseFailure(code, at); };
    const limit = (valid: boolean) => { if (!valid) fail('parse-limit-exceeded'); };
    const syntax = (): never => fail('malformed-json');
    const token = () => { limit(++tokens <= JSON_LIMITS.tokens); };
    const whitespace = () => { while (at < source.length && /[\x20\t\r\n]/.test(source[at])) at++; };
    const digit = () => at < source.length && source[at] >= '0' && source[at] <= '9';
    const punctuation = (char: string) => { if (source[at] !== char) syntax(); token(); at++; };
    function string(max: number): string {
        punctuation('"');
        let result = '';
        // The opening quote is the string token, not a separate punctuation token.
        while (at < source.length) {
            let char = source[at++];
            if (char === '"') return result;
            if (char.charCodeAt(0) < 32) syntax();
            if (char === '\\') {
                if (at >= source.length) syntax();
                char = source[at++];
                if (char === 'u') {
                    const hex = source.slice(at, at + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) syntax();
                    char = String.fromCharCode(parseInt(hex, 16)); at += 4;
                } else {
                    const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
                    if (!Object.prototype.hasOwnProperty.call(escapes, char)) syntax();
                    char = escapes[char];
                }
            }
            limit(result.length < max); result += char;
        }
        return syntax();
    }
    function number(): number {
        const start = at;
        const consume = () => { at++; limit(at - start <= JSON_LIMITS.number); };
        if (source[at] === '-') consume();
        if (source[at] === '0') consume();
        else {
            if (!digit() || source[at] === '0') syntax();
            while (digit()) consume();
        }
        if (source[at] === '.') { consume(); if (!digit()) syntax(); while (digit()) consume(); }
        if (source[at] === 'e' || source[at] === 'E') {
            consume(); if (source[at] === '+' || source[at] === '-') consume();
            if (!digit()) syntax();
            let exponent = 0;
            while (digit()) { exponent = exponent * 10 + Number(source[at]); consume(); limit(exponent <= JSON_LIMITS.exponent); }
        }
        const text = source.slice(start, at);
        if (!exactInteger(text)) fail('invalid-json-number');
        const value = Number(text);
        if (!Number.isSafeInteger(value)) fail('invalid-json-number');
        return value;
    }
    function value(): unknown {
        whitespace(); limit(++nodes <= JSON_LIMITS.nodes);
        const char = source[at];
        if (char === '{' || char === '[') {
            limit(stack.length < JSON_LIMITS.depth); token(); at++;
            const frame: Frame = char === '{'
                ? { kind: 'object', value: Object.create(null) as Record<string, unknown>, keys: new Set(), phase: 'first', key: '', count: 0 }
                : { kind: 'array', value: [], phase: 'first', count: 0 };
            stack.push(frame); maxDepth = Math.max(maxDepth, stack.length); return frame.value;
        }
        if (char === '"') return string(JSON_LIMITS.string);
        token();
        if (char === '-' || digit()) return number();
        for (const [text, literal] of [['true', true], ['false', false], ['null', null]] as const) {
            if (source.startsWith(text, at)) { at += text.length; return literal; }
        }
        return syntax();
    }
    try {
        limit(source.length <= JSON_LIMITS.input);
        const root = value();
        while (stack.length) {
            const frame = stack[stack.length - 1]; whitespace();
            if (frame.kind === 'object') {
                if (frame.phase === 'first' && source[at] === '}') { punctuation('}'); stack.pop(); }
                else if (frame.phase === 'first' || frame.phase === 'key') {
                    limit(++frame.count <= JSON_LIMITS.members);
                    frame.key = string(JSON_LIMITS.key);
                    if (frame.keys.has(frame.key)) fail('duplicate-json-key');
                    frame.keys.add(frame.key); frame.phase = 'colon';
                } else if (frame.phase === 'colon') { punctuation(':'); frame.phase = 'value'; }
                else if (frame.phase === 'value') {
                    frame.phase = 'comma'; frame.value[frame.key] = value();
                } else if (source[at] === '}') { punctuation('}'); stack.pop(); }
                else { punctuation(','); frame.phase = 'key'; }
            } else {
                if ((frame.phase === 'first' || frame.phase === 'comma') && source[at] === ']') { punctuation(']'); stack.pop(); }
                else if (frame.phase === 'comma') { punctuation(','); frame.phase = 'value'; }
                else {
                    limit(++frame.count <= JSON_LIMITS.elements);
                    frame.phase = 'comma'; frame.value.push(value());
                }
            }
        }
        whitespace(); if (at !== source.length) syntax();
        return { ok: true, value: root, source, metrics: { tokens, nodes, maxDepth } };
    } catch (error) {
        if (!(error instanceof ParseFailure)) throw error;
        return { ok: false, code: error.code, offset: error.offset };
    }
}
