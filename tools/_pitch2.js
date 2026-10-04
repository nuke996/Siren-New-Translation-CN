'use strict';
// Measure glyph-grid pitch of a DXT1 glyph atlas sheet by ink projections.
// usage: node _pitch2.js <file.dds> [thresh]
const fs = require('fs');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const file = process.argv[2];
const TH = parseInt(process.argv[3] || '60', 10);
const raw = fs.readFileSync(file);
const d = parseDDS(raw);
const W = d.width, H = d.height;
const rgba = decodeDXT1(raw, W, H, d.dataOffset);
const lum = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) lum[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
console.log(`${file}  ${W}x${H}`);
// row bands
const rowInk = [];
for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (lum[y * W + x] > TH) n++; rowInk.push(n); }
const bands = []; let b = null;
for (let y = 0; y < H; y++) { if (rowInk[y] > 0 && !b) b = { y0: y }; if (rowInk[y] === 0 && b) { b.y1 = y - 1; bands.push(b); b = null; } }
if (b) { b.y1 = H - 1; bands.push(b); }
console.log('row bands (y0..y1,h):', bands.map(x => `${x.y0}..${x.y1}(${x.y1 - x.y0 + 1})`).join(' '));
// column empty runs
const colInk = [];
for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) if (lum[y * W + x] > TH) n++; colInk.push(n); }
let runs = [], cur = null;
for (let x = 0; x < W; x++) { if (colInk[x] === 0) { if (!cur) cur = { x0: x }; cur.x1 = x; } else if (cur) { runs.push(cur); cur = null; } }
if (cur) runs.push(cur);
console.log('empty col runs (x0..x1,len):', runs.map(r => `${r.x0}..${r.x1}(#${r.x1 - r.x0 + 1})`).join(' '));
// autocorrelation of colInk over lags 10..40
let best = [];
for (let lag = 10; lag <= 40; lag++) {
  let s = 0, n = 0;
  for (let x = 0; x + lag < W; x++) { s += colInk[x] * colInk[x + lag]; n++; }
  best.push({ lag, score: s / n });
}
best.sort((a, b) => b.score - a.score);
console.log('top col-pitch lags:', best.slice(0, 6).map(x => `lag${x.lag}=${x.score.toFixed(0)}`).join(' '));
// column ink profile summary (first 60 cols)
console.log('colInk[0..63]:', Array.from(colInk.slice(0, 64)).join(','));