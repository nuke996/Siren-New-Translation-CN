#!/usr/bin/env node
const __P = require('./_config.js');
// Render the 15 hud/launcher/label messages by pasting glyph cells from the
// label atlas (28 cols x 5 rows, cell 18x22, ink origin y+4) so the Japanese
// can be read without any char->cell label DB.
// usage: node _labelrender.js
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const D = `${__P.WORK}/`;

const DAT = process.argv[2] || (D + 'label.dat');
const DDS = process.argv[3] || (D + 'label.dds');
const OUTDIR = process.argv[4] || 'labelmsg';
const dat = fs.readFileSync(DAT);
const ddsRaw = fs.readFileSync(DDS);
const d = parseDDS(ddsRaw);
const rgba = decodeDXT1(ddsRaw, d.width, d.height, d.dataOffset);
const lum = new Uint8Array(d.width * d.height);
for (let i = 0; i < d.width * d.height; i++) lum[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);

const COLS = 28, ROWS = 5, PX = 18, PY = 22, Y0 = 4;
const NC = COLS * ROWS; // 140
function cellPixel(g, x, y) {
  const row = Math.floor(g / COLS), col = g % COLS;
  const sx = col * PX + x, sy = row * PY + Y0 + y;
  if (sx < 0 || sy < 0 || sx >= d.width || sy >= d.height) return 0;
  return lum[sy * d.width + sx];
}

// --- parse FONTDATA (big endian) ---
const magic = dat.toString('latin1', 0, 8);
if (magic !== 'FONTDATA') throw new Error('bad magic ' + magic);
const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) {
  recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
}
const nameStart = Math.min(...recs.map(r => r.nameOff));
function nameOf(off) { let e = off; while (dat[e] !== 0) e++; return dat.toString('utf8', off, e); }
recs.sort((a, b) => a.dataOff - b.dataOff);
recs.forEach((r, i) => { r.name = nameOf(r.nameOff); r.next = i + 1 < recs.length ? recs[i + 1].dataOff : dat.length; });

// --- body parser (verified grammar: per-segment width precedes its glyphs) ---
function parseBody(start) {
  const flag = dat.readUInt16BE(start);
  const N = flag >> 8;
  let p = start + 2 + 2 * N + 6;   // flag | widths | FFFD op FFFC  -> at w[0]
  const segs = [];
  for (let k = 0; k < N; k++) {
    if (k > 0) p += 4;             // FFFE FFFC
    p += 2;                        // segment width
    const g = [];
    while (p + 1 < dat.length) {
      const v = dat.readUInt16BE(p);
      if (v === 0xffff || v === 0xfffe) break;
      if (v === 0xfffd || v === 0xfffb) { p += 4; continue; }
      if (v === 0xfffc) { p += 2; continue; }
      if (v < 0xff00) { g.push(v); p += 2; continue; }
      p += 2;
    }
    segs.push(g);
  }
  return segs;
}

// --- render each message: wrap at 40 glyphs, cell kept 18x20 ---
const CW = PX, CH = 20, WRAP = 40, GAPX = 2, GAPY = 6;
const msgImgs = [];
for (const r of recs) {
  const segs = parseBody(r.dataOff);
  const nowrap = process.argv.includes('--nowrap');
  const rows = [];
  for (const s of segs) {
    if (nowrap) rows.push(s);
    else for (let k = 0; k < s.length; k += WRAP) rows.push(s.slice(k, k + WRAP));
  }
  if (!rows.length) rows.push([]);
  const maxLen = Math.max(...rows.map(x => x.length));
  const w = maxLen * (CW + GAPX), h = rows.length * (CH + GAPY);
  const img = Buffer.alloc(w * h * 4, 255);
  for (let i = 3; i < img.length; i += 4) img[i] = 255;
  rows.forEach((rowG, ri) => rowG.forEach((g, ci) => {
    const ox = ci * (CW + GAPX), oy = ri * (CH + GAPY);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const v = cellPixel(g, x, y) > 60 ? 0 : 255;
      const tx = ox + x, ty = oy + y;
      if (tx < w && ty < h) { const p = (ty * w + tx) * 4; img[p] = v; img[p + 1] = v; img[p + 2] = v; }
    }
  }));
  const file = D + OUTDIR + '/' + r.name.replace(/[^\w]/g, '_') + '.png';
  fs.mkdirSync(D + OUTDIR, { recursive: true });
  writePNG(file, w, h, img);
  const nGlyphs = segs.reduce((a, s) => a + s.length, 0);
  msgImgs.push({ name: r.name, flag: dat.readUInt16BE(r.dataOff), segs: segs.map(s => s.length), nGlyphs, w, h, file });
  console.log(`[${recs.indexOf(r)}] ${r.name.padEnd(16)} flag=0x${dat.readUInt16BE(r.dataOff).toString(16)} glyphs=${nGlyphs} segs=[${segs.map(s => s.length).join(',')}] -> ${file.split('/').pop()} (${w}x${h})`);
}
fs.writeFileSync(D + OUTDIR + '/index.json', JSON.stringify(msgImgs, null, 1));
console.log('wrote', msgImgs.length, 'message images');