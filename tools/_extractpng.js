#!/usr/bin/env node
const __P = require('./_config.js');
// Extract A8 mask entries matching a name pattern and render each as a
// white-paper grayscale PNG (text readable). Names get a prefix + index so
// rdown/rright (same basename) do not collide.
// usage: node _extractpng.js <arch> <nameContains> <outDir> <prefix>
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeRaw, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const [arch, contains, outDir, prefix] = process.argv.slice(2);
const idx = parseHed(fs.readFileSync(BASE + arch + '.hed'));
const dat = fs.readFileSync(BASE + arch + '.dat');
fs.mkdirSync(outDir, { recursive: true });
const hits = idx.entries.filter(e => e.name.includes(contains) && e.name.endsWith('.dds'));
const index = [];
hits.forEach((e, i) => {
  const buf = Buffer.from(dat.subarray(e.off, e.off + e.size));
  const hdr = parseDDS(buf);
  const W = hdr.width, H = hdr.height;
  const rgba = decodeRaw(buf, W, H, hdr.dataOffset, hdr.rgbBitCount || 8, hdr);
  for (let k = 0; k < W * H; k++) { const g = 255 - rgba[k * 4 + 3]; rgba[k * 4] = g; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = g; rgba[k * 4 + 3] = 255; }
  const name = `${prefix}_${String(i + 1).padStart(2, '0')}`;
  writePNG(path.join(outDir, name + '.png'), W, H, rgba);
  fs.writeFileSync(path.join(outDir, name + '.dds'), buf);
  index.push({ name, entry: e.name, file: path.join(outDir, name + '.dds'), W, H, size: e.size });
  console.log(name, e.name, `${W}x${H}`, e.size);
});
fs.writeFileSync(path.join(outDir, prefix + '_index.json'), JSON.stringify(index, null, 1));
console.log('items', index.length, '->', path.join(outDir, prefix + '_index.json'));