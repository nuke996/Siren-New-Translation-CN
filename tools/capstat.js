#!/usr/bin/env node
const __P = require('./_config.js');
// Capacity estimate: for each movie sheet, how many DISTINCT glyphs the Simplified-Chinese
// text needs, vs the 378 cells available per 21x18 atlas.
//
//   per sheet = chars(draft EP lines for that CP)  U  chars(archive name translations)
// (lower bound: ignores messages not present in the drafts)
'use strict';
const fs = require('fs');
const WORK = `${__P.WORK}`;

const files = fs.readdirSync(WORK);
const charsOf = s => new Set([...s].filter(c => c !== ' ' && c !== '\u25c7' && c !== '\u203b'));

const common = JSON.parse(fs.readFileSync(WORK + '/zh_draft_common.json', 'utf8'));
let arch = new Set();
for (const k in common.archive_names) for (const c of charsOf(common.archive_names[k])) arch.add(c);

const perSheet = new Map();     // "NN_cp" -> Set(chars)
for (const f of files) {
  const m = /^zh_draft_ep(\d+)\.json$/.exec(f);
  if (!m) continue;
  const d = JSON.parse(fs.readFileSync(WORK + '/' + f, 'utf8'));
  for (const ln of d.lines) {
    const cm = /^EP\d+_CP(\d+)_/.exec(ln.name);
    const key = (+m[1]) + '_' + (cm ? cm[1] : '?');
    if (!perSheet.has(key)) perSheet.set(key, new Set());
    const s = perSheet.get(key);
    for (const c of charsOf(ln.text)) s.add(c);
  }
}
const rows = [...perSheet.entries()].map(([k, s]) => {
  const u = new Set([...s, ...arch]);
  return { sheet: 'ep' + String(k.split('_')[0]).padStart(2, '0') + '_cp' + k.split('_')[1], n: u.size };
}).sort((a, b) => b.n - a.n);
console.log('archive-name chars:', arch.size);
console.log('sheet                 distinctGlyphsNeeded   (atlas capacity 378)');
for (const r of rows) console.log('  ' + r.sheet.padEnd(14) + String(r.n).padStart(6) + (r.n > 378 ? '   OVER!' : ''));
console.log('max =', rows[0] ? rows[0].n : 0);

// ---- chapter sheets (sXX0, 21x18 = 378 cells; second sheet sXX1 excluded) ----
const chapRows = [];
for (const f of files) {
  const m = /^zh_draft_chapter_(s\d\d)\.json$/.exec(f);
  if (!m) continue;
  const d = JSON.parse(fs.readFileSync(WORK + '/' + f, 'utf8'));
  const s = new Set();
  for (const ln of d.lines) for (const c of charsOf(ln.text)) s.add(c);
  chapRows.push({ tag: m[1], n: s.size });
}
chapRows.sort((a, b) => b.n - a.n);
console.log('\nchapter sXX0 (atlas capacity 378):');
for (const r of chapRows) console.log('  ' + r.tag.padEnd(6) + String(r.n).padStart(6) + (r.n > 378 ? '   OVER!' : ''));
console.log('chapter max =', chapRows[0] ? chapRows[0].n : 0);