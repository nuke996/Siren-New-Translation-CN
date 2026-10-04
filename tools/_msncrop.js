#!/usr/bin/env node
// Crop + upscale a DXT1 atlas region to PNG for inspection.
// usage: node _msncrop.js <dds> <x> <y> <w> <h> <scale> <out.png>
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const [dds, xs, ys, ws, hs, ss, out] = process.argv.slice(2);
const x0 = +xs, y0 = +ys, w = +ws, h = +hs, S = +ss;
const buf = fs.readFileSync(dds);
const hdr = parseDDS(buf);
const rgba = decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset);
const W = w * S, H = h * S;
const o = Buffer.alloc(W * H * 4, 255);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const sx = x0 + Math.floor(x / S), sy = y0 + Math.floor(y / S);
  if (sx >= hdr.width || sy >= hdr.height) continue;
  const si = (sy * hdr.width + sx) * 4;
  const di = (y * W + x) * 4;
  o[di] = rgba[si]; o[di + 1] = rgba[si + 1]; o[di + 2] = rgba[si + 2]; o[di + 3] = 255;
}
writePNG(out, W, H, o);
console.log(`crop ${x0},${y0} ${w}x${h} x${S} -> ${out}`);