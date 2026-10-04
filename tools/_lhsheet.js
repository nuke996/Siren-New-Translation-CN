#!/usr/bin/env node
const __P = require('./_config.js');
// Cropped contact sheet for menu_linehelp A8 masks (crop x to ink, stack vertically).
// usage: node _lhsheet.js <rdown|rright> <outPng,outPng...>
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const dir = process.argv[2];
const outs = process.argv.slice(3);
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const pre = 'menu/jp/common/' + dir + '/menu_linehelp_';
let hits = idx.entries.filter(e => e.name.startsWith(pre) && e.name.endsWith('.dds'));
const N = outs.length;
const per = Math.ceil(hits.length / N);

function load(e) {
  const buf = Buffer.from(dat.subarray(e.off, e.off + e.size));
  const W = buf.readUInt32LE(16), H = buf.readUInt32LE(12);
  const data = buf.subarray(128, 128 + W * H);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[y * W + x] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1; }
  return { W, H, data, x0, x1, y0, y1 };
}

for (let o = 0; o < N; o++) {
  const items = hits.slice(o * per, o * per + per).map(load);
  if (!items.length) continue;
  const GAP = 6;
  const OW = Math.max(...items.map(i => i.x1 - i.x0 + 1));
  const OH = items.reduce((s, i) => s + (i.y1 - i.y0 + 1) + GAP, 0);
  const cv = Buffer.alloc(OW * OH * 4, 255);
  let oy = 0;
  for (const it of items) {
    for (let y = it.y0; y <= it.y1; y++) for (let x = it.x0; x <= it.x1; x++) {
      const a = it.data[y * it.W + x];
      const g = 255 - a;
      if (g < 250) { const i2 = ((oy + (y - it.y0)) * OW + (x - it.x0)) * 4; cv[i2] = g; cv[i2 + 1] = g; cv[i2 + 2] = g; cv[i2 + 3] = 255; }
    }
    oy += (it.y1 - it.y0 + 1) + GAP;
  }
  writePNG(outs[o], OW, OH, cv);
  hits.slice(o * per, o * per + per).forEach((e, i) => console.log(`[${o}]${i} ${e.name.replace(pre, '')} inkx=${items[i].x0}..${items[i].x1} (w=${items[i].x1 - items[i].x0 + 1})`));
  console.log('wrote', outs[o], OW + 'x' + OH);
}