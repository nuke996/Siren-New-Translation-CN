#!/usr/bin/env node
const __P = require('./_config.js');
// Hypothesis test: is a chapter sheet's cell index == the record order inside
// fontidexu8.tbl table B (i.e. the engine's internal char-ID order)?
//
// If true, we can build every chapter's cell->char map mechanically.
//
// usage: node hypo_tblorder.js
'use strict';
const fs = require('fs');

const TBL = `${__P.gameRoot}/_hanhua/extracted/fontidexu8.tbl`;
const MAP = `${__P.WORK}/s010_map_zh.json`;
const TABLE_A_END = 2000;

const buf = fs.readFileSync(TBL);
const orderOf = {};        // char -> record order within table B (0-based)
const glyphOf = {};        // char -> glyph index (font01 atlas)
let rb = 0;
for (let o = TABLE_A_END; o + 8 <= buf.length; o += 8) {
  const raw = Buffer.from([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]).reverse().toString('utf8').replace(/\0+$/g, '');
  if (raw && !raw.includes('\uFFFD')) {
    if (orderOf[raw] === undefined) orderOf[raw] = rb;
    if (glyphOf[raw] === undefined) glyphOf[raw] = buf.readUInt32BE(o + 4);
  }
  rb++;
}
console.log('table B records:', rb);

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const g = map.glyphs;
console.log('chapter-1 map cells:', g.length);

// Compare three hypotheses for the original (non-injected) cells 0..251:
//   H1: cell == tableB record order
//   H2: cell == font01 glyph index
//   H3: cell == cp-0x20 for ascii-ish, else something
let h1 = 0, h2 = 0, n = 0, miss = 0;
const mismatch = [];
for (let c = 0; c < 252; c++) {
  const ch = g[c];
  if (!ch || ch === '') continue;
  n++;
  if (orderOf[ch] === undefined) { miss++; if (mismatch.length < 20) mismatch.push([c, ch, 'NOT-IN-TBL']); continue; }
  if (orderOf[ch] === c) h1++;
  if (glyphOf[ch] === c) h2++;
  if (orderOf[ch] !== c && mismatch.length < 20) mismatch.push([c, ch, 'order=' + orderOf[ch], 'glyph=' + glyphOf[ch]]);
}
console.log('cells with char:', n, 'miss(not in tbl):', miss);
console.log('H1 cell==tableB-order:', h1 + '/' + n);
console.log('H2 cell==font01-glyph:', h2 + '/' + n);
console.log('sample mismatches [cell,char,order,glyph]:');
for (const m of mismatch) console.log('  ', JSON.stringify(m));