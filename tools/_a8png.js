// Render an 8-bit alpha-only DDS (A8 mask) as a visible grayscale PNG (text = dark on white).
// usage: node _a8png.js <in.dds> [out.png]
'use strict';
const fs = require('fs');
const { parseDDS, decodeRaw, writePNG } = require('./dds2png.js');

const src = process.argv[2];
const dst = process.argv[3] || src.replace(/\.[^.\\/]+$/, '') + '.gray.png';
const buf = fs.readFileSync(src);
const hdr = parseDDS(buf);
const rgba = decodeRaw(buf, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 8, hdr);
for (let i = 0; i < hdr.width * hdr.height; i++) {
  const a = rgba[i * 4 + 3];          // alpha byte = mask value
  const g = 255 - a;                  // white paper, dark ink
  rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255;
}
writePNG(dst, hdr.width, hdr.height, rgba);
console.log('wrote', dst, hdr.width + 'x' + hdr.height);