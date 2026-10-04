#!/usr/bin/env node
// Render the ORIGINAL glyphs of the archive records (ARCHIVE0NN) cell-by-cell into
// one montage so the true Japanese name can be read and compared with the current
// Chinese translation.
// usage: node _archmont.js <orig.dat> <orig.dds> <from> <to> <out.png>
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const CW = 24, CH = 28, COLS = 21, MAXC = 14;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const [datPath, ddsPath, from, to, outPng] = process.argv.slice(2);
const buf = fs.readFileSync(datPath);
const count = buf.readUInt32BE(12);
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
function readMsg(b, a) { const i = b.indexOf(MARK, a); let p = i + MARK.length + 2; const out = []; while (p + 1 < b.length) { const v = b.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; out.push(v); } return out; }
const recs = {};
for (let i = 0; i < count; i++) {
  const no = buf.readUInt32BE(16 + i * 8) + 16, dof = buf.readUInt32BE(16 + i * 8 + 4) + 16;
  const nm = readCStr(buf, no);
  if (/^ARCHIVE\d+$/.test(nm) && recs[nm] === undefined) recs[nm] = readMsg(buf, dof);
}
const dds = fs.readFileSync(ddsPath);
const hdr = parseDDS(dds);
const rgba = decodeDXT1(dds, hdr.width, hdr.height, hdr.dataOffset);

const names = [];
for (let n = +from; n <= +to; n++) names.push('ARCHIVE' + String(n).padStart(3, '0'));
const S = 2, pad = 3, ROW = CH * S + pad;
const W = MAXC * (CW * S) + 2 * pad, H = names.length * ROW + pad;
const out = Buffer.alloc(W * H * 4, 255);
names.forEach((nm, r) => {
  const cells = (recs[nm] || []).slice(0, MAXC);
  const oy = pad + r * ROW;
  cells.forEach((cell, k) => {
    const col = cell % COLS, row = Math.floor(cell / COLS);
    for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) {
      const sx = col * CW + Math.floor(x / S), sy = row * CH + Math.floor(y / S);
      if (sx >= hdr.width || sy >= hdr.height) continue;
      const si = (sy * hdr.width + sx) * 4;
      const l = Math.round(0.299 * rgba[si] + 0.587 * rgba[si + 1] + 0.114 * rgba[si + 2]);
      const dx = pad + k * (CW * S) + x, dy = oy + y;
      if (dx >= W || dy >= H) continue;
      const di = (dy * W + dx) * 4;
      out[di] = out[di + 1] = out[di + 2] = 255 - l; out[di + 3] = 255;
    }
  });
});
writePNG(outPng, W, H, out);
console.log(`ARCHIVE${from}..${to}: rendered ${names.length} rows -> ${outPng}  ${W}x${H}`);
console.log('row order: ' + names.join(' '));