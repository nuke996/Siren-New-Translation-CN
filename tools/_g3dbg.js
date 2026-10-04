#!/usr/bin/env node
const __P = require('./_config.js');
// G3 debug: dump full glyph-index list + char for specific ARCHIVE messages,
// and print the full sig for cells of interest.
'use strict';
const fs = require('fs');
const { parseDDS } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const WORK = `${__P.WORK}`;

function load(f) { return JSON.parse(fs.readFileSync(WORK + '/' + f, 'utf8')); }
const tpl = load('chap_templates.json');
const db = {};
for (const k in tpl) db[k] = tpl[k];
for (const [vf, cf] of [['vocab.json', 'vocab_chars.json'], ['subvocab.json', 'subvocab_chars.json']]) {
  const vb = load(vf), vc = load(cf);
  for (const v of vb) { const ch = vc[String(v.id)]; if (ch && !db[v.sig]) db[v.sig] = ch; }
}

const dds = fs.readFileSync(WORK + '/import/hud_movie_ep02_cp1.orig.dds');
const dat = fs.readFileSync(WORK + '/import/hud_movie_ep02_cp1.orig.dat');
const hdr = parseDDS(dds);
const CW = 24, CH = 28, BLKW = 6, BLKH = 7;
const cols = Math.floor(hdr.width / CW), rows = Math.floor(hdr.height / CH);
const bpr = (hdr.width / 4) * 8;
function cellSig(col, row) {
  const b0 = hdr.dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(dds.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
const sigOf = new Array(cols * rows), glyphs = new Array(cols * rows).fill('');
for (let c = 0; c < cols * rows; c++) {
  const col = c % cols, row = Math.floor(c / cols);
  const s = cellSig(col, row); sigOf[c] = s;
  glyphs[c] = db[s] || '◇';
}
console.log(`grid ${cols}x${rows} = ${cols * rows} cells; dds ${hdr.width}x${hdr.height}`);
// duplicate-sig report for interesting cells
for (const cell of [73, 46, 9, 123, 189]) {
  console.log(`cell ${cell}: col=${cell % cols} row=${Math.floor(cell / cols)} char=${glyphs[cell]} sig=${sigOf[cell]}`);
}

const fd = parseFontdata(Buffer.from(dat));
function cstr(o) { let e = o; while (e < dat.length && dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
const target = new Set(['ARCHIVE003', 'ARCHIVE024', 'ARCHIVE025', 'ARCHIVE030', 'ARCHIVE032']);
for (let i = 0; i < fd.count; i++) {
  const nm = cstr(fd.entries[i].nameOff + 16);
  if (!target.has(nm)) continue;
  const { style, glyphs: gi } = readPayload(Buffer.from(dat), fd.entries[i].dataOff + 16);
  console.log(`\n${nm} style=${style}`);
  console.log('  chars=' + gi.map(g => glyphs[g] || '?').join('|'));
  console.log('  cell =' + gi.join(','));
  console.log('  sig8 =' + gi.map(g => (sigOf[g] || '').slice(8, 16)).join(' '));
}
