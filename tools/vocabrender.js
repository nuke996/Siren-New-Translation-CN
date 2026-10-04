#!/usr/bin/env node
const __P = require('./_config.js');
// Render the unknown-cell vocabulary (work/vocab.json) into readable contact sheets.
// Layout: 10 cells per row, 10 rows per image => 100 cells/ image.
// For entry with id N: row = floor((N%100)/10), col = N%10.
// usage: node vocabrender.js [scale] [perImg]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28;

const SCALE = +(process.argv[2] || 4);
const PER_IMG = +(process.argv[3] || 100);
const COLS = +(process.argv[4] || 10);

const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));

// group by tag, load each sheet once
const cache = {};
function getSheet(tag) {
  if (cache[tag]) return cache[tag];
  const cdat = fs.readFileSync(BASE + 'common.dat');
  const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const e = idx.entries.find(x => x.name.includes('script/msg/') && x.name.endsWith(tag + '0.dds'));
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  const buf = dbuf.subarray(e.off, e.off + e.size);
  const hdr = parseDDS(buf);
  const rgba = decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset);
  cache[tag] = { hdr, rgba, cols: Math.floor(hdr.width / CELL_W) };
  return cache[tag];
}

const batches = Math.ceil(vocab.length / PER_IMG);
for (let bi = 0; bi < batches; bi++) {
  const items = vocab.slice(bi * PER_IMG, bi * PER_IMG + PER_IMG);
  const rows = Math.ceil(items.length / COLS);
  const cw = CELL_W * SCALE, chh = CELL_H * SCALE;
  const ow = (COLS + 1) * cw, oh = (rows + 1) * chh;   // +1 margin cell right/bottom
  const cv = Buffer.alloc(ow * oh * 4, 40);
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const s = getSheet(it.tag);
    const cc = it.cell % s.cols, rr = Math.floor(it.cell / s.cols);
    const r = Math.floor(k / COLS), c = k % COLS;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const si = ((rr * CELL_H + y) * s.hdr.width + (cc * CELL_W + x)) * 4;
      const l = (s.rgba[si] + s.rgba[si + 1] + s.rgba[si + 2]) / 3;
      for (let yy = 0; yy < SCALE; yy++) for (let xx = 0; xx < SCALE; xx++) {
        const d = (((r * CELL_H + y) * SCALE + yy) * ow + (c * CELL_W + x) * SCALE + xx) * 4;
        cv[d] = cv[d + 1] = cv[d + 2] = l > 40 ? 255 : 0; cv[d + 3] = 255;
      }
    }
  }
  // separators (dark grey); thicker line every 5 columns for counting
  for (let k = 0; k <= items.length; k++) {
    const c = k % COLS, r = Math.floor(k / COLS);
    if (c === 0 && k > 0) {
      const y = r * chh; if (y < oh) for (let x = 0; x < ow; x++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = 0; }
    }
  }
  for (let r = 0; r <= rows; r++) { const y = r * chh - 1; if (y >= 0 && y < oh) for (let x = 0; x < ow; x++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = 0; } }
  for (let c = 0; c <= COLS; c++) {
    const x = c * cw - 1; if (x < 0 || x >= ow) continue;
    const col = (c % 5 === 0) ? 120 : 0;
    for (let y = 0; y < oh; y++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = col; }
  }
  const out = path.join(WORK, `vocab_${String(bi).padStart(2, '0')}.png`);
  writePNG(out, ow, oh, cv);
  console.log('wrote', out, 'ids', bi * PER_IMG, '..', bi * PER_IMG + items.length - 1);
}