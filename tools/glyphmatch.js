#!/usr/bin/env node
const __P = require('./_config.js');
// Identify glyphs in a per-message sheet (.dds) by matching their bitmaps against
// the global font atlas font01.dds (20x20 cells) using fontidexu8.tbl for chars.
//
// Usage: node glyphmatch.js <sheet.dds> <cols> <cellW> <cellH> <idx[,idx...]>
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw } = require('./dds2png.js');

const FONT01 = `${__P.gameRoot}/_hanhua/extracted/font01.dds`;
const TBL = `${__P.gameRoot}/_hanhua/extracted/fontidexu8.tbl`;

function loadRGBA(file) {
  const buf = fs.readFileSync(file);
  const hdr = parseDDS(buf);
  const fourCC = hdr.fourCC.replace(/\0/g, '').trim();
  const rgba = (fourCC === 'DXT1') ? decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset)
    : decodeRaw(buf, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 32, hdr);
  return { hdr, rgba };
}
function lum(rgba, W, x, y) { const p = (y * W + x) * 4; return (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3; }

// normalize a rectangular region to a GxG grid of mean luminance
function norm(rgba, W, x0, y0, w, h, G) {
  const out = new Float64Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const sx0 = x0 + Math.floor(gx * w / G), sx1 = x0 + Math.max(sx0 - x0 + 1, Math.floor((gx + 1) * w / G));
    const sy0 = y0 + Math.floor(gy * h / G), sy1 = y0 + Math.max(sy0 - y0 + 1, Math.floor((gy + 1) * h / G));
    let s = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { s += lum(rgba, W, x, y); n++; }
    out[gy * G + gx] = n ? s / n : 0;
  }
  return out;
}
function inkBBox(rgba, W, x0, y0, w, h, thr) {
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (lum(rgba, W, x0 + x, y0 + y) > (thr || 128)) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  if (maxx < 0) return null;
  return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
}
function feat(rgba, W, x0, y0, w, h, G) {
  const bb = inkBBox(rgba, W, x0, y0, w, h); if (!bb) return null;
  const f = norm(rgba, W, x0 + bb.x, y0 + bb.y, bb.w, bb.h, G);
  let m = 0; for (const v of f) m += v; m /= (G * G);
  let n = 0; for (const v of f) n += (v - m) * (v - m); n = Math.sqrt(n) || 1;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - m) / n;      // z-normalize
  return f;
}
function sim(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// ---- build font01 feature DB (lazy, cached to json) ----
const CACHE = `${__P.WORK}/font01_features.json`;
const G = 16;
function buildFontDB() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const { rgba } = loadRGBA(FONT01);
  const W = 1024, COLS = 51;
  const tbl = fs.readFileSync(TBL);
  const charOf = {};
  for (let o = 2000; o + 8 <= tbl.length; o += 8) {
    const raw = Buffer.from([tbl[o], tbl[o + 1], tbl[o + 2], tbl[o + 3]]).reverse().toString('utf8').replace(/\0+$/g, '');
    if (!raw || raw.includes('\uFFFD')) continue;
    const g = tbl.readUInt32BE(o + 4);
    if (charOf[g] === undefined) charOf[g] = raw;
  }
  const db = {};
  for (const k of Object.keys(charOf)) {
    const g = +k, col = g % COLS, row = Math.floor(g / COLS);
    const f = feat(rgba, W, col * 20, row * 20 + 1, 20, 20, G);
    if (f) db[g] = { ch: charOf[g], f: Array.from(f) };
  }
  fs.writeFileSync(CACHE, JSON.stringify(db));
  return db;
}

const sheetPath = process.argv[2], COLS = +process.argv[3], CW = +process.argv[4], CH = +process.argv[5];
const idxs = (process.argv[6] || '0').split(',').map(Number);
const { rgba } = loadRGBA(sheetPath);
const W = (() => { const b = fs.readFileSync(sheetPath); return parseDDS(b).width; })();
const db = buildFontDB();
const keys = Object.keys(db);
console.log('font glyphs in DB:', keys.length);
for (const i of idxs) {
  const col = i % COLS, row = Math.floor(i / COLS);
  const f = feat(rgba, W, col * CW, row * CH, CW, CH, G);
  if (!f) { console.log('idx', i, '= BLANK'); continue; }
  const scored = keys.map(k => ({ g: k, s: sim(f, db[k].f) })).sort((a, b) => b.s - a.s).slice(0, 5);
  console.log('idx', i, '=>', scored.map(x => db[x.g].ch + '(g' + x.g + ',s' + x.s.toFixed(3) + ')').join(' '));
}