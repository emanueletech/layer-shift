// Records the README / itch.io media: a gameplay GIF (the rocket job with plate shifts, ending in its lift-off),
// four screenshots and the itch.io cover. Needs ffmpeg and ImageMagick. Run: npm run build && npm run media
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'docs/media', TMP = 'test/shots/video';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = join('dist', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8129);
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: TMP, size: { width: 960, height: 540 } } });
const page = await ctx.newPage();
const t0 = Date.now();
const mark = () => (Date.now() - t0) / 1000;
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const tap = async (code) => { await page.keyboard.down(code); await wait(35); await page.keyboard.up(code); await wait(85); };
const chord = async () => {
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ShiftRight'); await wait(40);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ShiftRight');
};
const layer = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  if (!s.sys.isActive() || s.phase !== 'align') return null;
  const fi = (a) => a.indexOf(true);
  return { r: s.r, d: fi(s.target[s.r]) - fi(s.current), jolt: s.joltPending(), n: s.target.length };
});

// Plays the current job like a quick, readable human. mistakes: layers to misalign on purpose.
async function play({ mistakes = [], shots = {} } = {}) {
  let last = -1;
  for (;;) {
    let n = await layer();
    if (!n) { if (await page.evaluate(() => window.__game.scene.getScene('results').sys.isActive())) return; await wait(30); continue; }
    if (n.r === last) { await wait(30); continue; }
    await wait(110);                                          // read the blueprint
    n = await layer();
    while (n && n.jolt) { await wait(40); n = await layer(); }
    if (!n) continue;
    if (shots[n.r] === 'pre') await shot(shots.name);
    let d = n.d + (mistakes.includes(n.r) ? 1 : 0);
    for (let i = 0; i < Math.abs(d); i++) await tap(d < 0 ? 'ShiftLeft' : 'ShiftRight');
    if (shots[n.r] === 'post') await shot(shots.name);
    last = n.r;
    await wait(140);
    await chord();
  }
}

await page.goto('http://localhost:8129/');
await wait(2400);
await wait(2600);
await shot('title');
await chord();
// job 1, two layers, for the gameplay screenshot
await page.waitForFunction(() => window.__game.scene.getScene('game').sys.isActive() && window.__game.scene.getScene('game').phase === 'align');
await wait(1200);
await shot('gameplay');
// straight to the last job, with the plate slipping on layers 4 and 8
const rocketAt = mark();
await page.evaluate(() => window.__game.scene.getScene('game').scene.start('game', { level: 7 }));
await page.waitForFunction(() => { const s = window.__game.scene.getScene('game'); return s.levelIndex === 7 && s.sys.isActive() && s.phase === 'align'; });
await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.jolts = new Set([4, 8]); });
const joltShot = page.waitForFunction(() => window.__game.scene.getScene('game').joltedAt === 8, null, { timeout: 60000 })
  .then(() => wait(260)).then(() => shot('plate-shift'));
await play({ mistakes: [2] });
const resultsAt = mark();
await joltShot;
// results: stars land by ~1.5 s, the rocket ignites at 2.2 s, climbs from 2.7 s and is gone by ~4.6 s
await wait(Math.max(0, 2000 - (mark() - resultsAt) * 1000));
await shot('results');
await wait(Math.max(0, 3300 - (mark() - resultsAt) * 1000));
await shot('liftoff');      // the rocket mid-climb
await wait(Math.max(0, 6000 - (mark() - resultsAt) * 1000));
const gifEnd = mark();
await ctx.close(); await browser.close(); server.close();

const video = join(TMP, readdirSync(TMP).find((f) => f.endsWith('.webm')));
// The rocket job: printing (plate shifts included) at 1.5x, then the results and the whole lift-off at
// real speed, until the rocket has left the screen. 12 fps, 600 px wide, one shared palette.
const PRINT_SPEED = 1.5, endFrom = resultsAt + 1.3;
const ff = `ffmpeg -y -loglevel error -i ${video} -filter_complex "` +
  `[0:v]trim=${(rocketAt + 0.3).toFixed(2)}:${resultsAt.toFixed(2)},setpts=(PTS-STARTPTS)/${PRINT_SPEED}[a];` +
  `[0:v]trim=${endFrom.toFixed(2)}:${gifEnd.toFixed(2)},setpts=PTS-STARTPTS[b];` +
  `[a][b]concat=n=2:v=1,fps=12,scale=600:-1:flags=lanczos,split[x][y];` +
  `[x]palettegen=max_colors=96:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"`;
execSync(`${ff} ${OUT}/gameplay.gif`, { stdio: 'inherit' });
// itch.io cover: 630x500, from the title screen
execSync(`convert ${OUT}/title.png -crop 630x500+330+20 +repage ${OUT}/cover.png`);
const kb = (f) => (readFileSync(f).length / 1024).toFixed(0) + ' KB';
console.log('gif', kb(`${OUT}/gameplay.gif`), `(${((resultsAt - rocketAt - 0.3) / PRINT_SPEED + gifEnd - endFrom).toFixed(1)} s)`, '· cover', kb(`${OUT}/cover.png`));
console.log('MEDIA OK');
