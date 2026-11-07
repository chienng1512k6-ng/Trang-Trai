import { writeFile, mkdir } from 'node:fs/promises';
import { connectChrome, inspectProductionGame } from './chrome-cdp.mjs';

// Injected via DevTools into the unmodified production page. No simulation stepping.
function installProbe() {
    const game = globalThis.__qaGame, doc = globalThis.document;
    const values = [], windows = [], modes = {}, errors = [], focusEvents = [];
    let last, offset = 0, frames = 0, hiddenFrames = 0, unfocusedFrames = 0;
    const started = performance.now();
    const stats = list => {
        const sorted = [...list].sort((a, b) => a - b), n = sorted.length, ms = sorted.reduce((a, b) => a + b, 0);
        return { samples: n, sampledMs: ms, meanFPS: ms ? n * 1000 / ms : null, meanMs: n ? ms / n : null,
            p95Ms: n ? sorted[Math.ceil(n * .95) - 1] : null, maxMs: n ? sorted[n - 1] : null,
            over33_3ms: sorted.filter(x => x > 33.3).length, over50ms: sorted.filter(x => x > 50).length };
    };
    const state = () => {
        const s = game.scene.getScene('Game'), p = s.data.get('player'), m = s.data.get('monster'), c = s.data.get('combat');
        if (!p || !m || !c) return { restarting: true };
        const colliders = s.data.get('colliders');
        const blocked = point => colliders.some(b => point.col + .18 > b.minCol + 1e-8 && point.col - .18 < b.maxCol - 1e-8
            && point.row + .18 > b.minRow + 1e-8 && point.row - .18 < b.maxRow - 1e-8);
        return { position: p.state.position, slimePosition: m.state.body.position, facing: p.state.facing,
            playerMotion: p.state.motion, monsterMode: m.state.mode, hp: c.state.player.hp, slimeHP: c.state.slime.hp,
            activation: c.state.activation, camera: { zoom: s.cameras.main.zoom, scrollX: s.cameras.main.scrollX,
                scrollY: s.cameras.main.scrollY, followsFeet: s.cameras.main._follow === p.view.sprite },
            playerBlocked: blocked(p.state.position), slimeBlocked: blocked(m.state.body.position),
            colliders, objects: { total: s.children.list.length, slimes: s.children.list.filter(o => o.name === 'green-slime').length,
                obstacles: s.children.list.filter(o => o.name.startsWith('obstacle-')).length },
            listeners: { shutdown: s.events.listenerCount('shutdown'), keyboard: s.input.keyboard.listenerCount('keydown'),
                resize: game.scale.listenerCount('resize'), poststep: game.events.listenerCount('poststep') },
            overlays: Object.fromEntries(['touch-controls','camera-controls','combat-hud','performance-overlay']
                .map(name => [name, doc.querySelectorAll('.' + name).length])) };
    };
    const boundary = event => { last = undefined; focusEvents.push({ type: event.type, elapsedMs: performance.now() - started }); };
    const frame = () => {
        frames++;
        if (doc.hidden) { hiddenFrames++; last = undefined; return; }
        if (!doc.hasFocus()) unfocusedFrames++;
        const now = performance.now(); if (last !== undefined && now > last) values.push(now - last); last = now;
        const s = state(); if (s.restarting) return;
        modes[s.monsterMode] = (modes[s.monsterMode] ?? 0) + 1;
        if ((s.playerBlocked || s.slimeBlocked) && !errors.includes('collider penetration')) errors.push('collider penetration');
        for (const p of [s.position, s.slimePosition]) if ((!Number.isFinite(p.col) || p.col < .18 || p.row < .18 || p.col > 31.82 || p.row > 31.82)
            && !errors.includes('invalid position')) errors.push('invalid position');
    };
    game.events.on('poststep', frame);
    globalThis.addEventListener('blur', boundary); globalThis.addEventListener('focus', boundary); doc.addEventListener('visibilitychange', boundary);
    globalThis.__productionProbe = {
        state, capture() { windows.push({ elapsedMs: performance.now() - started, frames: stats(values.slice(offset)),
            heapBytes: performance.memory?.usedJSHeapSize ?? null, state: state() }); offset = values.length; },
        snapshot(raw = false) { return { elapsedMs: performance.now() - started, frames: stats(values), windows, modes, errors,
            observedPoststeps: frames, hiddenFrames, unfocusedFrames, focusEvents, finalState: state(),
            ...(raw ? { frameIntervalsMs: values } : {}) }; },
        destroy() { game.events.off('poststep', frame); globalThis.removeEventListener('blur', boundary);
            globalThis.removeEventListener('focus', boundary); doc.removeEventListener('visibilitychange', boundary); }
    };
}

const cdp = await connectChrome(), durationMs = 600000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = { build: 'unmodified production build, Vite preview', browser: cdp.version.Browser,
    startedUTC: new Date().toISOString(), completed: false, durationMs, consoleErrors: [], httpErrors: [], networkFailures: [],
    actions: {}, restarts: 0, collisionStops: 0, altTab: 'NOT TESTED: physical OS action unavailable' };
await mkdir('docs/qa', { recursive: true });
const save = () => writeFile('docs/qa/fds012-production-chrome.json', JSON.stringify(record, null, 2) + '\n');
let held = [];
const key = async (code, down) => {
    const vk = { KeyW:87, KeyA:65, KeyS:83, KeyD:68, Space:32 }[code];
    await cdp.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code,
        key: code === 'Space' ? ' ' : code.slice(3).toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
};
const hold = async codes => { for (const old of held) if (!codes.includes(old)) await key(old, false);
    for (const code of codes) if (!held.includes(code)) await key(code, true); held = codes; };
const click = async selector => {
    const rect = await cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    if (!rect) return;
    await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', ...rect, button:'left', clickCount:1 });
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', ...rect, button:'left', clickCount:1 });
};
try {
    await cdp.send('Runtime.enable'); await cdp.send('Network.enable'); await cdp.send('Page.enable');
    cdp.on('Runtime.exceptionThrown', p => record.consoleErrors.push(p.exceptionDetails));
    cdp.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') record.consoleErrors.push(p.args.map(a => a.value ?? a.description)); });
    cdp.on('Network.responseReceived', p => { if (p.response.status >= 400) record.httpErrors.push({ url:p.response.url, status:p.response.status }); });
    cdp.on('Network.loadingFailed', p => record.networkFailures.push(p));
    await cdp.send('Page.reload'); await sleep(1500); await cdp.send('Page.bringToFront');
    await inspectProductionGame(cdp);
    record.environment = await cdp.evaluate(`({ua:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
        hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,focus:document.hasFocus(),hidden:document.hidden})`);
    const firstFrame = await cdp.evaluate('__qaGame.loop.frame');
    await sleep(1500);
    const readiness = await cdp.evaluate('({hidden:document.hidden,focus:document.hasFocus(),frame:__qaGame.loop.frame})');
    record.readiness = { ...readiness, firstFrame };
    if (readiness.hidden || readiness.frame <= firstFrame) {
        record.status = 'NOT TESTED';
        throw new Error('Chrome is not visibly rendering. Bring its real window to the foreground; no benchmark statistics can be reported.');
    }
    await cdp.evaluate('void globalThis.__qaGame.scene.getScene("Game").scene.restart()'); await sleep(300);
    await cdp.evaluate('(' + installProbe.toString() + ')()');
    const started = performance.now(); let phase = -1, lastCapture = 0, lastAttack = 0, previousPosition;
    while (performance.now() - started < durationMs) {
        const elapsed = performance.now() - started, second = elapsed / 1000 % 60;
        const next = second < 10 ? 0 : second < 12 ? 1 : second < 14 ? 2 : second < 32 ? 3 : second < 40 ? 4 : second < 50 ? 5 : second < 55 ? 6 : 7;
        await cdp.send('Page.bringToFront');
        if (next !== phase) { phase = next; await hold([]); record.actions[phase] = (record.actions[phase] ?? 0) + 1;
            if (phase === 7) { await cdp.evaluate('void __qaGame.scene.getScene("Game").scene.restart()'); record.restarts++; await sleep(100); }
        }
        const state = await cdp.evaluate('__productionProbe.state()');
        if (!state.restarting) {
            if (state.hp === 0 && phase >= 4) await click('.combat-recover');
            if (phase === 1) await hold(['KeyD','KeyS']);
            if (phase === 3 && state.slimeHP > 0 && elapsed - lastAttack > 700) {
                const dx = state.slimePosition.col-state.position.col, dy = state.slimePosition.row-state.position.row;
                const face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ['KeyD','KeyS'] : ['KeyA','KeyW']) : (dy > 0 ? ['KeyA','KeyS'] : ['KeyD','KeyW']);
                await hold(face); await sleep(40); await hold([]); await key('Space',true); await key('Space',false); lastAttack = elapsed;
            }
            if (phase === 4) await hold([['KeyW'],['KeyD'],['KeyS'],['KeyA']][Math.floor(second / 2)%4]);
            if (phase === 5) {
                const nearest = [...state.colliders].sort((a,b) => Math.hypot((a.minCol+a.maxCol)/2-state.position.col,(a.minRow+a.maxRow)/2-state.position.row)
                    -Math.hypot((b.minCol+b.maxCol)/2-state.position.col,(b.minRow+b.maxRow)/2-state.position.row))[0];
                const dc=(nearest.minCol+nearest.maxCol)/2-state.position.col, dr=(nearest.minRow+nearest.maxRow)/2-state.position.row;
                const x=(dc-dr)*32,y=(dc+dr)*16, codes=[];
                if(Math.abs(x)>3)codes.push(x>0?'KeyD':'KeyA');if(Math.abs(y)>3)codes.push(y>0?'KeyS':'KeyW');await hold(codes);
                if(previousPosition&&Math.hypot(dc,dr)<1&&Math.hypot(previousPosition.col-state.position.col,previousPosition.row-state.position.row)<.005)record.collisionStops++;
                previousPosition=state.position;
            }
            if (phase === 6) await click(Math.floor(second)%2?'.camera-zoom button:first-child':'.camera-zoom button:last-child');
        }
        if (elapsed - lastCapture >= 30000) { await cdp.evaluate('__productionProbe.capture()'); record.measurement = await cdp.evaluate('__productionProbe.snapshot()'); await save();
            console.log(JSON.stringify({ elapsedSeconds:Math.round(elapsed/1000), fps:record.measurement.frames.meanFPS, errors:record.consoleErrors.length, restarts:record.restarts }));lastCapture=elapsed; }
        await sleep(500);
    }
    await hold([]); await cdp.evaluate('__productionProbe.capture()'); record.measurement = await cdp.evaluate('__productionProbe.snapshot(true)');
    record.completed = record.measurement.elapsedMs >= durationMs && record.measurement.frames.sampledMs >= durationMs - 5000;
    record.status = record.completed ? 'MEASURED: review functional/errors evidence before PASS' : 'INCOMPLETE: insufficient visible frame coverage';
    await save();
    console.log(JSON.stringify({ completed:record.completed, frames:record.measurement.frames, errors:record.consoleErrors.length, restarts:record.restarts }));
} catch (error) { record.failure=String(error); await save(); throw error; }
finally { await hold([]).catch(()=>{}); await cdp.evaluate('globalThis.__productionProbe?.destroy()').catch(()=>{}); cdp.close(); }
