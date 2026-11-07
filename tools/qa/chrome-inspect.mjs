import { connectChrome, inspectProductionGame } from './chrome-cdp.mjs';
const cdp = await connectChrome();
try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.bringToFront');
    await inspectProductionGame(cdp);
    console.log(JSON.stringify({ version: cdp.version, environment: await cdp.evaluate(`({ua:navigator.userAgent,
        viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},focus:document.hasFocus(),hidden:document.hidden,
        hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,
        game:__qaGame.scene.getScene('Game').children.list.length})`) }, null, 2));
} finally { cdp.close(); }
