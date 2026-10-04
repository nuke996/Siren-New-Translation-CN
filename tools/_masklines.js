const __P = require('./_config.js');
'use strict';
// Report ink line bands (y ranges + x extent) of A8 mask entries, to place translations.
// usage: node _masklines.js <name-substr> ...
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');
const HDD = `${__P.HDD}/`;
const BASE = process.env.SNT_BASE || HDD;
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
for (const sub of process.argv.slice(2)) {
  const e = idx.entries.find(x => x.name === sub) || idx.entries.find(x => x.name.includes(sub));
  if (!e) { console.log('NOT FOUND', sub); continue; }
  const b = dat.subarray(e.off, e.off + e.size);
  const hdr = parseDDS(b);
  const W = hdr.width, H = hdr.height, off = hdr.dataOffset;
  const prof = new Int32Array(H);
  let xmin = W, xmax = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = b[off + y * W + x];
    if (a > 24) { prof[y]++; if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
  }
  const bands = []; let s = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && prof[y] > 0;
    if (on && s < 0) s = y;
    if (!on && s >= 0) { bands.push([s, y - 1]); s = -1; }
  }
  const xb = []; let xs = -1;
  const colInk = new Int32Array(W);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (b[off + y * W + x] > 24) colInk[x]++;
  for (let x = 0; x <= W; x++) { const on = x < W && colInk[x] > 0; if (on && xs < 0) xs = x; if (!on && xs >= 0) { xb.push([xs, x - 1]); xs = -1; } }
  console.log(`${e.name}  ${W}x${H}  bands=${bands.length}  x[${xmin}..${xmax}]`);
  for (const [a, c] of bands) console.log(`   y ${a}..${c}  (h=${c - a + 1})`);
  console.log('   xbands: ' + xb.map(([a, c]) => a + '-' + c).join(' '));
}
