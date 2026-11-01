// Procedural sound effects via WebAudio — no external audio files.
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

export function resumeAudio() {
  initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}
export const isMuted = () => muted;

function noiseBuffer() {
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
let _noise = null;

/**
 * Play a tone. opts: { type, freq, freqEnd, dur, vol, attack, noise, filter }
 */
export function tone(opts = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const dur = opts.dur ?? 0.15;
  const vol = opts.vol ?? 0.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src;
  if (opts.noise) {
    _noise = _noise || noiseBuffer();
    src = ctx.createBufferSource();
    src.buffer = _noise;
  } else {
    src = ctx.createOscillator();
    src.type = opts.type ?? 'square';
    src.frequency.setValueAtTime(opts.freq ?? 440, t);
    if (opts.freqEnd) src.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t + dur);
  }
  let node = src;
  if (opts.filter) {
    const f = ctx.createBiquadFilter();
    f.type = opts.filter.type ?? 'lowpass';
    f.frequency.value = opts.filter.freq ?? 1200;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// Preset library
export const SFX = {
  click: () => tone({ type: 'square', freq: 660, freqEnd: 880, dur: 0.06, vol: 0.25 }),
  jump: () => tone({ type: 'square', freq: 300, freqEnd: 700, dur: 0.12, vol: 0.3 }),
  pickup: () => { tone({ type: 'triangle', freq: 880, dur: 0.08, vol: 0.35 }); setTimeout(() => tone({ type: 'triangle', freq: 1320, dur: 0.12, vol: 0.35 }), 60); },
  hit: () => tone({ noise: true, dur: 0.18, vol: 0.5, filter: { type: 'lowpass', freq: 900 } }),
  explode: () => tone({ noise: true, dur: 0.45, vol: 0.7, filter: { type: 'lowpass', freq: 500 } }),
  lose: () => tone({ type: 'sawtooth', freq: 400, freqEnd: 60, dur: 0.6, vol: 0.35 }),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', freq: f, dur: 0.18, vol: 0.35 }), i * 90)),
};

// Tiny step-sequencer for background music (loop of notes in Hz, 0 = rest)
export class Music {
  constructor(pattern, bpm = 120, type = 'triangle', vol = 0.12) {
    this.pattern = pattern; this.bpm = bpm; this.type = type; this.vol = vol;
    this.timer = null; this.step = 0;
  }
  start() {
    if (this.timer) return;
    const ms = 60000 / this.bpm / 2;
    this.timer = setInterval(() => {
      const f = this.pattern[this.step % this.pattern.length];
      if (f) tone({ type: this.type, freq: f, dur: ms / 1000 * 0.9, vol: this.vol });
      this.step++;
    }, ms);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
}
