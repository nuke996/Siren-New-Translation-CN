#!/usr/bin/env node
// Decode fontidexu8.tbl into char -> glyphIndex maps.
//
// Confirmed structure (2026-10-02):
//   bytes [0 .. 2000)      : 250 records x 8 bytes, both u32 fields small (7..24)
//                            -> separate table (purpose TBD; NOT char mapping)
//   bytes [2000 .. end)    : 7059 records x 8 bytes
//                            record = char[4] (UTF-8 bytes stored REVERSED, i.e. read as u32LE)
//                                   + u32BE glyphIndex
//
// Atlas (font01.dds) address formula (CONFIRMED):
//   col = glyph % 51 ; row = floor(glyph / 51)
//   x = col*20 ; y = row*20 + 1        (20x20 cells; 1024px -> 51 cols; 139 rows)
//
// Usage:
//   node tbl2json.js dump [start] [count]
//   node tbl2json.js byglyph [min] [max]
//   node tbl2json.js validate
//   node tbl2json.js export <out.json>
'use strict';
const fs = require('fs');

const file = process.argv[2];
const cmd = process.argv[3] || 'validate';
const buf = fs.readFileSync(file);

const TABLE_A_END = 2000;

function decodeChar(o) {
  const raw = Buffer.from([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]).reverse();
  const s = raw.toString('utf8');
  if (s.includes('\uFFFD')) return null;
  const t = s.replace(/\0+$/g, '');
  if (t.length === 0) return null;
  for (const ch of t) if (ch.codePointAt(0) < 0x20) return null;
  return t;
}

function scan() {
  const recs = [];
  for (let o = 0; o + 8 <= buf.length; o += 8) {
    recs.push({ off: o, ch: decodeChar(o), glyph: buf.readUInt32BE(o + 4) });
  }
  return recs;
}
const recs = scan();

if (cmd === 'dump') {
  const start = +(process.argv[4] || 0), count = +(process.argv[5] || 80);
  for (let i = start; i < Math.min(start + count, recs.length); i++) {
    const r = recs[i];
    console.log(String(i).padStart(5), 'off=' + String(r.off).padStart(6),
      'char=' + JSON.stringify(r.ch), 'glyph=' + r.glyph);
  }
} else if (cmd === 'byglyph') {
  const min = +(process.argv[4] || 0), max = +(process.argv[5] || 120);
  const m = recs.filter(r => r.ch && r.glyph >= min && r.glyph <= max).sort((a, b) => a.glyph - b.glyph);
  console.log('records with glyph in [' + min + ',' + max + ']:', m.length);
  for (const r of m) console.log('glyph=' + String(r.glyph).padStart(5), 'char=' + JSON.stringify(r.ch), 'off=' + r.off);
} else if (cmd === 'export') {
  const out = process.argv[4] || 'fontmap.json';
  const byGlyph = {}, byChar = {};
  const dupGlyph = [], dupChar = [];
  for (const r of recs) {
    if (!r.ch) continue;
    if (byGlyph[r.glyph] === undefined) byGlyph[r.glyph] = r.ch; else if (byGlyph[r.glyph] !== r.ch) dupGlyph.push([r.glyph, byGlyph[r.glyph], r.ch]);
    if (byChar[r.ch] === undefined) byChar[r.ch] = r.glyph; else if (byChar[r.ch] !== r.glyph) dupChar.push([r.ch, byChar[r.ch], r.glyph]);
  }
  fs.writeFileSync(out, JSON.stringify({ byGlyph, byChar }));
  console.log('wrote', out, 'byGlyph=' + Object.keys(byGlyph).length, 'byChar=' + Object.keys(byChar).length);
  console.log('dupGlyph(diff char):', dupGlyph.length, JSON.stringify(dupGlyph.slice(0, 10)));
  console.log('dupChar(diff glyph):', dupChar.length, JSON.stringify(dupChar.slice(0, 10)));
} else {
  // validate
  console.log('file', file, 'size', buf.length, 'records', recs.length);
  console.log('table A: records 0..' + (TABLE_A_END / 8 - 1) + ' (bytes 0..' + (TABLE_A_END - 1) + ')');
  console.log('table B: records ' + (TABLE_A_END / 8) + '..' + (recs.length - 1) + ' (bytes ' + TABLE_A_END + '..' + (buf.length - 1) + ')');

  const B = recs.slice(TABLE_A_END / 8).filter(r => r.ch);
  console.log('table B decodable:', B.length);
  const gmin = Math.min(...B.map(r => r.glyph)), gmax = Math.max(...B.map(r => r.glyph));
  console.log('glyph range:', gmin, '..', gmax, ' (atlas slots 51*139=7089)');

  // ASCII integrity: expect glyph = cp - 0x20 for cp 0x21..0x7E
  let asciiOK = 0, asciiBad = 0, asciiBadSample = [];
  for (let cp = 0x21; cp <= 0x7E; cp++) {
    const ch = String.fromCharCode(cp);
    const found = B.find(r => r.ch === ch);
    if (found && found.glyph === cp - 0x20) asciiOK++;
    else { asciiBad++; if (asciiBadSample.length < 12) asciiBadSample.push(ch + '->' + (found ? found.glyph : 'MISSING') + '(exp ' + (cp - 0x20) + ')'); }
  }
  console.log('ASCII glyph=cp-0x20 ok:', asciiOK, '/ 94 ; bad:', asciiBad, asciiBadSample.join(' '));

  // duplicates
  const byGlyph = {}, byChar = {};
  const dupGlyph = [], dupChar = [];
  for (const r of B) {
    if (byGlyph[r.glyph] === undefined) byGlyph[r.glyph] = r.ch; else if (byGlyph[r.glyph] !== r.ch) dupGlyph.push([r.glyph, byGlyph[r.glyph], r.ch]);
    if (byChar[r.ch] === undefined) byChar[r.ch] = r.glyph; else if (byChar[r.ch] !== r.glyph) dupChar.push([r.ch, byChar[r.ch], r.glyph]);
  }
  console.log('unique glyphs:', Object.keys(byGlyph).length, 'dup glyph(diff char):', dupGlyph.length, JSON.stringify(dupGlyph.slice(0, 8)));
  console.log('unique chars:', Object.keys(byChar).length, 'dup char(diff glyph):', dupChar.length, JSON.stringify(dupChar.slice(0, 8)));

  // high-water: how many slots free at bottom for expansion
  const usedMax = gmax;
  console.log('free atlas slots above used max:', 51 * 139 - 1 - usedMax);
}