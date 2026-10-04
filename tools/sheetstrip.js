#!/usr/bin/env node
// Render a horizontal strip of a glyph sheet (rows r0..r1) at a given scale, on white,
// so the glyphs can be read/transcribed. Adds a thin separator between cells.
// Usage: node sheetstrip.js <sheet.dds> <cols> <cellW> <cellH> <r0> <r1> <scale> <out.png>
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw, writePNG } = require('./dds2png.js');
const b = fs.readFileSync(process.argv[2]);
const hdr = parseDDS(b);
const fourCC = hdr.fourCC.replace(/\0/g, '').trim();
const rgba = (fourCC === 'DXT1') ? decodeDXT1(b, hdr.width, hdr.height, hdr.dataOffset)
  : decodeRaw(b, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 32, hdr);
const W = hdr.width;
const COLS = +process.argv[3], CW = +process.argv[4], CH = +process.argv[5];
const r0 = +process.argv[6], r1 = +process.argv[7], S = +process.argv[8], out = process.argv[9];
const rows = r1 - r0 + 1;
const ow = COLS * CW * S, oh = rows * CH * S;
const cv = Buffer.alloc(ow * oh * 4, 255);
for (let rr = 0; rr < rows; rr++) for (let c = 0; c < COLS; c++) {
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const sx = c * CW + x, sy = (r0 + rr) * CH + y;
    let v = 255;
    if (sx < W && sy < hdr.height) { const p = (sy * W + sx) * 4; v = (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3; }
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const d = (((rr * CH + y) * S + yy) * ow + (c * CW + x) * S + xx) * 4;
      cv[d] = cv[d + 1] = cv[d + 2] = v; cv[d + 3] = 255;
    }
  }
}
// separators
for (let rr = 0; rr <= rows; rr++) for (let x = 0; x < ow; x++) { const y = rr * CH * S; if (y < oh) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = 200; } }
for (let c = 0; c <= COLS; c++) for (let y = 0; y < oh; y++) { const x = c * CW * S; if (x < ow) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = 200; } }
writePNG(out, ow, oh, cv);
console.log('wrote', out, ow + 'x' + oh, 'rows', r0 + '..' + r1);