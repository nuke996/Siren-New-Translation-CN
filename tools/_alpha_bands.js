#!/usr/bin/env node
// Print row/col bands where DXT5 alpha > threshold, plus the overall bbox.
// usage: node _alpha_bands.js <in.dds> [yMax] [thr]
'use strict';
const fs = require('fs');
const [inp, yMaxS, thrS] = process.argv.slice(2);
const YMAX = yMaxS ? +yMaxS : 1e9, THR = thrS ? +thrS : 128;
const buf = fs.readFileSync(inp);
const W = buf.readUInt32LE(16), H = buf.readUInt32LE(12);
const bw = Math.ceil(W / 4), bh = Math.ceil(H / 4);
const A = new Uint8Array(W * H);
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
    if (x < W && y < H) A[y * W + x] = av[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)];
  }
}
console.log(`${inp} ${W}x${H} (alpha bands, y<${YMAX}, thr=${THR})`);
const rows = [];
for (let y = 0; y < Math.min(H, YMAX); y++) {
  let x0 = -1, x1 = -1, n = 0;
  for (let x = 0; x < W; x++) if (A[y * W + x] > THR) { if (x0 < 0) x0 = x; x1 = x; n++; }
  rows.push({ y, x0, x1, n });
}
let s = -1;
for (let i = 0; i < rows.length; i++) {
  if (rows[i].n > 0 && s < 0) s = i;
  if ((rows[i].n === 0 || i === rows.length - 1) && s >= 0) {
    const e = rows[i].n === 0 ? i - 1 : i;
    let xa = 1e9, xb = -1;
    for (let k = s; k <= e; k++) { if (rows[k].x0 < xa) xa = rows[k].x0; if (rows[k].x1 > xb) xb = rows[k].x1; }
    console.log(`  band y=${s}..${e} (h${e - s + 1}) x=${xa}..${xb} (w${xb - xa + 1})`);
    s = -1;
  }
}