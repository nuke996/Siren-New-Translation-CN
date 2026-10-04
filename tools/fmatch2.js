#!/usr/bin/env node
const __P = require('./_config.js');
// Test: are chapter-sheet glyph cells the SAME rasterization as font01 cells?
// Goal: identify unknown chapter cells automatically by bitmap matching instead
// of error-prone eyeballing of tiny 24x28 glyphs.
//
// usage: node fmatch2.js probe <tag>
//        node fmatch2.js test  <tag>
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const FONT01 = `${__P.gameRoot}/_hanhua/extracted/font01.dds`;
const TBL = `${__P.gameRoot}/_hanhua/extracted/fontidexu8.tbl`;
const CELL_W = 24, CELL_H = 28, FCOLS = 51, FCELL = 20;

function lumAt(rgba, W, x, y) { const p = (y * W + x) * 4; return (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3; }
function patch(rgba, W, H, x0, y0, w, h) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y;
    out[y * w + x] = (sx >= 0 && sy >= 0 && sx < W && sy < H) ? lumAt(rgba, W, sx, sy) : 0;
  }
  return out;
}
function bboxOf(p, w, h, thr) {
  let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p[y * w + x] > thr) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
  if (mxx < 0) return null; return { x: mnx, y: mny, w: mxx - mnx + 1, h: mxy - mny + 1 };
}
function resize(p, sw, sh, dw, dh) {
  const o = new Float64Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const fx = (x + 0.5) * sw / dw - 0.5, fy = (y + 0.5) * sh / dh - 0.5;
    const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
    const ax = fx - x0, ay = fy - y0;
    o[y * dw + x] = p[y0 * sw + x0] * (1 - ax) * (1 - ay) + p[y0 * sw + x1] * ax * (1 - ay) + p[y1 * sw + x0] * (1 - ax) * ay + p[y1 * sw + x1] * ax * ay;
  }
  return o;
}
function znorm(p) { const n = p.length; let m = 0; for (const v of p) m += v; m /= n; let s = 0; for (const v of p) s += (v - m) * (v - m); s = Math.sqrt(s) || 1; const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = (p[i] - m) / s; return o; }
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

const FG = CELL_W, FH = CELL_H;      // normalize every glyph into a 24x28 box
function toFeature(p, sw, sh) {
  const b = bboxOf(p, sw, sh, 90); if (!b) return null;
  const tight = new Float64Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) tight[y * b.w + x] = p[(b.y + y) * sw + (b.x + x)];
  const rs = resize(tight, b.w, b.h, FG - 2, FH - 2);
  const canvas = new Float64Array(FG * FH);
  for (let y = 0; y < FH - 2; y++) for (let x = 0; x < FG - 2; x++) canvas[(y + 1) * FG + (x + 1)] = rs[y * (FG - 2) + x];
  return { v: znorm(canvas), bb: b };
}

// ---- font01 ----
const fontBuf = fs.readFileSync(FONT01);
const fontHdr = parseDDS(fontBuf);
const fontRGBA = decodeDXT1(fontBuf, fontHdr.width, fontHdr.height, fontHdr.dataOffset);
const tbl = fs.readFileSync(TBL);
const charOfGlyph = {};
for (let o = 2000; o + 8 <= tbl.length; o += 8) {
  const raw = Buffer.from([tbl[o], tbl[o + 1], tbl[o + 2], tbl[o + 3]]).reverse().toString('utf8').replace(/\0+$/g, '');
  if (!raw || raw.includes('\uFFFD')) continue;
  const g = tbl.readUInt32BE(o + 4);
  if (charOfGlyph[g] === undefined) charOfGlyph[g] = raw;
}
const FKEYS = [], FVEC = [], FBB = [];
for (const g of Object.keys(charOfGlyph)) {
  const gg = +g, col = gg % FCOLS, row = Math.floor(gg / FCOLS);
  const p = patch(fontRGBA, fontHdr.width, fontHdr.height, col * FCELL, row * FCELL + 1, FCELL, FCELL);
  const f = toFeature(p, FCELL, FCELL); if (!f) continue;
  FKEYS.push(gg); FVEC.push(f.v); FBB.push(f.bb);
}
console.error('font01 features:', FKEYS.length);

// ---- chapter sheet ----
function loadSheet(tag) {
  const cdat = fs.readFileSync(BASE + 'common.dat');
  const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const e = idx.entries.find(x => x.name.includes('script/msg/') && x.name.endsWith(tag + '0.dds'));
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  const buf = dbuf.subarray(e.off, e.off + e.size);
  const hdr = parseDDS(buf);
  return { buf, hdr, rgba: decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset), cols: Math.floor(hdr.width / CELL_W) };
}

// raw DXT1 signature of one cell (identical across chapters for identical glyphs)
function cellSig(sheet, dataOffset, width, col, row) {
  const BLKW = 6, BLKH = 7, bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8; const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(sheet.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
const tag = process.argv[3];
const s = loadSheet(tag);
const tpl = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));

function chapFeature(col, row) {
  const p = patch(s.rgba, s.hdr.width, s.hdr.height, col * CELL_W, row * CELL_H, CELL_W, CELL_H);
  return toFeature(p, CELL_W, CELL_H);
}

const mode = process.argv[2];
if (mode === 'probe') {
  let shown = 0;
  for (let c = 0; c < 273 && shown < 25; c++) {
    const col = c % s.cols, row = Math.floor(c / s.cols);
    const f = chapFeature(col, row); if (!f) continue;
    const sig = cellSig(s.buf, s.hdr.dataOffset, s.hdr.width, col, row);
    const ch = tpl[sig]; if (!ch) continue;
    // font01 bbox for that char
    let fb = null;
    for (let i = 0; i < FKEYS.length; i++) if (charOfGlyph[FKEYS[i]] === ch) { fb = FBB[i]; break; }
    console.log('cell', c, 'char', ch, 'chapBB', f.bb.w + 'x' + f.bb.h, 'fontBB', fb ? fb.w + 'x' + fb.h : '?');
    shown++;
  }
} else if (mode === 'test') {
  let n = 0, t1 = 0, t3 = 0, t5 = 0; const ranks = [];
  for (let c = 0; c < 273; c++) {
    const col = c % s.cols, row = Math.floor(c / s.cols);
    const sig = cellSig(s.buf, s.hdr.dataOffset, s.hdr.width, col, row);
    const truth = tpl[sig]; if (!truth) continue;
    const f = chapFeature(col, row); if (!f) continue;
    const sc = FKEYS.map((g, i) => [i, dot(f.v, FVEC[i])]).sort((a, b) => b[1] - a[1]);
    let pos = -1;
    for (let i = 0; i < sc.length; i++) if (charOfGlyph[FKEYS[sc[i][0]]] === truth) { pos = i; break; }
    n++; ranks.push(pos + 1);
    if (pos === 0) t1++; if (pos >= 0 && pos < 3) t3++; if (pos >= 0 && pos < 5) t5++;
  }
  console.log('test', tag, 'known cells:', n);
  console.log('top1:', t1, (100 * t1 / n).toFixed(1) + '%', 'top3:', t3, (100 * t3 / n).toFixed(1) + '%', 'top5:', t5, (100 * t5 / n).toFixed(1) + '%');
  ranks.sort((a, b) => a - b);
  console.log('median rank:', ranks[Math.floor(ranks.length / 2)], 'worst:', ranks[ranks.length - 1]);
} else console.log('usage: node fmatch2.js probe|test <tag>');