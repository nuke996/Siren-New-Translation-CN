#!/usr/bin/env node
const __P = require('./_config.js');
// Definitive "unknown glyph" scan over ALL exported sheets, reading the real game
// data (common.dat + sXX.dat) rather than the partial work/import cache.
// Dedups by cellSig (the DB is sig-keyed) so one identified sig fixes every sheet.
//
// emits work/import/_unk_all.json  [{i,n,tables,stem,cell,sig,ctx}]
//       work/import/_unk_all.png   labelled contact sheet (8 cols, x3)
//
// usage: node _unkall.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');

const BASE = `${__P.DISC}/`;
const WK = `${__P.WORK}`;
const OUT = WK + '/import';
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;

function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WK, 'chap_templates.json'), 'utf8'));
  for (const [f, idf] of [['vocab.json', 'vocab_chars.json'], ['subvocab.json', 'subvocab_chars.json']]) {
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(WK, f), 'utf8'));
      const chs = JSON.parse(fs.readFileSync(path.join(WK, idf), 'utf8'));
      for (const it of arr) { const ch = chs[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; }
    } catch (e) { }
  }
  return db;
}
function cellSig(buf, dof, width, col, row) {
  const bpr = (width / 4) * 8, b0 = dof + row * BLKH * bpr + col * BLKW * 8, parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }

const db = loadDb();
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));

const sigAgg = new Map();
const perSheet = [];

function scan({ stem, sheetBuf, datBuf }) {
  let hdr; try { hdr = parseDDS(sheetBuf); } catch (e) { return; }
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const rgba = decodeDXT1(sheetBuf, hdr.width, hdr.height, hdr.dataOffset);
  const isBlank = (g) => {
    const col = g % cols, row = Math.floor(g / cols);
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const i = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
      if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) return false;
    }
    return true;
  };
  const known = new Array(cols * rows).fill(0);
  const sigArr = new Array(cols * rows);
  for (let c = 0; c < cols * rows; c++) {
    const sig = cellSig(sheetBuf, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
    sigArr[c] = sig; if (db[sig]) known[c] = 1;
  }
  const fd = parseFontdata(datBuf);
  const seen = new Set(); let unk = 0;
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(datBuf, fd.entries[i].nameOff + 16);
    let idx; try { idx = readPayload(datBuf, fd.entries[i].dataOff + 16).glyphs; } catch (e) { continue; }
    let text = '';
    for (const g of idx) {
      if (g < 0 || g >= cols * rows) { text += '\u25c7'; continue; }
      if (known[g]) { text += db[sigArr[g]]; continue; }
      if (isBlank(g)) { text += ' '; continue; }
      text += '\u25c7';
      if (!seen.has(g)) {
        seen.add(g); unk++;
        const sig = sigArr[g];
        let a = sigAgg.get(sig);
        if (!a) { a = { n: 0, tables: new Set(), stem, cell: g, sig, ctx: name + ' | ' + '' }; sigAgg.set(sig, a); }
        a.n++; a.tables.add(stem); if (a.ctx.endsWith('| ')) a.ctx = name + ' | ' + text.slice(0, 44);
      }
    }
  }
  perSheet.push({ stem, unk, grid: cols + 'x' + rows });
}

// chapters (sXX0 + sXX1)
for (let n = 1; n <= 25; n++) {
  const tag = 's' + String(n).padStart(2, '0');
  const ch = cidx.entries.find(e => e.name === tag + '.hed'); if (!ch) continue;
  let idx, dbuf; try { idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size)); dbuf = fs.readFileSync(BASE + tag + '.dat'); } catch (e) { continue; }
  for (const stem of [tag + '0', tag + '1']) {
    const ddsE = idx.entries.find(x => x.name.endsWith(stem + '.dds'));
    const datE = idx.entries.find(x => x.name.endsWith(stem + '.dat'));
    if (!ddsE || !datE) continue;
    scan({ stem, sheetBuf: dbuf.subarray(ddsE.off, ddsE.off + ddsE.size), datBuf: dbuf.subarray(datE.off, datE.off + datE.size) });
  }
}
// movies + archives from existing jp filenames
for (const f of fs.readdirSync(WK).filter(x => x.endsWith('_jp.txt'))) {
  const base = f.replace('_jp.txt', '');
  let stem = null;
  if (base.startsWith('hud_movie_')) stem = 'hud/movie/' + base.slice('hud_movie_'.length);
  else if (base.startsWith('hud_launcher_jimaku_')) stem = 'hud/launcher/jimaku/' + base.slice('hud_launcher_jimaku_'.length);
  if (!stem) continue;
  const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
  const datE = cidx.entries.find(e => e.name === stem + '.dat');
  if (!ddsE || !datE) continue;
  scan({ stem: base, sheetBuf: cdat.subarray(ddsE.off, ddsE.off + ddsE.size), datBuf: cdat.subarray(datE.off, datE.off + datE.size) });
}

const arr = [...sigAgg.values()].sort((a, b) => b.n - a.n);
fs.writeFileSync(path.join(OUT, '_unk_all.json'), JSON.stringify(arr.map((r, i) => ({ i, n: r.n, tables: r.tables.size, stem: r.stem, cell: r.cell, sig: r.sig, ctx: r.ctx })), null, 1));

// contact sheet
const S = 3, GCOLS = 8, LAB = 22;
const rows = Math.max(1, Math.ceil(arr.length / GCOLS));
const tw = CELL_W * S, th = CELL_H * S + LAB, ow = GCOLS * tw, oh = rows * th;
const cv = Buffer.alloc(ow * oh * 4, 255);
const DIG = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'] };
function px(x, y, v) { if (x < 0 || y < 0 || x >= ow || y >= oh) return; const i = (y * ow + x) * 4; cv[i] = cv[i + 1] = cv[i + 2] = v; cv[i + 3] = 255; }
function dnum(n, x0, y0, sc) { const s = String(n); for (let d = 0; d < s.length; d++) { const f = DIG[s[d]]; for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (f[yy][xx] === '1') for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) px(x0 + d * 4 * sc + xx * sc + dx, y0 + yy * sc + dy, 0); } }
for (let k = 0; k < arr.length; k++) {
  const r = arr[k];
  const base = r.stem;
  let sheetBuf, hdr, dof, cols;
  const ddsE = cidx.entries.find(e => e.name === base + '.dds');
  if (ddsE) { sheetBuf = cdat.subarray(ddsE.off, ddsE.off + ddsE.size); }
  else if (/^s\d\d$/.test(base)) {
    const ch = cidx.entries.find(e => e.name === base + '.hed'); const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
    const d = idx.entries.find(x => x.name.endsWith(base + '0.dds')); const dbuf = fs.readFileSync(BASE + base + '.dat');
    sheetBuf = dbuf.subarray(d.off, d.off + d.size);
  }
  if (!sheetBuf) continue;
  hdr = parseDDS(sheetBuf); cols = Math.floor(hdr.width / CELL_W);
  const rgba = decodeDXT1(sheetBuf, hdr.width, hdr.height, hdr.dataOffset);
  const col = r.cell % cols, row = Math.floor(r.cell / cols), gx = (k % GCOLS) * tw, gy = Math.floor(k / GCOLS) * th;
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const si = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
    const g = 255 - Math.round((rgba[si] + rgba[si + 1] + rgba[si + 2]) / 3);
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) px(gx + x * S + dx, gy + LAB + y * S + dy, g);
  }
  dnum(k, gx + 3, gy + 3, 3);
}
writePNG(path.join(OUT, '_unk_all.png'), ow, oh, cv);

console.log('definitive distinct unknown glyph sigs (all sheets):', arr.length);
for (const p of perSheet.filter(p => p.unk).sort((a, b) => b.unk - a.unk)) console.log('   ' + p.stem + '  ' + p.grid + '  unk=' + p.unk);
console.log('\nwrote _unk_all.json / _unk_all.png');