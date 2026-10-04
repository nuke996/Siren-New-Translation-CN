#!/usr/bin/env node
const __P = require('./_config.js');
// Re-decode every previously-exported *_jp.txt using the updated sig DB
// (chap_templates.json now includes the 61 newly identified glyphs), then report
// which lines changed -- these are exactly the lines that used to contain the
// unknown-glyph placeholder (U+25C7) and are now correct Japanese.
//
// usage: node _redecode.js
'use strict';
const fs = require('fs');
const path = require('path');
const WK = `${__P.WORK}`;
const chap = require('./chapdecode.js');
const sub = require('./subdecode.js');

const dbC = chap.loadDb();
const dbS = sub.loadDb();

const files = fs.readdirSync(WK).filter(f => f.endsWith('_jp.txt'));
const old = {};
for (const f of files) old[f] = fs.readFileSync(path.join(WK, f), 'utf8');

function chapOut(tag, db) {
  const out = ['# ' + tag + '  (auto-decoded from sig DB)', ''];
  for (const stem of [tag + '0', tag + '1']) {
    let r; try { r = chap.decodeSheet(tag, stem, db); } catch (e) { out.push('## ' + stem + ' ERROR ' + e.message, ''); continue; }
    if (!r) continue;
    out.push('## ' + r.stem + '  grid ' + r.cols + 'x' + r.rows + '  cellsKnown ' + r.known + '/' + r.total +
      '  messages ' + r.count + '  spaces ' + r.blanks + '  unknownGlyphs ' + r.unknown, '');
    out.push(...r.lines);
  }
  return out.join('\n');
}
function subOut(stem, db) {
  const r = sub.decodePair(stem, db);
  const safe = stem.replace(/[^A-Za-z0-9_]+/g, '_');
  if (r.err) return { safe, txt: null };
  const out = ['# ' + stem + '  (auto-decoded from sig DB)', '',
    '## ' + r.cols + 'x' + r.rows + ' (' + r.w + 'x' + r.h + ')  cellsKnown ' + r.known + '/' + r.total +
    '  messages ' + r.count + '  chars ' + r.chars + '  spaces ' + r.blanks + '  unknownGlyphs ' + r.unknown, ''];
  out.push(...r.lines);
  return { safe, txt: out.join('\n') };
}

// ---- chapters ----
for (let i = 1; i <= 25; i++) {
  const tag = 's' + String(i).padStart(2, '0');
  fs.writeFileSync(path.join(WK, tag + '_jp.txt'), chapOut(tag, dbC));
}
// ---- movie / archive stems derived from the existing filenames ----
for (const f of files) {
  const base = f.replace('_jp.txt', '');
  let stem = null;
  if (base.startsWith('hud_movie_')) stem = 'hud/movie/' + base.slice('hud_movie_'.length);
  else if (base.startsWith('hud_launcher_jimaku_')) stem = 'hud/launcher/jimaku/' + base.slice('hud_launcher_jimaku_'.length);
  if (!stem) continue;
  const { safe, txt } = subOut(stem, dbS);
  if (txt) fs.writeFileSync(path.join(WK, safe + '_jp.txt'), txt);
}

// ---- diff: message blocks that changed ----
function blocks(txt) {
  const out = {}; let cur = null, buf = [];
  for (const ln of txt.split('\n')) {
    const m = /^\[(\d+)\] (.*)$/.exec(ln);
    if (m) { if (cur !== null) out[cur] = buf.join('\n'); cur = m[1] + ' ' + m[2]; buf = []; }
    else if (cur !== null) buf.push(ln);
  }
  if (cur !== null) out[cur] = buf.join('\n');
  return out;
}
let changedMsgs = 0, changedFiles = 0, stillCry = 0, newCry = 0;
const report = [];
for (const f of files) {
  const nw = fs.readFileSync(path.join(WK, f), 'utf8');
  if (nw === old[f]) continue;
  const bo = blocks(old[f]), bn = blocks(nw);
  let n = 0; const rows = [];
  for (const k in bn) {
    if (bo[k] !== bn[k]) { n++; rows.push({ k, o: (bo[k] || '').trim(), n: (bn[k] || '').trim() }); }
  }
  if (!n && nw.replace(/unknownGlyphs \d+/g, '') === old[f].replace(/unknownGlyphs \d+/g, '')) continue;
  changedFiles++; changedMsgs += n;
  report.push({ f, n, rows });
}
// count remaining placeholder in new files
for (const f of files) {
  const nw = fs.readFileSync(path.join(WK, f), 'utf8');
  stillCry += (nw.match(/\u25c7/g) || []).length;
  newCry += (old[f].match(/\u25c7/g) || []).length;
}

fs.writeFileSync(path.join(WK, 'jp_diff.json'), JSON.stringify(report, null, 1));
console.log('files changed:', changedFiles, '  messages changed:', changedMsgs);
console.log('U+25C7 before:', newCry, ' after:', stillCry);
for (const r of report.slice(0, 20)) {
  console.log('\n== ' + r.f + '  (' + r.n + ' msgs)');
  for (const x of r.rows.slice(0, 4)) { console.log('  - ' + x.k); console.log('    old: ' + x.o); console.log('    new: ' + x.n); }
}
console.log('\nwrote work/jp_diff.json');