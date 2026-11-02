// Pause menu: the layer timer freezes while paused, R restarts the job, Esc resumes.
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
}).listen(8127);
mkdirSync('test/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const game = () => page.evaluate(() => { const s = window.__game.scene.getScene('game'); return { active: s.sys.isActive(), paused: !!s.paused, t: s.timeLeft, r: s.r, phase: s.phase }; });
const ready = () => page.waitForFunction(() => { const s = window.__game.scene.getScene('game'); return s.sys.isActive() && s.phase === 'align' && s.current; }, null, { timeout: 20000 });
await page.goto('http://localhost:8127/');
await wait(1500);
await page.keyboard.press('Enter');
await ready();
// play one layer so restart has something to reset
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ShiftRight'); await wait(30);
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ShiftRight');
await page.waitForFunction(() => { const s = window.__game.scene.getScene('game'); return s.r === 1 && s.phase === 'align'; }, null, { timeout: 20000 });
await page.keyboard.press('KeyP');
await wait(200);
const a = await game();
await wait(1200);
const b = await game();
await page.screenshot({ path: 'test/shots/pause.png' });
await page.keyboard.press('Escape');
await wait(300);
const c = await game();
await page.keyboard.press('KeyP'); await wait(150);
await page.keyboard.press('KeyR');
await ready();
const d = await game();
await browser.close(); server.close();
console.log(JSON.stringify({ a, b, c, d }));
const ok = a.paused && b.paused && Math.abs(a.t - b.t) < 0.01 && !c.paused && d.r === 0 && !d.paused && !errors.length;
if (errors.length) console.error(errors.join('\n'));
console.log(ok ? 'PAUSE OK' : 'PAUSE FAIL');
process.exit(ok ? 0 : 1);
