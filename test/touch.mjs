// Touch controls and the plate shift: taps either side of the printer shift the layer, the DROP button
// and a two-finger tap print it, and a plate shift moves the print and the blueprint together.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = join('dist', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8128);
mkdirSync('test/shots', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const state = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  return { r: s.r, phase: s.phase, cur: s.current.map(Number).join(''), job: s.levelIndex, plate: s.plateOffset };
});
const waitLayer = (r) => page.waitForFunction((r) => { const s = window.__game.scene.getScene('game'); return s.sys.isActive() && s.phase === 'align' && s.r === r && s.current; }, r, { timeout: 20000 });
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

await page.goto('http://localhost:8128/');
await wait(1500);
await page.touchscreen.tap(480, 270);           // start from the title
await waitLayer(0);
// stop the clock so the layer cannot time out under the test
await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.timeLeft = 99; });

const s0 = await state();
await page.touchscreen.tap(120, 300); await wait(250);          // left of the printer
const s1 = await state();
check(s1.cur === s0.cur.slice(1) + '0', `tap left should shift left: ${s0.cur} -> ${s1.cur}`);
await page.touchscreen.tap(800, 300); await wait(250);          // right side (blueprint)
const s2 = await state();
check(s2.cur === s0.cur, `tap right should shift back: ${s2.cur}`);
await page.touchscreen.tap(440, 516); await wait(250);          // right keycap, left of screen centre
const s3 = await state();
check(s3.cur === '0' + s0.cur.slice(0, -1), `right keycap should shift right: ${s3.cur}`);

await page.touchscreen.tap(330, 516);                           // DROP button
await waitLayer(1);
const s4 = await state();
check(s4.r === 1, 'DROP button should print the layer');
await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.timeLeft = 99; });

const b = await state();
await touch('touchStart', [[150, 300], [700, 300]]); await wait(40); await touch('touchEnd', []);   // two fingers
await waitLayer(2);
const s5 = await state();
check(s5.r === 2, 'two-finger tap should print the layer');

// plate shift on job 5
await page.evaluate(() => window.__game.scene.getScene('game').scene.start('game', { level: 4 }));
await page.waitForFunction(() => { const s = window.__game.scene.getScene('game'); return s.sys.isActive() && s.levelIndex === 4 && s.r === 2 && s.phase === 'align'; }, null, { timeout: 30000 }).catch(() => {});
// the bot above may not reach layer 2 by itself: print two layers with DROP if needed
for (let i = 0; i < 2; i++) {
  const st = await state();
  if (st.job === 4 && st.r < 2) { await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.jolts = new Set(); s.drop(); }); await waitLayer(st.r + 1); }
}
const before = await page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  return { tgt: s.target.map((r) => r.map(Number).join('')), cur: s.current.map(Number).join(''), cellX: s.printed[0].find((c) => c)?.img.x };
});
const k = await page.evaluate(() => window.__game.scene.getScene('game').plateShift(1) || window.__game.scene.getScene('game').plateShift(-1));
await wait(400);
await page.screenshot({ path: 'test/shots/plate-shift.png' });
const after = await page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  return { tgt: s.target.map((r) => r.map(Number).join('')), cur: s.current.map(Number).join(''), cellX: s.printed[0].find((c) => c)?.img.x, plate: s.plateOffset };
});
const sh = (row) => (k > 0 ? '0'.repeat(k) + row.slice(0, -k) : row.slice(-k) + '0'.repeat(-k));
check(k !== 0, 'plate shift should happen');
check(after.tgt.every((r, i) => r === sh(before.tgt[i])), 'target should move with the plate');
check(after.cur === before.cur, 'the layer in the nozzle should not move');
check(Math.abs(after.cellX - before.cellX - k * 26) < 0.5, `printed cells should move ${k} columns (${before.cellX} -> ${after.cellX})`);
check(after.plate === k, 'plateOffset should track the slip');

await browser.close(); server.close();
console.log(JSON.stringify({ s0, s1, s2, s3, s4, s5, k }));
if (errors.length) fails.push(...errors);
if (fails.length) { console.error(fails.join('\n')); console.log('TOUCH FAIL'); process.exit(1); }
console.log('TOUCH OK');
