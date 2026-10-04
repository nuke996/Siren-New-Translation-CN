#!/usr/bin/env node
// Render the ALPHA channel of a DXT5 DDS as a gray PNG (255=transparent, 0=opaque -> g=255-a).
// usage: node _dxtalpha.js <in.dds> <out.png>
'use strict';
const fs = require('fs');
const { writePNG } = require('./dds2png.js');
const { execFileSync } = require('child_process');
const [inp, out] = process.argv.slice(2);
const buf = fs.readFileSync(inp);
const W = buf.readUInt32LE(16), H = buf.readUInt32LE(12);
const bw = Math.ceil(W / 4), bh = Math.ceil(H / 4);
const A = Buffer.alloc(W * H, 0);
let off = 128;
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  const a0 = buf[off], a1 = buf[off + 1];
  const abits = BigInt(buf.readUInt32LE(off + 2)) | (BigInt(buf.readUInt32LE(off + 6)) << 32n);
  const av = new Array(8); av[0] = a0; av[1] = a1;
  if (a0 > a1) { for (let i = 2; i < 8; i++) av[i] = Math.round(((8 - i) * a0 + (i - 1) * a1) / 7); }
  else { for (let i = 2; i < 6; i++) av[i] = Math.round(((6 - i) * a0 + (i - 1) * a1) / 5); av[6] = 0; av[7] = 255; }
  off += 16;
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
    const x = bx * 4 + px, y = by * 4 + py;
    if (x >= W || y >= H) continue;
    A[y * W + x] = av[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)];
  }
}
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { const g = 255 - A[i]; rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255; }
writePNG(out, W, H, rgba);
console.log('wrote alpha png', out, W + 'x' + H);