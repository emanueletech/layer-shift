// Plays all 8 jobs headlessly: clean play everywhere except a sloppy job 2. Saves screenshots and fails on JS errors.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = join('dist', req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(8124);

mkdirSync('test/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `test/shots/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:8124/');
await wait(1800);
await shot('01-title');
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ShiftRight');
await wait(60);
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ShiftRight');
await wait(900);

// Reads what shift is needed for the current layer: compare ghost row with the target row.
const needed = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  if (!s || !s.sys.isActive() || s.phase !== 'align') return null;
  const cur = s.current, tgt = s.target[s.r];
  const fi = (a) => a.indexOf(true);
  return { d: fi(tgt) - fi(cur), r: s.r, job: s.levelIndex, jolt: s.joltPending(), plate: s.plateOffset };
});
const tap = async (code) => { await page.keyboard.down(code); await wait(30); await page.keyboard.up(code); await wait(40); };
const chord = async () => {
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ShiftRight'); await wait(40);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ShiftRight');
};
const resultsUp = () => page.evaluate(() => window.__game.scene.getScene('results').sys.isActive());
let jolts = 0;

async function playJob(sloppy, tag) {
  let lastR = -1;
  for (let guard = 0; guard < 600; guard++) {
    let n = await needed();
    if (!n) { if (await resultsUp()) return; await wait(60); continue; }
    if (n.r === lastR) { await wait(60); continue; }
    // a plate shift is due on this layer: wait for it, like a player who reads the blueprint
    while (n && n.jolt) { await wait(40); n = await needed(); }
    if (!n) continue;
    if (n.plate) jolts++;
    let d = n.d;
    if (sloppy && n.r % 3 === 1) d += 2;     // deliberately misalign some layers
    for (let i = 0; i < Math.abs(d); i++) await tap(d < 0 ? 'ShiftLeft' : 'ShiftRight');
    if (n.r === 4) await shot(`${tag}-midprint`);
    lastR = n.r;
    await wait(150);   // a tap right before the chord would count as half of it
    await chord();
    await wait(100);
  }
  throw new Error('job did not finish');
}

const results = [];
const JOBS = await page.evaluate(() => window.__game.scene.getScene('game').sys.settings && 8);
for (let job = 0; job < JOBS; job++) {
  const tag = `j${job + 1}`;
  await playJob(job === 1, tag);
  await wait(2600);
  await shot(`${tag}-results`);
  results.push(await page.evaluate(() => window.__gameState));
  if (job === JOBS - 1) { await wait(1500); await shot('liftoff'); break; }
  await chord();
  await wait(900);
}
await browser.close(); server.close();
results.forEach((r, i) => console.log(`job${i + 1}`, JSON.stringify(r)));
const perfectJobs = results.filter((r, i) => i !== 1 && r.stars === 3).length;
console.log('plate-shifted layers seen:', jolts, '· 3-star jobs (clean bot):', perfectJobs, '/', JOBS - 1);
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
if (perfectJobs !== JOBS - 1) { console.error('the clean bot should 3-star every job'); process.exit(1); }
// night clock: clean layers take 4 min, the sloppy job 2 pays 10 min per botched layer, and the
// whole night still ends before sunrise (06:00 = 480 min after 22:00)
const last = results[JOBS - 1];
console.log('clocked out at', last.clock, `(${last.night} min)`);
if (!last.beforeDawn || last.clock >= '06:00' || results[1].night <= results[0].night + 11 * 4) { console.error('night clock is off'); process.exit(1); }
console.log('PLAY OK');
