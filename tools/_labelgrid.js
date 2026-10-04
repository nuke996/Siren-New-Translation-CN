const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const D = `${__P.WORK}/`;
const raw = fs.readFileSync(D + 'label.dds');
const d = parseDDS(raw);
const W = d.width, H = d.height;
const rgba = decodeDXT1(raw, W, H, d.dataOffset);
const lum = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  lum[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
}
// row ink profile
const rowInk = [];
for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (lum[y * W + x] > 60) n++; rowInk.push(n); }
let band = null; const bands = [];
for (let y = 0; y < H; y++) {
  if (rowInk[y] > 0 && !band) band = { y0: y };
  if (rowInk[y] === 0 && band) { band.y1 = y - 1; bands.push(band); band = null; }
}
if (band) { band.y1 = H - 1; bands.push(band); }
console.log('row bands:', bands.map(b => `${b.y0}..${b.y1}(${b.y1 - b.y0 + 1})`).join(' '));
// column ink profile (overall)
const colInk = [];
for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) if (lum[y * W + x] > 60) n++; colInk.push(n); }
// find empty columns
let runs = [], cur = null;
for (let x = 0; x < W; x++) {
  if (colInk[x] === 0) { if (!cur) cur = { x0: x }; cur.x1 = x; }
  else if (cur) { runs.push(cur); cur = null; }
}
if (cur) runs.push(cur);
console.log('empty col runs:', runs.map(r => `${r.x0}..${r.x1}(${r.x1 - r.x0 + 1})`).join(' '));
// save a big preview PNG (x3) for reading
const { writePNG } = require('./dds2png.js');
const S = 3, ow = W * S, oh = H * S;
const big = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
  const sx = Math.floor(x / S), sy = Math.floor(y / S);
  const v = lum[sy * W + sx] > 60 ? 0 : 255;
  const i = (y * ow + x) * 4;
  big[i] = v; big[i + 1] = v; big[i + 2] = v; big[i + 3] = 255;
}
writePNG(D + 'label_big.png', ow, oh, big);
console.log('wrote label_big.png', ow + 'x' + oh);