// Level data checks (no browser): 8 jobs, rows COLS wide, fit the blueprint, and a perfect print never sags.
import { COLS, LEVELS, layersOf } from '../src/levels.js';

const errors = [];
const MAX_ROWS = 13;   // what the blueprint panel can show
if (LEVELS.length !== 8) errors.push(`expected 8 jobs, got ${LEVELS.length}`);
if (new Set(LEVELS.map((l) => l.id)).size !== LEVELS.length) errors.push('duplicate level ids');
if (LEVELS[LEVELS.length - 1].id !== 'rocket') errors.push('the rocket must be the last job');
LEVELS.forEach((l, i) => {
  if (l.rows.length > MAX_ROWS) errors.push(`${l.id}: ${l.rows.length} rows > ${MAX_ROWS}`);
  l.rows.forEach((r, k) => { if (r.length !== COLS || /[^#.]/.test(r)) errors.push(`${l.id}: bad row ${k} "${r}"`); });
  const layers = layersOf(l);
  layers.forEach((row, r) => {
    if (!row.includes(true)) errors.push(`${l.id}: empty layer ${r}`);
    if (r === 0) return;
    row.forEach((on, c) => {
      if (on && ![c - 1, c, c + 1].some((k) => layers[r - 1][k])) errors.push(`${l.id}: layer ${r} col ${c} is printed over air`);
    });
  });
  if (i < 4 && l.plateShifts) errors.push(`${l.id}: plate shifts start at job 5`);
  if (i >= 4 && !(l.plateShifts > 0)) errors.push(`${l.id}: job ${i + 1} needs plate shifts`);
});
if (errors.length) { console.error(errors.join('\n')); console.log('LEVELS FAIL'); process.exit(1); }
console.log('LEVELS OK', LEVELS.map((l) => `${l.id}:${l.rows.length}`).join(' '));
