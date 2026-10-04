// Print ink row-bands (top,len) and column extent for A8 mask files.
// usage: node _bands.js <dds...>
'use strict';
const fs = require('fs');
const { parseDDS } = require('./dds2png.js');
for (const p of process.argv.slice(2)) {
  const b = fs.readFileSync(p);
  const h = parseDDS(b);
  const W = h.width, H = h.height;
  const data = b.subarray(h.dataOffset, h.dataOffset + W * H);
  const rows = [];
  for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) if (data[y * W + x] > 16) c++; rows.push(c); }
  const bands = []; let s = -1;
  for (let y = 0; y < H; y++) {
    if (rows[y] > 0 && s < 0) s = y;
    if ((rows[y] === 0 || y === H - 1) && s >= 0) { const e = rows[y] === 0 ? y - 1 : y; bands.push([s, e]); s = -1; }
  }
  const out = bands.map(([a, b2]) => {
    let x0 = 1e9, x1 = -1;
    for (let y = a; y <= b2; y++) for (let x = 0; x < W; x++) if (data[y * W + x] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    return `y${a}..${b2}(h${b2 - a + 1}) x${x0}..${x1}`;
  });
  console.log(`${p.split(/[\\/]/).pop()}  ${W}x${H}  bands=${bands.length}  ` + out.join(' | '));
}