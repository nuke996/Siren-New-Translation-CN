const __P = require('./_config.js');
'use strict';
// Dump a single original archive text page (A8) cropped to its ink box, 1x.
// usage: node _archpage.js <NN> [page]   (reads PS3_GAME originals)
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}/`;
const OUT = WORK + 'archpage/';
const nn = process.argv[2];
const page = process.argv[3] || '1';
let b, name, outName;
if (/\.dds$/i.test(nn) && fs.existsSync(nn)) {
  b = fs.readFileSync(nn); name = nn; outName = path.basename(nn).replace(/\.dds$/i, '');
} else {
  const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  const dat = fs.readFileSync(BASE + 'common.dat');
  name = `menu/jp/main_archive/archives/${nn}/a${nn}_text_${page}.dds`;
  const e = idx.entries.find(x => x.name === name);
  if (!e) { console.log('NOT FOUND', name); process.exit(1); }
  b = dat.subarray(e.off, e.off + e.size);
  outName = `a${nn}_text_${page}`;
}
const hdr = parseDDS(b); const W = hdr.width, H = hdr.height, off = hdr.dataOffset;
let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (b[off + y * W + x] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
if (x1 < 0) { x0 = y0 = 0; x1 = 10; y1 = 10; }
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const img = Buffer.alloc(cw * ch * 4, 255);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const g = 255 - b[off + (y0 + y) * W + (x0 + x)]; const i = (y * cw + x) * 4; img[i] = img[i + 1] = img[i + 2] = g; }
fs.mkdirSync(OUT, { recursive: true });
writePNG(OUT + `${outName}.png`, cw, ch, img);
console.log(`${name}  ink ${cw}x${ch}  y[${y0}..${y1}] -> ${OUT}${outName}.png`);
