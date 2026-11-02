import Phaser from 'phaser';
import { W, H, CW, CH, C, txt, hex } from '../theme.js';
import { COLS, LEVELS, layersOf } from '../levels.js';
import { buildPrinter, PX, BED_Y, GRID_X0, rowY, colX } from '../printer.js';
import { tone, SFX, Music, SONGS, resumeAudio } from '../sfx.js';
import { dust, cameraLook, glitch, lightSweep, hotCell, afterimage, muteToggle } from '../fx.js';
import { shake, floatText } from '../juice.js';
import { LAYER_MIN, MISS_MIN, RETRY_MIN, DAWN, clockText, startOfJob } from '../night.js';

export const CHORD_MS = 110;   // max gap between the two Shift presses that counts as "both"
export const TOUCH_CHORD_MS = 180;   // two fingers rarely land as close together as two keys
const JOLT_AT = 0.45;      // seconds into a layer when a plate shift hits
const JOLT_BONUS = 0.7;    // seconds given back to re-align after it
const BP = { x: 750, cw: 21, ch: 14, top: 168, bottom: 352 };   // blueprint grid area

export default class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  init(data) {
    this.levelIndex = data.level ?? 0;
    this.level = LEVELS[this.levelIndex];
    this.target = layersOf(this.level);
    this.night = startOfJob(this.registry, this.levelIndex, { retry: data.retry, newNight: data.newNight });   // minutes after 22:00
    this.retried = !!data.retry;
    this.r = 0;
    this.phase = 'align';
    this.stats = { good: 0, extra: 0, missing: 0, droop: 0, lost: 0, perfect: 0, combo: 0, bestCombo: 0, jolts: 0 };
    this.printed = [];          // printed[r][c] = { img, kept, good } | null
    this.plateOffset = 0;       // columns the build plate has slipped since the job started
    this.jolts = this.pickJolts();
    this.joltedAt = -1;
  }

  // Layers on which the plate slips: never the first two or the last, at least 3 layers apart.
  pickJolts() {
    const n = this.level.plateShifts || 0, last = this.target.length - 2, out = new Set();
    for (let tries = 0; out.size < n && tries < 200; tries++) {
      const r = Phaser.Math.Between(2, last);
      if ([...out].every((o) => Math.abs(o - r) >= 3)) out.add(r);
    }
    return out;
  }

  create() {
    this.add.image(W / 2, H / 2, 'bg');
    this.printer = buildPrinter(this);
    this.cellLayer = this.add.container(0, 0);
    this.messLayer = this.add.graphics();
    this.children.bringToTop(this.printer.gantry);
    this.children.bringToTop(this.printer.head);

    this.buildHud();
    this.buildBlueprint();
    this.buildKeycaps();
    this.bindInput();

    this.ghost = this.add.container(0, 0);
    this.guide = this.add.container(0, 0);
    this.children.bringToTop(this.printer.gantry);
    this.children.bringToTop(this.printer.head);

    this.music = new Music({ ...SONGS.work, bpm: SONGS.work.bpm + this.levelIndex * 6 });
    this.music.start();
    dust(this, 160, 80, 340, 360);
    cameraLook(this);
    muteToggle(this);
    this.buildPauseButton();
    // pause by itself when the tab or window loses focus
    const autoPause = () => this.pause();
    this.game.events.on('blur', autoPause);
    this.game.events.on('hidden', autoPause);
    this.events.once('shutdown', () => { this.game.events.off('blur', autoPause); this.game.events.off('hidden', autoPause); });
    this.edgeGlow = this.add.image(W / 2, H / 2, 'glow').setDisplaySize(W * 1.6, H * 1.8).setTint(C.green).setBlendMode('ADD').setAlpha(0).setDepth(40);
    SFX.home();
    this.events.once('shutdown', () => this.music.stop());

    this.cameras.main.fadeIn(350, 6, 8, 13);
    this.showBanner();
    this.startLayer();
  }

  // ---------- HUD ----------
  buildHud() {
    txt(this, 24, 18, 'NIGHT SHIFT', 12, C.muted, { spacing: 3 });
    this.clock = txt(this, 22, 32, '22:00', 30, C.greenGlow, { mono: true });
    this.dawnLabel = txt(this, 24, 70, '', 10, C.muted, { spacing: 1, weight: '500' });
    // warm light creeping in from the top as sunrise gets close
    this.sunrise = this.add.image(W / 2, -40, 'glow').setDisplaySize(W * 1.4, 260).setTint(C.amber).setBlendMode('ADD').setAlpha(0).setDepth(-0.5);
    txt(this, PX, 34, this.level.name.toUpperCase(), 14, C.text, { ox: 0.5, spacing: 3 });
    this.layerLabel = txt(this, PX, 52, '', 11, C.muted, { ox: 0.5, spacing: 2, weight: '500' });

    // layer timer bar under the bed
    this.timerBg = this.add.rectangle(PX, BED_Y + 30, COLS * CW, 5, 0x1a2333).setOrigin(0.5);
    this.timerBar = this.add.rectangle(GRID_X0, BED_Y + 30, COLS * CW, 5, C.green).setOrigin(0, 0.5);
  }

  buildBlueprint() {
    const x0 = 585, y0 = 64, w = 330, h = 428;
    const g = this.add.graphics();
    g.fillStyle(C.blueprint, 1).fillRoundedRect(x0, y0, w, h, 14);
    g.lineStyle(1, C.blueprintLine, 0.25);
    for (let x = x0 + 12; x < x0 + w; x += 12) g.lineBetween(x, y0 + 4, x, y0 + h - 4);
    for (let y = y0 + 12; y < y0 + h; y += 12) g.lineBetween(x0 + 4, y, x0 + w - 4, y);
    g.lineStyle(2, C.blueprintLine, 0.9).strokeRoundedRect(x0, y0, w, h, 14);
    g.lineStyle(1, C.blueprintInk, 0.35).strokeRoundedRect(x0 + 8, y0 + 8, w - 16, h - 16, 10);

    const n = this.target.length;
    txt(this, x0 + 24, y0 + 22, `PRINT QUEUE  ${this.levelIndex + 1}/${LEVELS.length}`, 11, C.blueprintInk, { spacing: 3, weight: '500' });
    txt(this, x0 + 24, y0 + 40, this.level.name, 22, C.white);
    txt(this, x0 + 24, y0 + 72, `BLUEPRINT · SIDE SECTION · ${n} LAYERS`, 9, C.blueprintInk, { spacing: 2, weight: '500' }).setAlpha(0.7);

    // target cells
    this.bpCells = this.target.map((row, r) => row.map((on, c) => {
      if (!on) return null;
      return this.add.image(this.bpX(c) + 1, this.bpY(r) + 1, 'cellBp').setOrigin(0).setDisplaySize(BP.cw - 2, BP.ch - 2).setAlpha(0.32);
    }));
    // dimension lines
    const top = this.bpY(n - 1) - 2, bottom = this.bpY(0) + BP.ch + 2;
    g.lineStyle(1, C.blueprintInk, 0.5).lineBetween(this.bpX(0) - 14, top, this.bpX(0) - 14, bottom);
    g.lineStyle(1, C.blueprintInk, 0.5).lineBetween(this.bpX(0), bottom + 8, this.bpX(COLS), bottom + 8);

    this.bpCursor = this.add.rectangle(this.bpX(0) - 4, this.bpY(0) - 1, COLS * BP.cw + 8, BP.ch + 2).setOrigin(0).setStrokeStyle(1.5, C.amber, 1);

    // live stats
    this.accLabel = txt(this, x0 + 24, y0 + h - 124, 'ACCURACY', 10, C.blueprintInk, { spacing: 3, weight: '500' });
    this.accText = txt(this, x0 + 24, y0 + h - 108, '100%', 30, C.white, { mono: true });
    txt(this, x0 + w - 24, y0 + h - 124, 'COMBO', 10, C.blueprintInk, { ox: 1, spacing: 3, weight: '500' });
    this.comboText = txt(this, x0 + w - 24, y0 + h - 108, '×0', 30, C.amber, { ox: 1, mono: true });
    g.lineStyle(1, C.blueprintInk, 0.25).lineBetween(x0 + 24, y0 + h - 58, x0 + w - 24, y0 + h - 58);
    this.hintText = txt(this, x0 + w / 2, y0 + h - 34, this.level.hint, 11, C.blueprintInk, { ox: 0.5, oy: 0.5, weight: '500', align: 'center' }).setAlpha(0.85).setWordWrapWidth(w - 48);
  }

  bpX(c) { return BP.x - (COLS * BP.cw) / 2 + c * BP.cw; }
  // rows are centred vertically in the blueprint area
  bpY(r) { const n = this.target.length; return (BP.top + BP.bottom) / 2 + (n * BP.ch) / 2 - (r + 1) * BP.ch; }

  buildKeycaps() {
    const mk = (x, label, side) => {
      const c = this.add.container(x, 516);
      const bg = this.add.graphics();
      const draw = (on) => {
        bg.clear();
        bg.fillStyle(on ? C.green : 0x1b2332, 1).fillRoundedRect(-46, -14, 92, 28, 7);
        bg.lineStyle(1.5, on ? C.greenGlow : 0x3a475c, 1).strokeRoundedRect(-46, -14, 92, 28, 7);
      };
      draw(false);
      const t = txt(this, 0, 0, label, 12, C.text, { ox: 0.5, oy: 0.5, spacing: 1 });
      c.add([bg, t]);
      c.press = () => { draw(true); t.setColor(hex(0x05200f)); this.tweens.add({ targets: c, y: 518, duration: 50, yoyo: true }); };
      c.release = () => { draw(false); t.setColor(hex(C.text)); };
      // tappable on touch screens (and clickable with a mouse)
      c.setSize(92, 40).setInteractive();
      c.on('pointerdown', (p, lx, ly, e) => { e?.stopPropagation(); if (this.paused) return; p.side = side; this.press(side, p.wasTouch ? TOUCH_CHORD_MS : CHORD_MS); });
      return c;
    };
    this.keyL = mk(PX - 110, '⇧ SHIFT  ⟵', 'left');
    this.keyR = mk(PX + 110, '⟶  SHIFT ⇧', 'right');

    // DROP: the same as both Shifts, as one button for thumbs
    const d = this.add.container(PX, 516);
    const dbg = this.add.graphics();
    const ddraw = (on) => {
      dbg.clear();
      dbg.fillStyle(on ? C.amber : 0x141b27, 1).fillRoundedRect(-38, -14, 76, 28, 7);
      dbg.lineStyle(1.5, on ? C.amber : 0x2c3748, 1).strokeRoundedRect(-38, -14, 76, 28, 7);
    };
    ddraw(false);
    const dt = txt(this, 0, 0, 'DROP ⇧+⇧', 10, C.muted, { ox: 0.5, oy: 0.5, weight: '700', spacing: 1 });
    d.add([dbg, dt]);
    d.setSize(76, 40).setInteractive();
    d.on('pointerdown', (p, lx, ly, e) => {
      e?.stopPropagation();
      if (this.paused || this.phase !== 'align') return;
      resumeAudio();
      ddraw(true); dt.setColor(hex(0x2a1a00));
      this.time.delayedCall(140, () => { ddraw(false); dt.setColor(hex(C.muted)); });
      this.drop();
    });
    this.dropBtn = d;
  }

  // ---------- pause ----------
  buildPauseButton() {
    const b = this.add.container(W - 32, 48).setDepth(50);
    const bg = this.add.graphics();
    const draw = (hover) => {
      bg.clear();
      bg.fillStyle(hover ? 0x26324a : 0x1b2332, 1).fillRoundedRect(-16, -14, 32, 28, 7);
      bg.lineStyle(1.5, hover ? C.greenGlow : 0x3a475c, 1).strokeRoundedRect(-16, -14, 32, 28, 7);
      bg.fillStyle(C.text, 1).fillRoundedRect(-6, -7, 4, 14, 1).fillRoundedRect(2, -7, 4, 14, 1);
    };
    draw(false);
    b.add(bg);
    b.add(txt(this, -24, 0, 'PAUSE · P', 10, C.muted, { ox: 1, oy: 0.5, weight: '500', spacing: 1 }));
    b.setSize(32, 28).setInteractive({ useHandCursor: true });
    b.on('pointerover', () => draw(true));
    b.on('pointerout', () => draw(false));
    b.on('pointerdown', (p, lx, ly, e) => { e?.stopPropagation(); this.togglePause(); });
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  pause() {
    if (this.paused || this.phase === 'done') return;
    this.paused = true;
    this.time.paused = true;
    this.tweens.pauseAll();
    this.music.stop();
    SFX.click();
    this.showPauseMenu();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.music.start();
    this.lastDown = { left: -1e9, right: -1e9 };   // a key pressed in the menu must not start a chord
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    SFX.click();
  }

  restart(level, opts = {}) {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.paused = false;
    this.cameras.main.fadeOut(200, 6, 8, 13);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('game', { level, ...opts }));
  }

  quit() {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.paused = false;
    this.scene.start('title');
  }

  showPauseMenu() {
    const m = this.add.container(0, 0).setDepth(100);
    this.pauseMenu = m;
    m.add(this.add.rectangle(W / 2, H / 2, W, H, 0x03050a, 0.72).setInteractive());   // swallow clicks
    const pw = 340, ph = 330, x0 = W / 2 - pw / 2, y0 = H / 2 - ph / 2;
    const g = this.add.graphics();
    g.fillStyle(C.panel, 0.98).fillRoundedRect(x0, y0, pw, ph, 16);
    g.lineStyle(1.5, C.panelEdge, 1).strokeRoundedRect(x0, y0, pw, ph, 16);
    m.add(g);
    m.add(txt(this, W / 2, y0 + 30, 'PAUSED', 30, C.white, { ox: 0.5, spacing: 4 }));
    m.add(txt(this, W / 2, y0 + 70, `${this.level.name} · layer ${Math.min(this.r + 1, this.target.length)} / ${this.target.length}`, 12, C.muted, { ox: 0.5, weight: '500' }));
    const items = [
      ['RESUME', 'P / ESC', () => this.resume(), true],
      [`RESTART THIS JOB · +${RETRY_MIN} MIN`, 'R', () => this.restart(this.levelIndex, { retry: true })],
      ['RESTART THE NIGHT · 22:00', 'N', () => this.restart(0, { newNight: true })],
      ['QUIT TO TITLE', 'Q', () => this.quit()],
    ];
    items.forEach(([label, key, fn, primary], i) => {
      const y = y0 + 118 + i * 50;
      const b = this.add.container(W / 2, y);
      const bg = this.add.graphics();
      const draw = (hover) => {
        bg.clear();
        bg.fillStyle(primary ? (hover ? C.greenGlow : C.green) : (hover ? 0x26324a : 0x1b2332), 1).fillRoundedRect(-140, -19, 280, 38, 9);
        bg.lineStyle(1.5, primary ? C.greenGlow : (hover ? C.greenGlow : 0x3a475c), 1).strokeRoundedRect(-140, -19, 280, 38, 9);
      };
      draw(false);
      const col = primary ? 0x05200f : C.text;
      b.add([bg, txt(this, -124, 0, label, 13, col, { oy: 0.5, spacing: 1 }), txt(this, 124, 0, key, 11, primary ? 0x05200f : C.muted, { ox: 1, oy: 0.5, mono: true })]);
      b.setSize(280, 38).setInteractive({ useHandCursor: true });
      b.on('pointerover', () => draw(true));
      b.on('pointerout', () => draw(false));
      b.on('pointerdown', (p, lx, ly, e) => { e?.stopPropagation(); fn(); });
      m.add(b);
    });
  }

  // ---------- input ----------
  bindInput() {
    const kb = this.input.keyboard;
    kb.on('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'ShiftLeft' || e.code === 'ArrowLeft' || e.code === 'KeyA') this.press('left');
      else if (e.code === 'ShiftRight' || e.code === 'ArrowRight' || e.code === 'KeyD') this.press('right');
      else if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
      else if (this.paused && e.code === 'KeyR') this.restart(this.levelIndex, { retry: true });
      else if (this.paused && e.code === 'KeyN') this.restart(0, { newNight: true });
      else if (this.paused && e.code === 'KeyQ') this.quit();
    });
    kb.on('keyup', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ArrowLeft' || e.code === 'KeyA') this.release('left');
      else if (e.code === 'ShiftRight' || e.code === 'ArrowRight' || e.code === 'KeyD') this.release('right');
    });
    this.input.addPointer(2);
    // touch: left of the printer centre = left Shift, right of it = right Shift, two fingers at once = drop
    this.input.on('pointerdown', (p) => {
      if (this.paused) return;
      p.side = p.x < PX ? 'left' : 'right';
      this.press(p.side, p.wasTouch ? TOUCH_CHORD_MS : CHORD_MS);
    });
    this.input.on('pointerup', (p) => { if (p.side) this.release(p.side); });
  }

  // Both Shifts = a chord: the second key arriving within CHORD_MS of the first. Timing, not "held"
  // state: macOS and Windows often skip the keyup of one Shift while the other is down, which left a
  // key stuck as held and turned the next single Shift into a drop.
  press(side, chordMs = CHORD_MS) {
    if (this.paused) return;
    resumeAudio();
    const now = this.time.now, other = side === 'left' ? 'right' : 'left';
    this.lastDown = this.lastDown || { left: -1e9, right: -1e9 };
    this.lastDown[side] = now;
    (side === 'left' ? this.keyL : this.keyR).press();
    clearTimeout(this.capTimer?.[side]);
    this.capTimer = this.capTimer || {};
    this.capTimer[side] = setTimeout(() => this.release(side), 160);
    if (now - this.lastDown[other] < chordMs) {
      // the first key of the chord already shifted the layer: undo that shift, then drop
      if (this.undo && now - this.undo.t < chordMs) { this.current = this.undo.row; this.stats.lost = this.undo.lost; this.drawGhost(0); }
      this.undo = null;
      this.lastDown[other] = -1e9;
      this.drop();
      return;
    }
    this.undo = { t: now, row: this.current?.slice(), lost: this.stats.lost };
    this.shift(side === 'left' ? -1 : 1);
  }

  release(side) {
    (side === 'left' ? this.keyL : this.keyR).release();
  }

  // ---------- layer flow ----------
  startLayer() {
    const row = this.target[this.r];
    const first = row.indexOf(true), last = row.lastIndexOf(true);
    const maxL = Math.min(this.level.maxOffset, first), maxR = Math.min(this.level.maxOffset, COLS - 1 - last);
    const options = [];
    for (let o = -maxL; o <= maxR; o++) if (o !== 0) options.push(o);
    const off = options.length ? Phaser.Utils.Array.GetRandom(options) : 0;
    this.current = row.map((_, c) => row[c - off] ?? false);
    this.timeLeft = this.level.layerTime;
    this.phase = 'align';

    const y = rowY(this.r);
    this.tweens.add({ targets: this.printer.head, x: PX, duration: 220, ease: 'Sine.easeInOut' });
    this.printer.placeHead(this.printer.head.x, y);
    this.drawGhost(0);
    this.drawGuide();
    this.layerLabel.setText(`LAYER ${this.r + 1} / ${this.target.length}`);
    this.tweens.add({ targets: this.bpCursor, y: this.bpY(this.r) - 1, duration: 180, ease: 'Sine.easeOut' });
    this.updateClock();
  }

  drawGhost(fromDx) {
    this.ghost.removeAll(true);
    const y = rowY(this.r);
    this.current.forEach((on, c) => {
      if (!on) return;
      const img = this.add.image(colX(c), y, 'ghost').setOrigin(0);
      this.ghost.add(img);
    });
    this.ghost.x = fromDx;
    this.tweens.add({ targets: this.ghost, x: 0, duration: 70, ease: 'Quad.easeOut' });
    this.ghost.alpha = 1;
  }

  drawGuide() {
    this.guide.removeAll(true);
    if (!this.level.guide) return;
    this.target[this.r].forEach((on, c) => {
      if (on) this.guide.add(this.add.image(colX(c), rowY(this.r), 'guide').setOrigin(0));
    });
  }

  shift(dir) {
    if (this.phase !== 'align') return;
    const lostIdx = dir < 0 ? 0 : COLS - 1;
    if (this.current[lostIdx]) {
      this.stats.lost++;
      const gone = this.add.image(colX(lostIdx), rowY(this.r), 'cellBad').setOrigin(0).setAlpha(0.9);
      this.tweens.add({ targets: gone, x: gone.x + (dir < 0 ? -30 : 30), alpha: 0, duration: 260, onComplete: () => gone.destroy() });
      SFX.lost();
    }
    this.current = dir < 0 ? [...this.current.slice(1), false] : [false, ...this.current.slice(0, -1)];
    SFX.shift(dir);
    afterimage(this, this.ghost);
    this.drawGhost(-dir * CW);
    this.tweens.add({ targets: this.printer.head, x: PX + dir * 6, duration: 60, yoyo: true });
  }

  drop() {
    if (this.phase !== 'align') return;
    this.timeLeft = 0;
  }

  update(_, dtMs) {
    if (this.paused) return;
    if (this.phase === 'align') {
      this.timeLeft -= dtMs / 1000;
      const k = Math.max(0, this.timeLeft / this.level.layerTime);
      this.timerBar.width = COLS * CW * k;
      this.timerBar.fillColor = k > 0.5 ? C.green : k > 0.25 ? C.amber : C.red;
      this.ghost.alpha = 0.75 + 0.25 * Math.sin(this.time.now / 120);
      const sec = Math.ceil(this.timeLeft / 0.25);
      if (this.timeLeft < 1 && sec !== this.lastTick) { this.lastTick = sec; SFX.tick(); }
      this.printer.led.setTint(k > 0.25 ? C.greenGlow : C.amber);
      if (this.joltPending() && this.level.layerTime - this.timeLeft >= JOLT_AT) this.plateShift();
      if (this.timeLeft <= 0) this.printLayer();
    }
    this.printer.nozzleGlow.setAlpha(this.phase === 'printing' ? 0.9 : 0.25 + 0.05 * Math.sin(this.time.now / 300));
  }

  // ---------- plate shift ----------
  joltPending() { return this.jolts.has(this.r) && this.joltedAt !== this.r && this.phase === 'align'; }

  // The build plate slips k columns: the part printed so far moves with it, so the rest of the
  // blueprint does too. The layer in the nozzle stays put: the player has to re-align it.
  plateShift(k) {
    this.joltedAt = this.r;
    const cols = [];
    this.target.forEach((row) => row.forEach((on, c) => on && cols.push(c)));
    this.printed.forEach((row) => row?.forEach((cell, c) => cell?.kept && cols.push(c)));
    const lo = Math.min(...cols), hi = Math.max(...cols);
    const fits = (d) => lo + d >= 0 && hi + d <= COLS - 1;
    if (k === undefined) {
      const opts = [-2, -1, 1, 2].filter(fits);
      if (!opts.length) return 0;
      k = Phaser.Utils.Array.GetRandom(opts);
    } else if (!fits(k)) return 0;

    const move = (row, empty) => row.map((_, c) => row[c - k] ?? empty);
    this.target = this.target.map((row) => move(row, false));
    this.printed = this.printed.map((row) => (row ? move(row, null) : row));
    this.bpCells = this.bpCells.map((row) => move(row, null));
    this.plateOffset += k;
    const dx = k * CW, ease = 'Back.easeOut', duration = 140;
    this.printed.forEach((row) => row?.forEach((cell) => {
      if (cell?.kept && cell.img.active) this.tweens.add({ targets: cell.img, x: cell.img.x + dx, duration, ease });
    }));
    this.tweens.add({ targets: this.messLayer, x: this.plateOffset * CW, duration, ease });
    this.tweens.add({ targets: this.printer.pei, x: PX + this.plateOffset * CW, duration, ease });
    this.bpCells.forEach((row) => row.forEach((img) => img && this.tweens.add({ targets: img, x: img.x + k * BP.cw, duration: 200, ease })));
    this.drawGuide();

    this.stats.jolts = (this.stats.jolts || 0) + 1;
    this.timeLeft = Math.min(this.level.layerTime, this.timeLeft + JOLT_BONUS);
    SFX.jolt();
    // a light jolt only: a strong camera shake plus pixelate read like the page zooming while you play
    shake(this, 0.003, 120);
    this.flashLed(C.amber);
    floatText(this, PX, BED_Y - 26, `PLATE SHIFT ${k < 0 ? '⟵' : '⟶'}`, hex(C.amber));
    // the notice takes the hint's place on the blueprint for a moment
    const note = txt(this, this.hintText.x, this.hintText.y, k < 0 ? `⟵  PLATE SLIPPED ${-k}  ·  FOLLOW THE PRINT` : `FOLLOW THE PRINT  ·  PLATE SLIPPED ${k}  ⟶`, 11, C.amber, { ox: 0.5, oy: 0.5, spacing: 1 });
    this.hintText.setVisible(false);
    this.tweens.add({ targets: note, alpha: 0, delay: 1300, duration: 300, onComplete: () => { note.destroy(); this.hintText.setVisible(true); } });
    return k;
  }

  printLayer() {
    this.phase = 'printing';
    this.timerBar.width = 0;
    this.ghost.removeAll(true);
    this.guide.removeAll(true);
    const r = this.r, y = rowY(r);
    const cols = this.current.map((on, c) => (on ? c : -1)).filter((c) => c >= 0);
    this.printed[r] = new Array(COLS).fill(null);
    if (!cols.length) { this.time.delayedCall(200, () => this.evaluate()); return; }

    const dir = r % 2 === 0 ? 1 : -1;                 // serpentine toolpath like a slicer
    const order = dir > 0 ? cols : cols.slice().reverse();
    const stepMs = 260 / order.length;
    const startX = colX(order[0]) + CW / 2;
    this.printer.head.x = startX;
    SFX.sweep(order.length * stepMs / 1000 + 0.1);
    order.forEach((c, i) => {
      this.time.delayedCall(i * stepMs, () => {
        this.printer.head.x = colX(c) + CW / 2 + dir * CW * 0.4;
        const img = this.add.image(colX(c), y, 'cell').setOrigin(0).setScale(0.2, 1);
        this.cellLayer.add(img);
        this.tweens.add({ targets: img, scaleX: 1, duration: 90, ease: 'Quad.easeOut', onComplete: () => hotCell(this, img) });
        this.printed[r][c] = { img, kept: true, good: false };
        if (i % 2 === 0) SFX.extrude((colX(c) - PX) / 200);
        if (Math.random() < 0.25) this.puff(colX(c) + CW / 2, y);
      });
    });
    this.time.delayedCall(order.length * stepMs + 140, () => this.evaluate());
  }

  supported(r, c) {
    if (r === 0) return true;
    for (let k = c - 1; k <= c + 1; k++) if (this.printed[r - 1]?.[k]?.kept) return true;
    return false;
  }

  evaluate() {
    const r = this.r, row = this.printed[r], tgt = this.target[r];
    let good = 0, extra = 0, missing = 0, droop = 0;
    for (let c = 0; c < COLS; c++) {
      const cell = row[c];
      if (cell) {
        if (!this.supported(r, c)) {
          droop++;
          cell.kept = false;
          this.spaghetti(cell.img, r, c);
          if (!tgt[c]) extra++;
        } else if (tgt[c]) {
          good++; cell.good = true;
        } else {
          extra++;
          cell.img.setTexture('cellBad');
          this.tweens.add({ targets: cell.img, alpha: { from: 0.3, to: 1 }, duration: 120, repeat: 2 });
        }
      }
      if (tgt[c] && !(cell && cell.kept)) missing++;
      // blueprint feedback
      const bp = this.bpCells[r][c];
      if (bp) { bp.setTexture(cell && cell.kept && tgt[c] ? 'cellBpDone' : 'cellBpMiss').setDisplaySize(BP.cw - 2, BP.ch - 2).setAlpha(1); }
    }
    const s = this.stats;
    s.good += good; s.extra += extra; s.missing += missing; s.droop += droop;
    const perfect = extra === 0 && missing === 0 && droop === 0;
    this.addTime(LAYER_MIN + (perfect ? 0 : MISS_MIN), !perfect);
    const midX = PX, y = rowY(r) - 18;
    if (perfect) {
      s.perfect++; s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
      floatText(this, midX, y, s.combo > 1 ? `PERFECT ×${s.combo}` : 'PERFECT', hex(C.greenGlow));
      SFX.perfect(s.combo);
      lightSweep(this, GRID_X0, rowY(r), COLS * CW, CH);
      this.flashLed(C.greenGlow);
      if (s.combo >= 3) {
        this.edgeGlow.setAlpha(0.05 + Math.min(s.combo, 10) * 0.012);
        this.tweens.add({ targets: this.edgeGlow, alpha: 0, duration: 700 });
      }
      row.forEach((cell) => cell && this.tweens.add({ targets: cell.img, y: cell.img.y - 3, duration: 80, yoyo: true }));
    } else {
      s.combo = 0;
      floatText(this, midX, y, droop ? 'SPAGHETTI!' : 'LAYER SHIFT!', hex(droop ? C.amber : C.red));
      shake(this, droop ? 0.008 : 0.004, 160);
      if (droop) SFX.spaghetti(); else SFX.error();
      glitch(this, droop ? 3 : 4);
      this.flashLed(C.red);
    }
    this.updateStats();

    this.phase = 'between';
    this.time.delayedCall(perfect ? 260 : 520, () => {
      this.r++;
      if (this.r >= this.target.length) this.finish();
      else this.startLayer();
    });
  }

  // An unsupported cell sags off the nozzle and lands as a tangle of filament.
  spaghetti(img, r, c) {
    const off = this.plateOffset * CW;   // messLayer moves with the plate: draw in its frame
    let landR = r - 1;
    while (landR >= 0 && !this.printed[landR]?.[c]?.kept) landR--;
    const landY = landR >= 0 ? rowY(landR) - 3 : BED_Y - 3;
    this.tweens.add({
      targets: img, y: landY - CH / 2, angle: Phaser.Math.Between(-40, 40), scaleY: 0.5, alpha: 0,
      duration: 420, ease: 'Quad.easeIn',
      onComplete: () => {
        img.destroy();
        const g = this.messLayer;
        const x = colX(c) + CW / 2 - off;
        for (let k = 0; k < 3; k++) {
          g.lineStyle(2, k === 0 ? C.green : C.greenDark, 0.9);
          const curve = new Phaser.Curves.Spline([
            x - 12 + Math.random() * 6, landY,
            x - 4 + Math.random() * 8, landY - 6 - Math.random() * 6,
            x + 4 + Math.random() * 8, landY - Math.random() * 4,
            x + 10 + Math.random() * 6, landY - 4 - Math.random() * 6,
          ]);
          curve.draw(g, 24);
        }
      },
    });
  }

  // small smoke puff from hot plastic
  puff(x, y) {
    const p = this.add.image(x, y, 'glow').setScale(0.12).setTint(0xb8c2d3).setAlpha(0.35);
    this.tweens.add({ targets: p, y: y - 26, scale: 0.4, alpha: 0, duration: 700, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
  }

  flashLed(color) {
    const led = this.printer.led;
    led.setTint(color).setAlpha(0.9);
    this.tweens.add({ targets: led, alpha: 0.35, duration: 450, onComplete: () => led.setTint(C.greenGlow) });
  }

  accuracy() {
    const s = this.stats, denom = s.good + s.missing + s.extra;
    return denom ? s.good / denom : 1;
  }

  updateStats() {
    this.accText.setText(`${Math.round(this.accuracy() * 100)}%`);
    this.comboText.setText(`×${this.stats.combo}`);
    if (this.stats.combo > 1) this.tweens.add({ targets: this.comboText, scale: 1.2, duration: 90, yoyo: true });
  }

  // Time passes per printed layer; a botched layer costs extra and says so next to the clock.
  addTime(min, penalty) {
    const wasDark = this.night < DAWN;
    this.night += min;
    if (penalty) {
      floatText(this, 76, 104, `+${MISS_MIN} MIN`, hex(C.amber));
      this.tweens.add({ targets: this.clock, x: { from: 28, to: 22 }, duration: 240, ease: 'Elastic.easeOut' });
    }
    if (wasDark && this.night >= DAWN) {
      floatText(this, PX, 200, 'SUNRISE: OVERTIME!', hex(C.amber));
      SFX.error();
    }
    this.updateClock();
  }

  updateClock() {
    const n = this.night, left = Math.round(DAWN - n);
    this.clock.setText(clockText(n));
    this.clock.setColor(hex(n >= DAWN ? C.red : left <= 60 ? C.amber : C.greenGlow));
    this.dawnLabel.setText(n >= DAWN ? `OVERTIME +${Math.floor(-left / 60)}:${String(-left % 60).padStart(2, '0')}`
      : `SUNRISE IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this.dawnLabel.setColor(hex(n >= DAWN ? C.red : left <= 60 ? C.amber : C.muted));
    this.sunrise.setAlpha(Phaser.Math.Clamp((n - (DAWN - 120)) / 120, 0, 1) * 0.35);
    if (!this.colonBlink) this.colonBlink = this.time.addEvent({ delay: 500, loop: true, callback: () => {
      this.colonOn = !this.colonOn;
      if (this.phase !== 'done') this.clock.setText(clockText(this.night, !this.colonOn));
    } });
  }

  showBanner() {
    const t = txt(this, PX, 250, `JOB ${this.levelIndex + 1}: ${this.level.name.toUpperCase()}`, 22, C.white, { ox: 0.5, oy: 0.5, spacing: 2 });
    t.setStroke('#000', 6);
    this.tweens.add({ targets: t, alpha: 0, y: 230, delay: 900, duration: 500, onComplete: () => t.destroy() });
  }

  finish() {
    this.phase = 'done';
    this.r = this.target.length;
    this.updateClock();
    this.registry.set('night', this.night);
    this.registry.set('nightNext', this.levelIndex + 1);
    this.printer.placeHead(PX, rowY(this.target.length + 1));
    SFX.win();
    const snapshot = this.printed.map((row) => row.map((cell) => (cell && cell.kept ? (cell.good ? 1 : 2) : 0)));
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(300, 6, 8, 13);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('results', {
        level: this.levelIndex, stats: this.stats, accuracy: this.accuracy(), snapshot, clock: clockText(this.night), night: this.night, retried: this.retried,
      }));
    });
  }
}
