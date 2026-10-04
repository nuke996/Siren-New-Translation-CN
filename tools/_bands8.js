// Print ink row-bands (and per-band x-extent) of an A8 DDS mask.
// usage: node _bands8.js <file.dds> [thr=16]
'use strict';
const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
const thr = parseInt(process.argv[3] || '16', 10);
const W = b.readUInt32LE(16), H = b.readUInt32LE(12), bpp = b.readUInt32LE(88);
if (bpp !== 8) { console.log('not A8 (bpp=' + bpp + ')'); process.exit(1); }
const d = b.subarray(128, 128 + W * H);
console.log(`${W}x${H} thr=${thr}`);
let inb = false, y0 = 0;
for (let y = 0; y < H; y++) {
  let n = 0, x0 = W, x1 = -1;
  for (let x = 0; x < W; x++) if (d[y * W + x] > thr) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const on = n > 0;
  if (on && !inb) { inb = true; y0 = y; }
  if (!on && inb) { inb = false; console.log(`  band y=${y0}..${y - 1} (h=${y - y0})`); }
  if (on && y === H - 1) { inb = false; console.log(`  band y=${y0}..${y} (h=${y - y0 + 1})`); }
}
