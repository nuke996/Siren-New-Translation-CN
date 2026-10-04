#!/usr/bin/env node
const __P = require('./_config.js');
// List, for a given sheet, every atlas cell whose decoded char equals the requested chars.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
  const add = (names, chars) => { try { const v = JSON.parse(fs.readFileSync(path.join(WORK, names), 'utf8')); const c = JSON.parse(fs.readFileSync(path.join(WORK, chars), 'utf8')); for (const it of v) { const ch = c[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; } } catch (e) { } };
  add('vocab.json', 'vocab_chars.json'); add('subvocab.json', 'subvocab_chars.json');
  return db;
}
function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8; const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8; const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
const stem = process.argv[2];
const wants = process.argv.slice(3);
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
const sheet = Buffer.from(cdat.subarray(ddsE.off, ddsE.off + ddsE.size));
const hdr = parseDDS(sheet);
const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
const db = loadDb();
const byChar = new Map();
for (let c = 0; c < cols * rows; c++) {
  const col = c % cols, row = Math.floor(c / cols);
  const sig = cellSig(sheet, hdr.dataOffset, hdr.width, col, row);
  const ch = db[sig];
  if (!ch) continue;
  if (!byChar.has(ch)) byChar.set(ch, []);
  byChar.get(ch).push({ cell: c, sig: sig.slice(0, 12) });
}
for (const w of wants) {
  const list = byChar.get(w) || [];
  console.log(`${w} -> ${list.length} cell(s): ${list.map(x => x.cell + '(' + x.sig + ')').join(' ')}`);
}
// also: chars that map to more than one cell (ambiguous reuse)
let dup = 0; const dups = [];
for (const [ch, list] of byChar) if (list.length > 1) { dup++; if (dups.length < 30) dups.push(ch + ':' + list.map(x => x.cell).join(',')); }
console.log(`\nchars with >1 cell: ${dup}`);
console.log(dups.join('  '));