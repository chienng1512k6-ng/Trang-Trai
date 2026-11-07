/** Dependency-free CDP connection to an explicitly launched, isolated QA Chrome. */
export async function connectChrome(port = 9223) {
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    if (!version.Browser.startsWith('Chrome/')) throw new Error('Expected standalone Google Chrome');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:8082/'));
    if (!target) throw new Error('Production preview tab not found');
    const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), listeners = new Map();
    let id = 0;
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const job = pending.get(message.id); if (!job) return;
            clearTimeout(job.timer); pending.delete(message.id);
            if (message.error) job.reject(new Error(JSON.stringify(message.error))); else job.resolve(message.result);
        } else for (const fn of listeners.get(message.method) ?? []) fn(message.params);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const call = ++id;
        const timer = setTimeout(() => { pending.delete(call); reject(new Error('CDP timeout: ' + method)); }, 10000);
        pending.set(call, { resolve, reject, timer }); ws.send(JSON.stringify({ id: call, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    return { version, send, evaluate, on(method, fn) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); }, close() { ws.close(); } };
}

/** Inspect Phaser's existing canvas listener closure through DevTools only.
 * Does not add a production export, change its build or alter actor state. */
export async function inspectProductionGame(cdp) {
    const canvas = await cdp.send('Runtime.evaluate', { expression: "document.querySelector('canvas')", objectGroup: 'fds012-qa' });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: canvas.result.objectId });
    if (process.argv.includes('--debug')) console.log('Canvas listeners:', listeners.map(l => ({ type: l.type, handler: l.handler, original: l.originalHandler })));
    for (const listener of listeners.filter(l => ['touchstart', 'mousedown'].includes(l.type))) {
        const handler = listener.originalHandler ?? listener.handler;
        if (!handler?.objectId) continue;
        const properties = await cdp.send('Runtime.getProperties', { objectId: handler.objectId });
        const scopes = properties.internalProperties?.find(p => p.name === '[[Scopes]]')?.value?.objectId;
        if (!scopes) continue;
        const scopeList = await cdp.send('Runtime.getProperties', { objectId: scopes });
        if (process.argv.includes('--debug')) console.log('Scopes:', scopeList.result);
        for (const scope of scopeList.result.slice(0, 3)) {
            if (!scope.value?.objectId || !scope.value.description?.startsWith('Closure')) continue;
            const variables = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId });
            for (const variable of variables.result) {
                if (!variable.value?.objectId) continue;
                const found = await cdp.send('Runtime.callFunctionOn', { objectId: variable.value.objectId,
                    functionDeclaration: "function(){const g=this.game??this.manager?.game;if(g?.scene?.getScene&&g.canvas===document.querySelector('canvas')){globalThis.__qaGame=g;return true}return false}", returnByValue: true });
                if (found.result?.value) {
                    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'fds012-qa' });
                    return;
                }
            }
        }
    }
    throw new Error('Cannot inspect existing Phaser Game; no production benchmark started');
}
