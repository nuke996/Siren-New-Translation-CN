#!/usr/bin/env node
// Render a FONTDATA message by mapping its index list onto the paired .dds glyph sheet.
// Usage: node msgrender.js <msg.dat> <sheet.dds> <index|name> <out.png> [cols] [cellW] [cellH]
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw, writePNG } = require('./dds2png.js');

function loadRGBA(file) {
  const buf = fs.readFileSync(file);
  const hdr = parseDDS(buf);
  const fourCC = hdr.fourCC.replace(/\0/g, '').trim();
  const rgba = (fourCC === 'DXT1' || hdr.fourCC === '1TXD')
    ? decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset)
    : decodeRaw(buf, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 32, hdr);
  return { hdr, rgba };
}

const dat = process.argv[2], sheet = process.argv[3], which = process.argv[4], out = process.argv[5];
const COLS = +(process.argv[6] || 21), CW = +(process.argv[7] || 24), CH = +(process.argv[8] || 28);

const b = fs.readFileSync(dat);
const count = b.readUInt32BE(12);
const names = [], offs = [];
for (let i = 0; i < count; i++) {
  const no = b.readUInt32BE(16 + i * 8);
  offs.push(b.readUInt32BE(20 + i * 8));
  let s = no + 16, e = s; while (b[e] !== 0) e++;
  names.push(b.toString('latin1', s, e));
}
let idx = /^\d+$/.test(which) ? +which : names.indexOf(which);
if (idx < 0 || idx >= count) { console.error('entry not found:', which); process.exit(2); }

const s = offs[idx] + 16, e = (idx + 1 < count ? offs[idx + 1] : b.length) + 16;
const vals = [];
for (let o = s + 14; o + 1 < e; o += 2) vals.push(b.readUInt16BE(o));
console.log('entry', idx, names[idx], 'raw vals(' + vals.length + '):', vals.map(v => '0x' + v.toString(16)).join(' '));

// glyph indices = values that are not control codes (>=0xff00)
const glyphs = vals.filter(v => v < 0xff00);
console.log('glyph indices(' + glyphs.length + '):', glyphs.join(','));

const { hdr, rgba } = loadRGBA(sheet);
const W = hdr.width, H = hdr.height;
const rows = Math.ceil(glyphs.length / COLS);
const ow = COLS * CW, oh = rows * CH;
const canvas = Buffer.alloc(ow * oh * 4, 0);
for (let i = 0; i < glyphs.length; i++) {
  const g = glyphs[i];
  const gc = g % COLS, gr = Math.floor(g / COLS);
  const sx0 = gc * CW, sy0 = gr * CH;
  const dx0 = (i % COLS) * CW, dy0 = Math.floor(i / COLS) * CH;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const sx = sx0 + x, sy = sy0 + y;
    let r = 255, gg = 255, bb = 255;
    if (sx < W && sy < H) { const p = (sy * W + sx) * 4; r = rgba[p]; gg = rgba[p + 1]; bb = rgba[p + 2]; }
    const d = ((dy0 + y) * ow + (dx0 + x)) * 4;
    canvas[d] = r; canvas[d + 1] = gg; canvas[d + 2] = bb; canvas[d + 3] = 255;
  }
}
writePNG(out, ow, oh, canvas);
console.log('wrote', out, ow + 'x' + oh, '(cols=' + COLS + ' cell=' + CW + 'x' + CH + ')');