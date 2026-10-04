#!/usr/bin/env node
// Measure the true cell grid of a glyph sheet by ink projection.
// usage: node sheetgeom.js <sheet.dds> [cols] [rows]
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw } = require('./dds2png.js');

const b = fs.readFileSync(process.argv[2]);
const h = parseDDS(b);
const fourCC = h.fourCC.replace(/\0/g, '').trim();
const rgba = fourCC === 'DXT1' ? decodeDXT1(b, h.width, h.height, h.dataOffset)
  : decodeRaw(b, h.width, h.height, h.dataOffset, h.rgbBitCount || 32, h);
const W = h.width, H = h.height;
const colInk = new Int32Array(W), rowInk = new Int32Array(H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = (y * W + x) * 4;
  const l = (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3 > 128 ? 1 : 0;
  if (l) { colInk[x]++; rowInk[y]++; }
}
function gaps(arr) {
  const runs = [];
  let s = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) { if (s < 0) s = i; }
    else { if (s >= 0) { runs.push([s, i - 1, i - s]); s = -1; } }
  }
  if (s >= 0) runs.push([s, arr.length - 1, arr.length - s]);
  return runs;
}
console.log('size', W + 'x' + H);
const cg = gaps(colInk).filter(r => r[2] >= 2);
const rg = gaps(rowInk).filter(r => r[2] >= 2);
console.log('column zero-runs (start,end,len):', JSON.stringify(cg));
console.log('row zero-runs (start,end,len):', JSON.stringify(rg));
// estimate pitch from first few separator centers
const cc = cg.map(r => (r[0] + r[1]) / 2);
const rr = rg.map(r => (r[0] + r[1]) / 2);
console.log('col gap centers:', JSON.stringify(cc));
console.log('row gap centers:', JSON.stringify(rr));
if (cc.length >= 3) console.log('avg col pitch between gap centers:', ((cc[cc.length - 1] - cc[0]) / (cc.length - 1)).toFixed(3));
if (rr.length >= 3) console.log('avg row pitch between gap centers:', ((rr[rr.length - 1] - rr[0]) / (rr.length - 1)).toFixed(3));