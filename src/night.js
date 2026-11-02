// The night shift clock: 22:00 to sunrise at 06:00. Every printed layer takes a few minutes, every
// botched layer and every retry costs extra. Clock out before sunrise for the real ending.
import { LEVELS } from './levels.js';

export const LAYER_MIN = 4;     // a layer printed: the 85 layers of a flawless night end at 03:40
export const MISS_MIN = 10;     // a layer that is not perfect: cleaning up the mess
export const RETRY_MIN = 30;    // restarting a job: scraping the plate and re-slicing
export const DAWN = 8 * 60;     // minutes after 22:00 when the sun comes up
const START = 22 * 60;

export const layersBefore = (level) => LEVELS.slice(0, level).reduce((a, l) => a + l.rows.length, 0);

// "HH:MM" for a number of minutes after 22:00 (blink: a space instead of the colon)
export function clockText(min, blink = false) {
  const m = Math.round(START + min), hh = Math.floor(m / 60) % 24, mm = m % 60;
  return String(hh).padStart(2, '0') + (blink ? ' ' : ':') + String(mm).padStart(2, '0');
}

// Minutes on the clock when a job starts. A new night starts at 0; a retry restores the time the job
// started at, plus the retry cost; a job opened any other way assumes a clean night up to that point.
export function startOfJob(registry, level, { retry = false, newNight = false } = {}) {
  let min;
  if (newNight || (level === 0 && !retry)) min = 0;
  else if (retry && registry.get('nightJob') === level) min = registry.get('nightJobStart') + RETRY_MIN;
  else if (registry.get('nightNext') === level) min = registry.get('night');
  else min = layersBefore(level) * LAYER_MIN;
  registry.set('nightJob', level);
  registry.set('nightJobStart', min);
  return min;
}

// Remembered between sessions in this browser (best effort: storage can be blocked).
export function bestClockOut() {
  try { const v = parseFloat(localStorage.getItem('layershift.bestClockOut')); return Number.isFinite(v) ? v : null; } catch (e) { return null; }
}
export function saveClockOut(min) {
  const best = bestClockOut();
  if (best !== null && best <= min) return false;
  try { localStorage.setItem('layershift.bestClockOut', String(min)); } catch (e) { /* not available */ }
  return true;
}
