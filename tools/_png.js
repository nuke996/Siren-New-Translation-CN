#!/usr/bin/env node
// Convert a DDS file (DXT1/DXT5 or raw) to PNG for inspection.
// usage: node _png.js <in.dds> <out.png> [scale]
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw, writePNG } = require('./dds2png.js');
const [inp, outp, sc] = process.argv.slice(2);
const S = Number(sc) || 1;
const raw = fs.readFileSync(inp);
const h = parseDDS(raw);
let rgba = h.fourCC === 'DXT1' ? decodeDXT1(raw, h.width, h.height, h.dataOffset)
  : decodeRaw(raw, h.width, h.height, h.dataOffset, h.fourCC);
const W = h.width, H = h.height;
if (S === 1) { writePNG(outp, W, H, rgba); }
else {
  const ow = W * S, oh = H * S, big = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const i = (Math.floor(y / S) * W + Math.floor(x / S)) * 4, o = (y * ow + x) * 4;
    big[o] = rgba[i]; big[o + 1] = rgba[i + 1]; big[o + 2] = rgba[i + 2]; big[o + 3] = rgba[i + 3];
  }
  writePNG(outp, ow, oh, big);
}
console.log(`${inp} ${W}x${H} ${h.fourCC || ('raw'+h.bpp)} -> ${outp}`);