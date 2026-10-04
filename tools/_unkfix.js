#!/usr/bin/env node
const __P = require('./_config.js');
// Identify the TRUE set of unknown glyph bitmaps across all exported tables.
//
// Unlike _unksig.js this parser honours the variable record header:
//   after the 6-byte MARK (fffd181cfffc) there is a trailing u16 width, then the
//   u16 glyph stream. Searching for MARK makes it correct for both 12-byte
//   (flag 0x0101) and 14-byte (flag 0x0201) headers, so width values are no
//   longer mis-read as glyph indices.
//
// Emits:
//   work/import/_idlist.json  [{i,cell,stem,sig,ctx,blank}]
//   work/import/_idsheet.png  contact sheet, 8 cols, x3, labelled with index
//
// usage: node _unkfix.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parseFontdata } = require('./msgdecode.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const DIR = `${__P.WORK}/import`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
const MARK = Buffer.from('fffd181cfffc', 'hex');

function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }
function readMsg(buf, abs) {
  const mi = buf.indexOf(MARK, abs);
  if (mi < 0) return { glyphs: [] };
  let p = mi + MARK.length + 2, style = null; const out = [];
  while (p + 1 < buf.length) {
    const v = buf.readUInt16BE(p); p += 2;
    if (v === 0xffff) break;
    if (v === 0xfffb) { style = buf.readUInt16BE(p); p += 2; continue; }
    if (v >= 0xff00) continue;
    out.push(v);
  }
  return { style, glyphs: out };
}

const sigAgg = new Map();   // sig -> {n,tables:Set,sample,ctx}
const perTable = [];
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.orig.dat'))) {
  const stem = f.replace('.orig.dat', '');
  const ddsPath = path.join(DIR, stem + '.orig.dds');
  const mapPath = path.join(DIR, stem + '.map.json');
  if (!fs.existsSync(ddsPath) || !fs.existsSync(mapPath)) continue;
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const glyphs = map.glyphs || [];
  const buf = fs.readFileSync(path.join(DIR, f));
  const fd = parseFontdata(buf);
  const sheet = fs.readFileSync(ddsPath);
  const hdr = parseDDS(sheet);
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const sigArr = new Array(cols * rows);
  for (let c = 0; c < cols * rows; c++) sigArr[c] = cellSig(sheet, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  const isBlank = (g) => {
    const col = g % cols, row = Math.floor(g / cols);
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const i = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
      if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) return false;
    }
    return true;
  };
  let unk = 0;
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(buf, fd.entries[i].nameOff + 16);
    const { glyphs: idx } = readMsg(buf, fd.entries[i].dataOff + 16);
    let text = '', hit = [];
    for (const g of idx) {
      if (g < 0 || g >= glyphs.length) { text += '\u25c7'; continue; }
      const ok = glyphs[g];
      if (ok) text += ok;
      else { const bl = isBlank(g); text += bl ? ' ' : '\u25c7'; if (!bl) hit.push(g); }
    }
    for (const g of new Set(hit)) {
      unk++;
      const sig = sigArr[g];
      let a = sigAgg.get(sig);
      if (!a) { a = { n: 0, tables: new Set(), sample: { stem, c: g, col: g % cols, row: Math.floor(g / cols), width: hdr.width, h: hdr.height, dataOffset: hdr.dataOffset, cols }, ctx: '' }; sigAgg.set(sig, a); }
      a.n++; a.tables.add(stem);
      if (!a.ctx) a.ctx = name + ' | ' + text.slice(0, 48);
    }
  }
  perTable.push({ stem, unk });
}

const arr = [...sigAgg.entries()].map(([sig, a]) => ({ sig, n: a.n, tables: [...a.tables].length, sample: a.sample, ctx: a.ctx, blank: sig.length !== CELL_W * CELL_H / 16 * 2 }))
  .sort((x, y) => y.n - x.n);

fs.writeFileSync(path.join(DIR, '_idlist.json'), JSON.stringify(arr.map((r, i) => ({ i, n: r.n, tables: r.tables, cell: r.sample.c, stem: r.sample.stem, sig: r.sig, ctx: r.ctx })), null, 1));

// ---- labelled contact sheet ----
const S = 3, GCOLS = 8, LAB = 22;
const rows = Math.ceil(arr.length / GCOLS);
const tw = CELL_W * S, th = CELL_H * S + LAB;
const ow = GCOLS * tw, oh = rows * th;
const cv = Buffer.alloc(ow * oh * 4);
for (let i = 0; i < ow * oh; i++) { cv[i * 4] = 255; cv[i * 4 + 1] = 255; cv[i * 4 + 2] = 255; cv[i * 4 + 3] = 255; }
// 3x5 digit font
const DIG = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'] };
function px(x, y, r, g, b) { if (x < 0 || y < 0 || x >= ow || y >= oh) return; const i = (y * ow + x) * 4; cv[i] = r; cv[i + 1] = g; cv[i + 2] = b; cv[i + 3] = 255; }
function drawNum(n, x0, y0, sc) {
  const s = String(n);
  for (let di = 0; di < s.length; di++) {
    const f = DIG[s[di]];
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (f[yy][xx] === '1')
      for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) px(x0 + di * 4 * sc + xx * sc + dx, y0 + yy * sc + dy, 0, 0, 0);
  }
}
for (let k = 0; k < arr.length; k++) {
  const s = arr[k].sample;
  const sheet = fs.readFileSync(path.join(DIR, s.stem + '.orig.dds'));
  const rgba = decodeDXT1(sheet, s.width, s.h, s.dataOffset);
  const gx = (k % GCOLS) * tw, gy = Math.floor(k / GCOLS) * th;
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const si = (((s.row * CELL_H + y) * s.width) + (s.col * CELL_W + x)) * 4;
    const lum = (rgba[si] + rgba[si + 1] + rgba[si + 2]) / 3;
    const g = 255 - Math.round(lum);
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) px(gx + x * S + dx, gy + LAB + y * S + dy, g, g, g);
  }
  drawNum(k, gx + 3, gy + 3, 3);
  for (let x = 0; x < tw; x++) px(gx + x, gy + LAB - 1, 180, 180, 180);
  for (let y = 0; y < th; y++) px(gx, gy + y, 180, 180, 180);
}
writePNG(path.join(DIR, '_idsheet.png'), ow, oh, cv);

console.log('TRUE distinct unknown glyph bitmaps:', arr.length);
console.log('per-table unknown (deduped within table):');
for (const p of perTable.sort((a, b) => b.unk - a.unk)) if (p.unk) console.log('   ' + p.stem + '  ' + p.unk);
console.log('\nwrote _idlist.json and _idsheet.png (' + ow + 'x' + oh + ')');