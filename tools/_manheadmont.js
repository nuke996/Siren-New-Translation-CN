#!/usr/bin/env node
const __P = require('./_config.js');
// Montage the in-game manual heading masks (A8) into one PNG for review.
// usage: node _manheadmont.js
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeRaw, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const W = `${__P.WORK}/`;

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const names = idx.entries.map(e => e.name).filter(n => /^menu\/jp\/main_manual\/small_subject\//.test(n)).sort();
console.log('entries: ' + names.length);
names.forEach((n, i) => console.log('  [' + i + '] ' + n));

const S = 1, PAD = 2, ROWH = 40;
const Wd = 520;
const Ht = names.length * (ROWH + PAD) + PAD;
const out = Buffer.alloc(Wd * Ht * 4, 255);
names.forEach((n, i) => {
  const e = idx.entries.find(x => x.name === n);
  const b = dat.subarray(e.off, e.off + e.size);
  const h = parseDDS(b);
  const rgba = decodeRaw(b, h.width, h.height, h.dataOffset, h.rgbBitCount || 8, h);
  const oy = PAD + i * (ROWH + PAD);
  for (let y = 0; y < Math.min(h.height, ROWH); y++) for (let x = 0; x < Math.min(h.width, Wd); x++) {
    const a = rgba[(y * h.width + x) * 4 + 3];
    const g = 255 - a;
    const di = ((oy + y) * Wd + x) * 4;
    out[di] = out[di + 1] = out[di + 2] = g;
  }
});
writePNG(W + '_manhead.png', Wd, Ht, out);
console.log('wrote ' + W + '_manhead.png  ' + Wd + 'x' + Ht);