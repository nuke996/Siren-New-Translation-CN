#!/usr/bin/env node
const __P = require('./_config.js');
// Audit every deployed text table for defects:
//   UNMAPPED -> a glyph index outside our injected set (would draw the ORIGINAL
//               Japanese glyph on screen)
//   KANA     -> rendered text still contains a Japanese kana (stray Japanese)
//   '?'      -> glyph with no entry in the merged map
// usage: node _subaudit.js
'use strict';
const fs = require('fs');
const path = require('path');
const IMP = `${__P.WORK}/import/`;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const kana = /[\u3040-\u309f\u30a0-\u30ff]/;
// Records allowed to keep a kana on purpose:
//   ARCHIVE030 「聖画ー虚母ろ主ー」 - ろ is the original stylised reading (ウロボロス/Uroboros).
const ALLOW = [/^ARCHIVE030$/];

function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
function readMsg(b, a) { const i = b.indexOf(MARK, a); let p = i + MARK.length + 2; const out = []; while (p + 1 < b.length) { const v = b.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; out.push(v); } return out; }

const files = fs.readdirSync(IMP).filter(f => /\.merged\.json$/.test(f));
let scanned = 0, badUnmapped = 0, badKana = 0, allowed = 0;
const offenders = [];
for (const mf of files) {
  const stem = mf.replace(/\.merged\.json$/, '');
  const dat = IMP + stem + '.dat';
  if (!fs.existsSync(dat)) continue;
  const merged = JSON.parse(fs.readFileSync(IMP + mf, 'utf8'));
  const glyphs = merged.glyphs || {};
  const buf = fs.readFileSync(dat);
  const count = buf.readUInt32BE(12);
  for (let i = 0; i < count; i++) {
    const no = buf.readUInt32BE(16 + i * 8) + 16, dof = buf.readUInt32BE(16 + i * 8 + 4) + 16;
    const nm = readCStr(buf, no);
    let idx;
    try { idx = readMsg(buf, dof); } catch (e) { continue; }
    const unmapped = idx.filter(g => glyphs[g] === undefined);
    const text = idx.map(g => glyphs[g] || '?').join('');
    scanned++;
    if (unmapped.length) { badUnmapped++; offenders.push(`[UNMAPPED] ${stem} :: ${nm}  (${unmapped.length})  ${text}`); }
    else if (kana.test(text)) { if (ALLOW.some(r => r.test(nm))) allowed++; else { badKana++; offenders.push(`[KANA]     ${stem} :: ${nm}  ${text}`); } }
  }
}
console.log('tables=' + files.length + ' records=' + scanned);
console.log('UNMAPPED records=' + badUnmapped + '   KANA records=' + badKana + '   (allowed-kana ' + allowed + ')');
console.log('\n--- offenders ---');
for (const o of offenders.slice(0, 120)) console.log(o);
if (offenders.length > 120) console.log('... +' + (offenders.length - 120) + ' more');