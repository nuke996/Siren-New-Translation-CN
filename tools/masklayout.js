// Row-band layout analysis for an 8-bit alpha-mask DDS (A8).
// usage: node masklayout.js <dds>
// Prints contiguous ink row-bands with their y range and x extent.
const fs = require('fs');
const { parseDDS } = require('./dds2png.js');
const p = process.argv[2];
const raw = fs.readFileSync(p);
const d = parseDDS(raw);
if (d.rgbBitCount !== 8) { console.log('not A8 (rgbBitCount=' + d.rgbBitCount + ')'); }
const W = d.width, H = d.height;
const data = raw.subarray(d.dataOffset, d.dataOffset + W * H);
function rowInk(y) { let n = 0, x0 = 1e9, x1 = -1, mx = 0; for (let x = 0; x < W; x++) { const v = data[y * W + x]; if (v > 16) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; } if (v > mx) mx = v; } return { n, x0, x1, mx }; }
const rows = [];
for (let y = 0; y < H; y++) rows.push(rowInk(y));
let band = null;
for (let y = 0; y < H; y++) {
  const ink = rows[y].n > 0;
  if (ink && !band) band = { y0: y, y1: y, x0: 1e9, x1: -1, n: 0, mx: 0 };
  if (ink && band) {
    band.y1 = y;
    if (rows[y].x0 < band.x0) band.x0 = rows[y].x0;
    if (rows[y].x1 > band.x1) band.x1 = rows[y].x1;
    band.n += rows[y].n; if (rows[y].mx > band.mx) band.mx = rows[y].mx;
  }
  if (!ink && band) { print(band); band = null; }
}
if (band) print(band);
function print(b) {
  console.log(`band y=${b.y0}..${b.y1} (h=${b.y1 - b.y0 + 1}) x=${b.x0}..${b.x1} (w=${b.x1 - b.x0 + 1}) inkpix=${b.n} maxA=${b.mx}`);
}
console.log(`size ${W}x${H}, bands=${'above'}, colors: alpha-only=${d.aMask === 0xff}`);