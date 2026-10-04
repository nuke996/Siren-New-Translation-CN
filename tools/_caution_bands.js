#!/usr/bin/env node
// Print bright-pixel row/column bands of a DXT1 caution PNG (analyze text layout).
// usage: node _caution_bands.js <png...>
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function readPNG(p) {
  const b = fs.readFileSync(p);
  let off = 8, W = 0, H = 0, idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off); const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * 4 + 1;
  const lum = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * stride];
    for (let x = 0; x < W; x++) {
      const i = y * stride + 1 + x * 4;
      let r = raw[i], g = raw[i + 1], bl = raw[i + 2];
      if (f === 1) { /* Sub */ }
      // filters: none/up handled loosely; caution PNGs are filter 0 (no filter)
      lum[y * W + x] = Math.max(r, g, bl);
    }
  }
  return { W, H, lum };
}

for (const p of process.argv.slice(2)) {
  const { W, H, lum } = readPNG(p);
  const rowCnt = [], colMin = [], colMax = [];
  for (let y = 0; y < H; y++) { let n = 0, a = 1e9, c = -1; for (let x = 0; x < W; x++) if (lum[y * W + x] > 100) { n++; if (x < a) a = x; if (x > c) c = x; } rowCnt.push(n); colMin.push(a); colMax.push(c); }
  const bands = [];
  let s = -1;
  for (let y = 0; y < H; y++) {
    if (rowCnt[y] > 0 && s < 0) s = y;
    if ((rowCnt[y] === 0 || y === H - 1) && s >= 0) { const e = rowCnt[y] === 0 ? y - 1 : y; let xa = 1e9, xb = -1; for (let k = s; k <= e; k++) { if (colMin[k] < xa) xa = colMin[k]; if (colMax[k] > xb) xb = colMax[k]; } bands.push(`${s}..${e}(h${e - s + 1}) x${xa}..${xb}(w${xb - xa + 1})`); s = -1; }
  }
  console.log(p, `${W}x${H} bands=${bands.length}`); bands.forEach((b, i) => console.log('  ', i, b));
}