#!/usr/bin/env node
// Contact sheet from a list of A8 mask .dds files (cropped to ink, stacked).
// usage: node _dssheet.js <outPng> <a.dds> <b.dds> ...
'use strict';
const fs = require('fs');
const { writePNG } = require('./dds2png.js');
let [out, ...files] = process.argv.slice(2);
let S = 1;
if (out.startsWith('--scale=')) { S = Number(out.split('=')[1]); out = files.shift(); }
const items = files.map(f => {
  const b = fs.readFileSync(f);
  const W = b.readUInt32LE(16), H = b.readUInt32LE(12);
  const data = b.subarray(128, 128 + W * H);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[y * W + x] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1; }
  return { f, W, H, data, x0, x1, y0, y1 };
});
const GAP = 6;
const OW = Math.max(...items.map(i => (i.x1 - i.x0 + 1))) * S;
const OH = items.reduce((s, i) => s + (i.y1 - i.y0 + 1) * S + GAP, 0);
const cv = Buffer.alloc(OW * OH * 4, 255);
let oy = 0;
for (const it of items) {
  for (let y = it.y0; y <= it.y1; y++) for (let x = it.x0; x <= it.x1; x++) {
    const g = 255 - it.data[y * it.W + x];
    if (g < 250) for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const i2 = (((oy + (y - it.y0) * S + a)) * OW + ((x - it.x0) * S + b)) * 4; cv[i2] = g; cv[i2 + 1] = g; cv[i2 + 2] = g; cv[i2 + 3] = 255;
    }
  }
  console.log(it.f.split(/[\\/]/).pop().padEnd(20), `${it.W}x${it.H}`, `ink w=${it.x1 - it.x0 + 1} h=${it.y1 - it.y0 + 1} x0=${it.x0} y0=${it.y0}`);
  oy += (it.y1 - it.y0 + 1) * S + GAP;
}
writePNG(out, OW, OH, cv);
console.log('wrote', out, OW + 'x' + OH);