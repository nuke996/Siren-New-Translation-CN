#!/usr/bin/env node
const __P = require('./_config.js');
// Extract A8 mask entries matching a name pattern from an archive and build a
// stacked contact sheet (grayscale, cropped to the ink band) for easy reading.
// usage: node _masksheet.js <archPrefix> <nameContains> <outPng> [max]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeRaw, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const [archPrefix, nameContains, outPng, maxS, startS] = process.argv.slice(2);
const MAX = maxS ? Number(maxS) : 999;
const START = startS ? Number(startS) : 0;

const idx = parseHed(fs.readFileSync(BASE + archPrefix + '.hed'));
const dat = fs.readFileSync(BASE + archPrefix + '.dat');
let hits = idx.entries.filter(e => e.name.includes(nameContains) && e.name.endsWith('.dds'));
hits = hits.slice(START, START + MAX);
if (!hits.length) { console.log('no matches'); process.exit(1); }

const items = [];
for (const e of hits) {
  const buf = Buffer.from(dat.subarray(e.off, e.off + e.size));
  const hdr = parseDDS(buf);
  const W = hdr.width, H = hdr.height;
  const data = buf.subarray(hdr.dataOffset, hdr.dataOffset + W * H);
  // ink band
  let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[y * W + x] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  if (y1 < 0) { y0 = 0; y1 = H - 1; x0 = 0; x1 = W - 1; }
  items.push({ name: e.name, W, H, data, y0, y1, x0, x1 });
  console.log(e.name.padEnd(50), `${W}x${H}`, `ink y=${y0}..${y1} x=${x0}..${x1} (w=${x1 - x0 + 1})`);
  fs.writeFileSync(path.join(WORK, path.basename(e.name)), buf);
}

// contact sheet: one row per item, keep full 1024 width so centering is visible
const LAB = 14, ROWGAP = 4;
let outH = 0;
for (const it of items) outH += LAB + (it.y1 - it.y0 + 1) + ROWGAP;
const OW = Math.max(...items.map(i => i.W));
const cv = Buffer.alloc(OW * outH * 4, 255);
for (let i = 0; i < OW * outH * 4; i += 4) { cv[i] = 255; cv[i + 1] = 255; cv[i + 2] = 255; cv[i + 3] = 255; }
function px(x, y, g) { if (x < 0 || y < 0 || x >= OW || y >= outH) return; const i = (y * OW + x) * 4; cv[i] = g; cv[i + 1] = g; cv[i + 2] = g; cv[i + 3] = 255; }
let oy = 0;
for (const it of items) {
  for (let y = it.y0; y <= it.y1; y++) for (let x = 0; x < it.W; x++) {
    const a = it.data[y * it.W + x];
    const g = 255 - a;
    if (g < 250) px(x, oy + LAB + (y - it.y0), g);
  }
  oy += LAB + (it.y1 - it.y0 + 1) + ROWGAP;
}
writePNG(outPng, OW, outH, cv);
console.log('wrote', outPng, OW + 'x' + outH, 'items', items.length);