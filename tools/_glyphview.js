#!/usr/bin/env node
// Print a subtitle record's glyph-cell indices AND render the ORIGINAL atlas cells
// as an upscaled PNG strip, so the true (original) glyphs can be read by eye.
// usage: node _glyphview.js <dat> <dds> <recordName> [out.png]
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const CW = 24, CH = 28, COLS = 21;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const [datPath, ddsPath, recName, outPng] = process.argv.slice(2);
const buf = fs.readFileSync(datPath);
const count = buf.readUInt32BE(12);
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
function readMsg(b, a) { const i = b.indexOf(MARK, a); let p = i + MARK.length + 2; const out = []; while (p + 1 < b.length) { const v = b.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; out.push(v); } return out; }
let cells = null;
for (let i = 0; i < count; i++) {
  const no = buf.readUInt32BE(16 + i * 8) + 16, dof = buf.readUInt32BE(16 + i * 8 + 4) + 16;
  if (readCStr(buf, no) === recName) { cells = readMsg(buf, dof); break; }
}
if (!cells) { console.error('record not found: ' + recName); process.exit(1); }
console.log('record ' + recName + '  glyphs=' + cells.length);
console.log('cells: ' + cells.join(','));

const dds = fs.readFileSync(ddsPath);
const hdr = parseDDS(dds);
const rgba = decodeDXT1(dds, hdr.width, hdr.height, hdr.dataOffset);
const S = 4, pad = 2;
const W = cells.length * (CW * S + pad) + pad, H = CH * S + 2 * pad;
const out = Buffer.alloc(W * H * 4, 255);
cells.forEach((cell, k) => {
  const col = cell % COLS, row = Math.floor(cell / COLS);
  for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) {
    const sx = col * CW + Math.floor(x / S), sy = row * CH + Math.floor(y / S);
    if (sx >= hdr.width || sy >= hdr.height) continue;
    const si = (sy * hdr.width + sx) * 4;
    const l = Math.round(0.299 * rgba[si] + 0.587 * rgba[si + 1] + 0.114 * rgba[si + 2]);
    const dx = pad + k * (CW * S + pad) + x, dy = pad + y;
    if (dx >= W || dy >= H) continue;
    const di = (dy * W + dx) * 4;
    out[di] = out[di + 1] = out[di + 2] = 255 - l; out[di + 3] = 255;
  }
});
const dst = outPng || (ddsPath.replace(/\.[^.\\/]+$/, '') + '_' + recName + '.png');
writePNG(dst, W, H, out);
console.log('wrote ' + dst + '  ' + W + 'x' + H);