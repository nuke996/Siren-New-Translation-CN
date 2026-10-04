#!/usr/bin/env node
const __P = require('./_config.js');
// Build batched contact sheets of the archive document masks
// (menu/jp/main_archive/archives/NN/aNN_text_M.dds, 1024x2048 A8) so the
// Japanese can be read page by page.
//
// usage: node _archsheets.js [pagesPerSheet=10]
// writes work/archsheets/batch_NN.png and work/archsheets/index.json
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const OUT = `${__P.WORK}/archsheets`;
const PER = process.argv[2] ? Number(process.argv[2]) : 10;

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const hits = idx.entries.filter(e => /main_archive\/archives\/\d+\/a\d+_text_\d+\.dds$/.test(e.name));
console.log('archive text pages:', hits.length);
fs.mkdirSync(OUT, { recursive: true });

const pages = [];
for (const e of hits) {
  const buf = Buffer.from(dat.subarray(e.off, e.off + e.size));
  const hdr = parseDDS(buf);
  const W = hdr.width, H = hdr.height;
  const data = buf.subarray(hdr.dataOffset, hdr.dataOffset + W * H);
  let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[y * W + x] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  if (y1 < 0) { y0 = 0; y1 = 0; x0 = 0; x1 = 0; }
  pages.push({ entry: e.name, W, H, data, y0, y1, x0, x1 });
}

const LAB = 16, GAP = 6;
const index = [];
let batch = [], n = 0;
function flush() {
  if (!batch.length) return;
  const OW = Math.max(...batch.map(p => p.W));
  let outH = 0;
  for (const p of batch) outH += LAB + (p.y1 - p.y0 + 1) + GAP;
  const cv = Buffer.alloc(OW * outH * 4, 255);
  for (let i = 3; i < cv.length; i += 4) cv[i] = 255;
  const px = (x, y, g) => { if (x < 0 || y < 0 || x >= OW || y >= outH) return; const i = (y * OW + x) * 4; cv[i] = g; cv[i + 1] = g; cv[i + 2] = g; };
  let oy = 0; const rows = [];
  for (const p of batch) {
    rows.push({ entry: p.entry, sheetY: oy + LAB, y0: p.y0, y1: p.y1 });
    for (let y = p.y0; y <= p.y1; y++) for (let x = 0; x < p.W; x++) {
      const a = p.data[y * p.W + x]; const g = 255 - a;
      if (g < 250) px(x, oy + LAB + (y - p.y0), g);
    }
    oy += LAB + (p.y1 - p.y0 + 1) + GAP;
  }
  const file = path.join(OUT, `batch_${String(n).padStart(2, '0')}.png`);
  writePNG(file, OW, outH, cv);
  index.push({ file, rows });
  console.log(`batch_${String(n).padStart(2, '0')}.png  ${OW}x${outH}  ${batch.length} pages: ` + batch.map(p => p.entry.replace(/^.*archives\//, '')).join(' '));
  batch = []; n++;
}
for (const p of pages) { batch.push(p); if (batch.length >= PER) flush(); }
flush();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log('wrote', index.length, 'sheets ->', OUT);