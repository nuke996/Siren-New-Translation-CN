#!/usr/bin/env node
const __P = require('./_config.js');
// Render one message from an imported .dat using its merged cell->char map, into a PNG row.
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const CW = 24, CH = 28;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const [datPath, ddsPath, mergedPath, ...names] = process.argv.slice(2);
const buf = fs.readFileSync(datPath);
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
const glyphs = merged.glyphs;
const count = buf.readUInt32BE(12);
const entries = [];
for (let i = 0; i < count; i++) { const p = 16 + i * 8; entries.push({ nameOff: buf.readUInt32BE(p), dataOff: buf.readUInt32BE(p + 4) }); }
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
function readMsg(b, a) { const i = b.indexOf(MARK, a); let p = i + MARK.length + 2; const out = []; while (p + 1 < b.length) { const v = b.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; out.push(v); } return out; }
const sheet = fs.readFileSync(ddsPath);
const hdr = parseDDS(sheet);
const cols = Math.floor(hdr.width / CW);
const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
const S = 3, pad = 3;
const W = 60 * (CW * S + pad), rows = [];
for (const nm of names) {
  const i = entries.findIndex(e => readCStr(buf, e.nameOff + 16) === nm);
  if (i < 0) { console.log(nm, 'NOT FOUND'); continue; }
  const idx = readMsg(buf, entries[i].dataOff + 16);
  rows.push({ nm, idx, text: idx.map(g => glyphs[g] || '?').join('') });
}
const H = rows.length * (CH * S + pad * 3 + 8) + pad;
const out = Buffer.alloc(W * H * 4, 255);
rows.forEach((row, ri) => {
  const oy = pad + ri * (CH * S + pad * 3 + 8);
  row.idx.forEach((cell, k) => {
    const col = cell % cols, r = Math.floor(cell / cols);
    for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) {
      const sx = col * CW + Math.floor(x / S), sy = r * CH + Math.floor(y / S);
      const si = (sy * hdr.width + sx) * 4;
      const l = Math.round(0.299 * rgba[si] + 0.587 * rgba[si + 1] + 0.114 * rgba[si + 2]);
      const dx = pad + k * (CW * S + pad) + x, dy = oy + y;
      if (dx >= W || dy >= H) continue;
      const o = (dy * W + dx) * 4; out[o] = out[o + 1] = out[o + 2] = 255 - l; out[o + 3] = 255;
    }
  });
  console.log(row.nm, '->', row.text);
});
writePNG(`${__P.WORK}/_rec.png`, W, H, out);
console.log('wrote work/_rec.png');