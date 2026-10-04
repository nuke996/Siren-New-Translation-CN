const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const D = `${__P.WORK}/`;
const raw = fs.readFileSync(D + 'label.dds');
const d = parseDDS(raw);
const W = d.width, H = d.height;
const rgba = decodeDXT1(raw, W, H, d.dataOffset);
const lum = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) lum[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
// grid: 28 cols x 5 rows, pitch 18 x 22, content band starts y=4
const COLS = 28, ROWS = 5, PX = 18, PY = 22, Y0 = 4;
const S = 4;
for (let r = 0; r < ROWS; r++) {
  const cw = 504, ch = PY;
  const ow = cw * S, oh = ch * S;
  const out = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const sx = Math.floor(x / S), sy = r * PY + Y0 + Math.floor(y / S);
    const v = (sy < H) ? (lum[sy * W + sx] > 60 ? 0 : 255) : 255;
    const i = (y * ow + x) * 4; out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
  }
  writePNG(D + `label_row${r}.png`, ow, oh, out);
  console.log(`row${r}: indices ${r * COLS}..${r * COLS + COLS - 1} -> label_row${r}.png`);
}