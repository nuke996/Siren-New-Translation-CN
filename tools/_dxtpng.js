#!/usr/bin/env node
// Decode a DXT5 DDS to PNG (or print header). usage: node _dxtpng.js <in.dds> <out.png>
'use strict';
const fs = require('fs');
const { writePNG } = require('./dds2png.js');
const [inp, out, cx, cy, cw, ch, cs] = process.argv.slice(2);
const buf = fs.readFileSync(inp);
const fc = buf.toString('ascii', 84, 88);
const W = buf.readUInt32LE(16), H = buf.readUInt32LE(12);
console.log('fourCC', fc, W + 'x' + H);
if (!out) process.exit(0);
const bw = Math.ceil(W / 4), bh = Math.ceil(H / 4);
const rgba = Buffer.alloc(W * H * 4);
let off = 128;
const a = new Array(8), c = new Array(4);
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  a[0] = buf[off]; a[1] = buf[off + 1];
  if (a[0] > a[1]) { for (let i = 2; i < 8; i++) a[i] = Math.round(((8 - i) * a[0] + (i - 1) * a[1]) / 7); }
  else { for (let i = 2; i < 6; i++) a[i] = Math.round(((6 - i) * a[0] + (i - 1) * a[1]) / 5); a[6] = 0; a[7] = 255; }
  let abits = buf.readUInt32LE(off + 2) | (buf.readUInt32LE(off + 6) << 32);
  abits = BigInt(buf.readUInt32LE(off + 2)) | (BigInt(buf.readUInt32LE(off + 6)) << 32n);
  const c0 = buf.readUInt16LE(off + 8), c1 = buf.readUInt16LE(off + 10);
  let cbits = buf.readUInt32LE(off + 12);
  off += 16;
  const uc = v => { let r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31; return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]; };
  const p0 = uc(c0), p1 = uc(c1);
  c[0] = [p0[0], p0[1], p0[2]]; c[1] = [p1[0], p1[1], p1[2]];
  if (c0 > c1) { c[2] = [(2 * p0[0] + p1[0]) / 3, (2 * p0[1] + p1[1]) / 3, (2 * p0[2] + p1[2]) / 3]; c[3] = [(p0[0] + 2 * p1[0]) / 3, (p0[1] + 2 * p1[1]) / 3, (p0[2] + 2 * p1[2]) / 3]; }
  else { c[2] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]; c[3] = [0, 0, 0]; }
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
    const x = bx * 4 + px, y = by * 4 + py;
    if (x >= W || y >= H) continue;
    const ai = Number((abits >> BigInt(3 * (py * 4 + px))) & 7n);
    const ci = (cbits >> (2 * (py * 4 + px))) & 3;
    const d = (y * W + x) * 4;
    rgba[d] = Math.round(c[ci][0]); rgba[d + 1] = Math.round(c[ci][1]); rgba[d + 2] = Math.round(c[ci][2]);
    rgba[d + 3] = a[ai];
  }
}
if (cw) {
  const X = +cx, Y = +cy, CW = +cw, CH = +ch, S = +cs || 1;
  const ow = CW * S, oh = CH * S;
  const crop = Buffer.alloc(ow * oh * 4, 255);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const sx = X + x, sy = Y + y;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const d = (sy * W + sx) * 4;
    for (let a2 = 0; a2 < S; a2++) for (let b2 = 0; b2 < S; b2++) {
      const i = ((y * S + a2) * ow + (x * S + b2)) * 4;
      crop[i] = rgba[d]; crop[i + 1] = rgba[d + 1]; crop[i + 2] = rgba[d + 2]; crop[i + 3] = 255;
    }
  }
  writePNG(out, ow, oh, crop);
  console.log('wrote crop', out, ow + 'x' + oh);
} else {
  writePNG(out, W, H, rgba);
  console.log('wrote', out);
}