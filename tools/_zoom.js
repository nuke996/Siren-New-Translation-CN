#!/usr/bin/env node
// Crop+scale a region of an A8 mask dds to a PNG (for identifying button icons).
// usage: node _zoom.js <in.dds> <x> <y> <w> <h> <scale> <out.png>
'use strict';
const fs = require('fs');
const { writePNG } = require('./dds2png.js');
const [inp, xs, ys, ws, hs, ss, out] = process.argv.slice(2);
const x = +xs, y = +ys, w = +ws, h = +hs, s = +ss || 4;
const buf = fs.readFileSync(inp);
const W = buf.readUInt32LE(16), H = buf.readUInt32LE(12);
const data = buf.subarray(128, 128 + W * H);
const OW = w * s, OH = h * s;
const cv = Buffer.alloc(OW * OH * 4, 255);
for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
  const sx = x + xx, sy = y + yy;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
  const g = 255 - data[sy * W + sx];
  for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
    const i = ((yy * s + a) * OW + (xx * s + b)) * 4;
    cv[i] = g; cv[i + 1] = g; cv[i + 2] = g; cv[i + 3] = 255;
  }
}
writePNG(out, OW, OH, cv);
console.log('wrote', out, OW + 'x' + OH);