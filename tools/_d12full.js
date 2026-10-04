const __P = require('./_config.js');
// Render FULL-CANVAS A8 masks (no ink crop) for a set of common.dat entries, stacked.
// usage: node _d12full.js <regex> <out.png> [scale=2] [perSheet=12]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const re = new RegExp(process.argv[2]);
const out = process.argv[3];
const S = parseInt(process.argv[4] || '2', 10);
const per = parseInt(process.argv[5] || '12', 10);
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const rows = [];
for (const e of idx.entries) {
  if (!re.test(e.name)) continue;
  const b = dat.subarray(e.off, e.off + e.size);
  const W = b.readUInt32LE(16), H = b.readUInt32LE(12), bpp = b.readUInt32LE(88);
  if (bpp !== 8) { console.log('skip(non-A8) ' + e.name); continue; }
  rows.push({ name: e.name, W, H, data: b.subarray(128, 128 + W * H) });
}
let k = 0;
for (let i = 0; i < rows.length; i += per) {
  k++;
  const chunk = rows.slice(i, i + per);
  const OW = Math.max(...chunk.map(r => r.W)) * S;
  const GAP = 8;
  const OH = chunk.reduce((s, r) => s + r.H * S + GAP, 0);
  const cv = Buffer.alloc(OW * OH * 4, 255);
  let oy = 0;
  console.log(`SHEET ${k} : ${out.replace(/\.png$/, '_' + k + '.png')}`);
  for (const r of chunk) {
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const g = 255 - r.data[y * r.W + x];
      if (g < 250) for (let a = 0; a < S; a++) for (let b2 = 0; b2 < S; b2++) {
        const i2 = ((oy + y * S + a) * OW + (x * S + b2)) * 4; cv[i2] = g; cv[i2 + 1] = g; cv[i2 + 2] = g; cv[i2 + 3] = 255;
      }
    }
    console.log('  ' + r.name);
    oy += r.H * S + GAP;
  }
  writePNG(out.replace(/\.png$/, '_' + k + '.png'), OW, OH, cv);
}
console.error(`total ${rows.length} files, ${k} sheets`);
