const __P = require('./_config.js');
'use strict';
// Dump all A8 mask entries whose name contains a substring to visible grayscale PNGs.
// usage: node _a8batch.js <substr> [outdir] [--all]
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeRaw, writePNG } = require('./dds2png.js');
const HDD = `${__P.HDD}/`;
const TEST = `${__P.DISC}/`;
const BASE = process.env.SNT_BASE || HDD;
const WORK = `${__P.WORK}/`;
const sub = process.argv[2];
const OUT = WORK + (process.argv[3] || 'uiprobe') + '/';
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
fs.mkdirSync(OUT, { recursive: true });
function cv(s, w) { const g = Math.max(1, w * 2); const q = Math.max(1, Math.ceil(s.length / g)); const lines = []; for (let i = 0; i < s.length; i += g) lines.push(s.slice(i, i + g)); return lines.join('\n'); }
let n = 0;
for (const e of idx.entries) {
  if (!e.name.includes(sub) || !e.name.endsWith('.dds')) continue;
  const b = dat.subarray(e.off, e.off + e.size);
  if (b.toString('ascii', 0, 4) !== 'DDS ') continue;
  const hdr = parseDDS(b);
  if ((hdr.rgbBitCount || 0) !== 8) continue;
  const safe = e.name.replace(/[^A-Za-z0-9_]+/g, '_');
  const rgba = decodeRaw(b, hdr.width, hdr.height, hdr.dataOffset, 8, hdr);
  for (let i = 0; i < hdr.width * hdr.height; i++) { const g = 255 - rgba[i * 4 + 3]; rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255; }
  writePNG(OUT + safe + '.png', hdr.width, hdr.height, rgba);
  console.log(`${hdr.width}x${hdr.height}  ${e.name}`);
  n++;
}
console.log('dumped', n, 'to', OUT);
