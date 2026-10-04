#!/usr/bin/env node
const __P = require('./_config.js');
// End-to-end font check: map a UTF-8 string through the DEPLOYED fontidexu8.tbl and draw
// it from the DEPLOYED font01.dds, to prove the runtime text path resolves our Chinese.
// usage: node _frender.js "<text>"
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const { parseHed } = require('./sntp_pack.js');

const HDD = `${__P.HDD}/`;
const W = `${__P.WORK}/`;
const idx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const dat = fs.readFileSync(HDD + 'common.dat');
const ent = n => { const e = idx.entries.find(x => x.name === n); return dat.subarray(e.off, e.off + e.size); };

const tb = ent('fontidexu8.tbl');
const byChar = {};
for (let o = 2000; o + 8 <= tb.length; o += 8) {
  const raw = Buffer.from([tb[o], tb[o + 1], tb[o + 2], tb[o + 3]]).reverse();
  const s = raw.toString('utf8');
  if (s.includes('\uFFFD')) continue;
  const c = s.replace(/\0+$/g, '');
  if (!c) continue;
  if (byChar[c] === undefined) byChar[c] = tb.readUInt32BE(o + 4);
}
const sheet = ent('font01.dds');
const hdr = parseDDS(sheet);
const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);

const text = process.argv.slice(2).join(' ');
const CW = 20, CH = 20, COLS = 51, S = 4;
const items = [...text].map(c => ({ c, g: byChar[c] }));
const Wpx = items.length * (CW * S) + 8, Hpx = CH * S + 8;
const out = Buffer.alloc(Wpx * Hpx * 4, 255);
let miss = [];
items.forEach((it, k) => {
  if (it.g === undefined) { miss.push(it.c); return; }
  const col = it.g % COLS, row = Math.floor(it.g / COLS);
  for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) {
    const sx = col * CW + Math.floor(x / S), sy = row * CH + Math.floor(y / S);
    if (sx >= hdr.width || sy >= hdr.height) continue;
    const si = (sy * hdr.width + sx) * 4;
    const l = Math.round(0.299 * rgba[si] + 0.587 * rgba[si + 1] + 0.114 * rgba[si + 2]);
    const dx = 4 + k * (CW * S) + x, dy = 4 + y;
    const o = (dy * Wpx + dx) * 4;
    out[o] = out[o + 1] = out[o + 2] = 255 - l; out[o + 3] = 255;
  }
});
writePNG(W + '_frender.png', Wpx, Hpx, out);
console.log('text: ' + JSON.stringify(text));
console.log('unmapped chars: ' + (miss.length ? miss.join('') : '(none)'));
console.log('wrote work/_frender.png');