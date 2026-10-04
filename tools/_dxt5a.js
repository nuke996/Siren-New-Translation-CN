#!/usr/bin/env node
// Render a DXT5 DDS's ALPHA channel as grayscale (icons are often alpha masks).
// usage: node _dxt5a.js <in.dds> <out.png> [x y w h scale]
'use strict';
const fs = require('fs');
const { writePNG } = require('./dds2png.js');
const [inp, out, xs, ys, ws, hs, ss] = process.argv.slice(2);
const buf = fs.readFileSync(inp);
const W = buf.readUInt32LE(16), H = buf.readUInt32LE(12);
const bw = Math.ceil(W / 4), bh = Math.ceil(H / 4);
const alpha = Buffer.alloc(W * H);
let off = 128;
const a = new Array(8);
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  a[0] = buf[off]; a[1] = buf[off + 1];
  if (a[0] > a[1]) { for (let i = 2; i < 8; i++) a[i] = Math.round(((8 - i) * a[0] + (i - 1) * a[1]) / 7); }
  else { for (let i = 2; i < 6; i++) a[i] = Math.round(((6 - i) * a[0] + (i - 1) * a[1]) / 5); a[6] = 0; a[7] = 255; }
  const abits = BigInt(buf.readUInt32LE(off + 2)) | (BigInt(buf.readUInt32LE(off + 6)) << 32n);
  off += 16;
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
    const x = bx * 4 + px, y = by * 4 + py;
    if (x >= W || y >= H) continue;
    alpha[y * W + x] = a[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)];
  }
}
let X = 0, Y = 0, CW = W, CH = H, S = 1;
if (ws) { X = +xs; Y = +ys; CW = +ws; CH = +hs; S = +ss || 1; }
const ow = CW * S, oh = CH * S;
const o = Buffer.alloc(ow * oh * 4, 255);
for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
  const sx = X + Math.floor(x / S), sy = Y + Math.floor(y / S);
  if (sx >= W || sy >= H) continue;
  const g = 255 - alpha[sy * W + sx];
  const i = (y * ow + x) * 4; o[i] = o[i + 1] = o[i + 2] = g; o[i + 3] = 255;
}
writePNG(out, ow, oh, o);
console.log(`alpha ${W}x${H} -> ${out} ${ow}x${oh}`);