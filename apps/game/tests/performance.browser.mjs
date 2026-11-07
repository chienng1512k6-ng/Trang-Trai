/** Real elapsed-time soak. Only inputs/setup are scripted; no manual entity
 * updates, fake frame deltas, FPS override, or accelerated simulation. */
export function startPerformanceSoak(check, { durationMs = 600000, intervalMs = 30000 } = {}) {
    if (!Number.isFinite(durationMs) || !Number.isFinite(intervalMs) || durationMs < 600000 || intervalMs < 1000)
        throw new RangeError('Soak requires finite >=10 minutes and >=1s intervals.');
    if (!check.performanceSnapshot()) throw new Error('Open keyboard.html?perf=1 first.');
    const started = performance.now();
    const result = { startedUTC: new Date().toISOString(), durationMs, intervals: [], errors: [], httpErrors: [],
        scenarios: {}, completed: false, elapsedMs: 0, baseline: check.performanceSnapshot() };
    const persist = () => localStorage.setItem('fds012-soak', JSON.stringify(result));
    let previousPhase = -1, lastInterval = started, busy = false, lastAttack = 0;
    const pageError = event => result.errors.push(String(event.message ?? event.reason));
    const originalError = console.error;
    const consoleError = (...args) => { result.errors.push(args.map(String).join(' ')); originalError.apply(console, args); };
    console.error = consoleError;
    globalThis.addEventListener('error', pageError); globalThis.addEventListener('unhandledrejection', pageError);
    // Resource Timing exposes HTTP failures where supported; network listeners
    // in browser automation additionally capture status codes and request failures.
    const resourceErrors = () => performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400)
        .map(e => ({ name: e.name, status: e.responseStatus }));
    const capture = () => {
        const metrics = check.performanceSnapshot(true);
        const combat = check.combatSnapshot(), monster = check.monsterSnapshot();
        result.intervals.push({ elapsedMs: performance.now() - started, ...metrics,
            state: { monsterMode: monster.mode, playerHP: combat.state.player.hp, slimeHP: combat.state.slime.hp,
                activation: combat.state.activation, playerPosition: combat.player.position, slimePosition: monster.position } });
        if (combat.overlays !== 1 || monster.count !== 1 || combat.player.keyboardListeners !== 1
            || monster.blocked || check.collisionSnapshot().blocked || check.collisionSnapshot().objectCount !== 9) {
            result.errors.push('State/object/input invariant failed at ' + (performance.now() - started));
        }
        persist();
    };
    const cleanup = () => {
        clearInterval(timer); check.holdKeys([]);
        globalThis.removeEventListener('error', pageError); globalThis.removeEventListener('unhandledrejection', pageError);
        if (console.error === consoleError) console.error = originalError;
        result.httpErrors = resourceErrors();
    };
    const stop = () => { cleanup(); result.elapsedMs = performance.now() - started; result.completed = false; persist(); return result; };
    check.performanceSnapshot(true);
    const timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
            const now = performance.now(), elapsed = now - started, second = elapsed / 1000 % 60;
            result.elapsedMs = elapsed;
            if (now - lastInterval >= intervalMs) { capture(); lastInterval = now; }
            if (elapsed >= durationMs) { capture(); cleanup(); result.completed = true; persist(); return; }
            const phase = second < 15 ? 0 : second < 30 ? 1 : second < 40 ? 2 : second < 50 ? 3 : second < 55 ? 4 : 5;
            if (phase !== previousPhase) {
                previousPhase = phase; check.holdKeys([]);
                result.scenarios[phase] = (result.scenarios[phase] ?? 0) + 1;
                if (phase === 0) { check.combatCase('outside'); check.placePlayerForMonster({ col: 4, row: 4 }); }
                if (phase === 1) { check.combatCase('outside'); check.setCameraZoom([0.5, 1.5, 3][Math.floor(elapsed / 60000) % 3]); }
                if (phase === 2) check.combatCase('blocked');
                if (phase === 3) check.combatCase('hit');
                if (phase === 4) check.combatCase('knockout');
                if (phase === 5) await check.restart();
            }
            if (phase === 1) check.holdKeys([['KeyW'], ['KeyD'], ['KeyS'], ['KeyA']][Math.floor(second / 3) % 4]);
            if (phase === 3 && now - lastAttack > 700) {
                if (check.combatSnapshot().state.slime.hp === 0) check.combatCase('hit');
                check.attackOnce(); lastAttack = now;
            }
            if (phase === 4 && second >= 53) globalThis.document.querySelector('.combat-recover')?.click();
        } catch (error) { result.errors.push(String(error)); cleanup(); persist(); }
        finally { busy = false; }
    }, 500);
    return { result, stop };
}
