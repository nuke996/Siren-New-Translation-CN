#!/usr/bin/env node
const __P = require('./_config.js');
// Rank a sheet cell against the global font atlas (font01.dds, 7058 known chars).
// Phase 1 (test): using KNOWN cells (from chapter templates) measure how often the
//   true char appears in top-1 / top-3 / top-5.
// Phase 2 (rank): print candidates for unknown cells.
//
// usage:
//   node glyphrank.js test <tag>
//   node glyphrank.js rank <tag> [n]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const FONT01 = `${__P.gameRoot}/_hanhua/extracted/font01.dds`;
const TBL = `${__P.gameRoot}/_hanhua/extracted/fontidexu8.tbl`;
const CELL_W = 24, CELL_H = 28, G = 16, FCOLS = 51;

function lum(rgba, W, x, y) { const p = (y * W + x) * 4; return (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3; }
function norm(rgba, W, x0, y0, w, h) {
  const out = new Float64Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const sx0 = x0 + Math.floor(gx * w / G), sx1 = x0 + Math.max(1, Math.floor((gx + 1) * w / G));
    const sy0 = y0 + Math.floor(gy * h / G), sy1 = y0 + Math.max(1, Math.floor((gy + 1) * h / G));
    let s = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const x2 = Math.min(x, x0 + w - 1), y2 = Math.min(y, y0 + h - 1); s += lum(rgba, W, x2, y2); n++; }
    out[gy * G + gx] = n ? s / n : 0;
  }
  return out;
}
function bbox(rgba, W, x0, y0, w, h, thr) {
  let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum(rgba, W, x0 + x, y0 + y) > thr) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
  if (mxx < 0) return null; return { x: mnx, y: mny, w: mxx - mnx + 1, h: mxy - mny + 1 };
}
function feat(rgba, W, x0, y0, w, h) {
  const b = bbox(rgba, W, x0, y0, w, h, 90); if (!b) return null;
  const f = norm(rgba, W, x0 + b.x, y0 + b.y, b.w, b.h);
  let m = 0; for (const v of f) m += v; m /= G * G;
  let n = 0; for (const v of f) n += (v - m) * (v - m); n = Math.sqrt(n) || 1;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - m) / n;
  return f;
}
function sim(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

const CACHE = path.join(WORK, 'font01_features.json');
function buildDB() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const buf = fs.readFileSync(FONT01); const h = parseDDS(buf);
  const rgba = decodeDXT1(buf, h.width, h.height, h.dataOffset);
  const tbl = fs.readFileSync(TBL); const charOf = {};
  for (let o = 2000; o + 8 <= tbl.length; o += 8) {
    const raw = Buffer.from([tbl[o], tbl[o + 1], tbl[o + 2], tbl[o + 3]]).reverse().toString('utf8').replace(/\0+$/g, '');
    if (!raw || raw.includes('\uFFFD')) continue;
    const g = tbl.readUInt32BE(o + 4); if (charOf[g] === undefined) charOf[g] = raw;
  }
  const db = {};
  for (const k of Object.keys(charOf)) {
    const g = +k, col = g % FCOLS, row = Math.floor(g / FCOLS);
    const f = feat(rgba, h.width, col * 20, row * 20 + 1, 20, 20);
    if (f) db[g] = { ch: charOf[g], f: Array.from(f) };
  }
  fs.writeFileSync(CACHE, JSON.stringify(db));
  return db;
}
const DB = buildDB();
const KEYS = Object.keys(DB);
const FLAT = KEYS.map(k => Float32Array.from(DB[k].f));

function loadSheet(tag) {
  const cdat = fs.readFileSync(BASE + 'common.dat');
  const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const e = idx.entries.find(x => x.name.includes('script/msg/') && x.name.endsWith(tag + '0.dds'));
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  const buf = dbuf.subarray(e.off, e.off + e.size);
  const hdr = parseDDS(buf);
  return { hdr, rgba: decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset), cols: Math.floor(hdr.width / CELL_W) };
}
function cellFeat(s, col, row) { return feat(s.rgba, s.hdr.width, col * CELL_W, row * CELL_H, CELL_W, CELL_H); }
function rank(f) {
  const sc = KEYS.map((k, i) => [k, sim(f, FLAT[i])]);
  sc.sort((a, b) => b[1] - a[1]);
  return sc;
}

const cmd = process.argv[2], tag = process.argv[3];
const s = loadSheet(tag);
const tpl = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
const { cellSig, } = (() => { return {}; })();

// rebuild cellSig locally for template lookup
const BLKW = 6, BLKH = 7;
function sigOf(buf, dof, width, col, row) {
  const bpr = (width / 4) * 8, b0 = dof + row * BLKH * bpr + col * BLKW * 8; const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const chh = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(chh.off, chh.off + chh.size));
const ee = idx.entries.find(x => x.name.includes('script/msg/') && x.name.endsWith(tag + '0.dds'));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const sbuf = dbuf.subarray(ee.off, ee.off + ee.size);

let n = 0, top1 = 0, top3 = 0, top5 = 0, ranks = [];
const rows = Math.floor(s.hdr.height / CELL_H);
for (let r = 0; r < rows; r++) for (let c = 0; c < s.cols; c++) {
  const sig = sigOf(sbuf, s.hdr.dataOffset, s.hdr.width, c, r);
  const truth = tpl[sig]; if (!truth) continue;
  const f = cellFeat(s, c, r); if (!f) continue;
  const sc = rank(f);
  const pos = sc.findIndex(x => DB[x[0]].ch === truth);
  n++; ranks.push(pos + 1);
  if (pos === 0) top1++; if (pos >= 0 && pos < 3) top3++; if (pos >= 0 && pos < 5) top5++;
}
console.log('test', tag, 'known cells:', n);
console.log('top1:', top1, (100 * top1 / n).toFixed(1) + '%', 'top3:', top3, (100 * top3 / n).toFixed(1) + '%', 'top5:', top5, (100 * top5 / n).toFixed(1) + '%');
ranks.sort((a, b) => a - b);
console.log('median rank:', ranks[Math.floor(ranks.length / 2)], 'worst:', ranks[ranks.length - 1]);