#!/usr/bin/env node
// Crop+scale a region of a PNG. usage: node _pngcrop.js <in.png> <x> <y> <w> <h> <scale> <out.png>
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const { writePNG } = require('./dds2png.js');

function readPNG(p) {
  const b = fs.readFileSync(p);
  let off = 8, W = 0, H = 0; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off); const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * 4 + 1;
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const f = raw[y * stride];
    for (let x = 0; x < W; x++) {
      const s = y * stride + 1 + x * 4, d = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const cur = raw[s + c];
        const a = x > 0 ? px[(y * W + x - 1) * 4 + c] : 0;
        const bb = y > 0 ? px[((y - 1) * W + x) * 4 + c] : 0;
        const cc = (x > 0 && y > 0) ? px[((y - 1) * W + x - 1) * 4 + c] : 0;
        let v;
        if (f === 0) v = cur;
        else if (f === 1) v = cur + a;
        else if (f === 2) v = cur + bb;
        else if (f === 3) v = cur + ((a + bb) >> 1);
        else { const p = a + bb - cc, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - cc); v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : cc); }
        px[d + c] = v & 0xFF;
      }
    }
  }
  return { W, H, px };
}

const [inp, xs, ys, ws, hs, ss, out] = process.argv.slice(2);
const x = +xs, y = +ys, w = +ws, h = +hs, s = +ss || 1;
const { W, px } = readPNG(inp);
const OW = w * s, OH = h * s;
const cv = Buffer.alloc(OW * OH * 4, 255);
for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
  const sx = x + xx, sy = y + yy;
  if (sx < 0 || sy < 0 || sx >= W) continue;
  const d = (sy * W + sx) * 4;
  for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
    const i = ((yy * s + a) * OW + (xx * s + b)) * 4;
    cv[i] = px[d]; cv[i + 1] = px[d + 1]; cv[i + 2] = px[d + 2]; cv[i + 3] = 255;
  }
}
writePNG(out, OW, OH, cv);
console.log('wrote', out, OW + 'x' + OH);