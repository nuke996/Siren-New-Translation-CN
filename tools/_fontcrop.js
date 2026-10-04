#!/usr/bin/env node
const __P = require('./_config.js');
// Crop font01.dds glyph slots (via fontidexu8.tbl char->glyph) into a PNG strip, to confirm
// the atlas<->table mapping is coherent. usage: node _fontcrop.js <char1> <char2> ...
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const W = `${__P.WORK}/`;
const tb = fs.readFileSync(W + 'fontidexu8.tbl');
const byChar = {};
for (let o = 2000; o + 8 <= tb.length; o += 8) {
  const raw = Buffer.from([tb[o], tb[o + 1], tb[o + 2], tb[o + 3]]).reverse();
  const s = raw.toString('utf8');
  if (s.includes('\uFFFD')) continue;
  const t = s.replace(/\0+$/g, '');
  if (!t) continue;
  if (byChar[t] === undefined) byChar[t] = tb.readUInt32BE(o + 4);
}

const sheet = fs.readFileSync(process.env.FONT_DDS || (W + 'font01.dds'));
const hdr = parseDDS(sheet);
console.log('font01.dds', hdr.width + 'x' + hdr.height, 'fourcc=' + hdr.fourCC);
const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);

const CW = 20, CH = 20, COLS = 51, S = 6;
const chars = process.argv.slice(2);
const items = chars.map(c => /^\d+$/.test(c) ? { c: '#slot' + c, g: +c } : { c, g: byChar[c] });
const all = items;
const Wpx = all.length * (CW * S + 4) + 4, Hpx = CH * S + 8;
const out = Buffer.alloc(Wpx * Hpx * 4, 32);
all.forEach((it, k) => {
  if (it.g === undefined) { console.log(it.c + ' -> NO GLYPH'); return; }
  const col = it.g % COLS, row = Math.floor(it.g / COLS);
  console.log(it.c + ' -> glyph ' + it.g + ' (col' + col + ',row' + row + ')');
  for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) {
    const sx = col * CW + Math.floor(x / S), sy = row * CH + Math.floor(y / S);
    if (sx >= hdr.width || sy >= hdr.height) continue;
    const si = (sy * hdr.width + sx) * 4;
    const l = Math.round(0.299 * rgba[si] + 0.587 * rgba[si + 1] + 0.114 * rgba[si + 2]);
    const dx = 4 + k * (CW * S + 4) + x, dy = 4 + y;
    const o = (dy * Wpx + dx) * 4;
    out[o] = out[o + 1] = out[o + 2] = 255 - l; out[o + 3] = 255;
  }
});
writePNG(W + '_fontcrop.png', Wpx, Hpx, out);
console.log('wrote work/_fontcrop.png');