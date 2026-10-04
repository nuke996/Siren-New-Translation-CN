#!/usr/bin/env node
const __P = require('./_config.js');
// Label QA probe for the glyph sig DB.
//
// Purpose: the sig->char DB has layers (chap_templates / vocab / subvocab).
// chap_templates came from hand transcriptions of chapter sheets and is largely
// correct; the vocab/subvocab layers were produced from contact sheets and hold
// systematic "visually confusable" mislabels (日->目, 携->満, 信->借, ハ->八 ...).
//
// This tool, for a list of suspect LABEL chars:
//   1. lists every sig that carries that label (and which layer), so a fix can be
//      applied at SIG level (a label may be correct on one sig, wrong on another);
//   2. locates real cells carrying those sigs across all sheets;
//   3. renders the found cells into one tiled PNG so the actual bitmaps can be read;
//   4. prints objective metrics (ink bbox / stroke runs) to disambiguate e.g. 日/目.
//
// usage: node labelprobe.js <char[,char...]> [maxHitsPerSig] [out.png]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CW = 24, CH = 28, BLKW = 6, BLKH = 7;

function load(f) { try { return JSON.parse(fs.readFileSync(path.join(WORK, f), 'utf8')); } catch (e) { return null; } }

function buildDb() {
  const tpl = load('chap_templates.json') || {};
  const vb = load('vocab.json') || [], vc = load('vocab_chars.json') || {};
  const sv = load('subvocab.json') || [], sc = load('subvocab_chars.json') || {};
  const eff = {};
  for (const k in tpl) if (!eff[k]) eff[k] = { ch: tpl[k], from: 'tpl' };
  for (const v of vb) { const ch = vc[String(v.id)]; if (ch && !eff[v.sig]) eff[v.sig] = { ch, from: 'vocab' }; }
  for (const v of sv) { const ch = sc[String(v.id)]; if (ch && !eff[v.sig]) eff[v.sig] = { ch, from: 'subvocab' }; }
  return eff;
}

function cellSig(buf, dof, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dof + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}

// ---- collect candidate sheets {name, buf} ----
function collectSheets() {
  const cdat = fs.readFileSync(BASE + 'common.dat');
  const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  const out = [];
  // chapter message sheets (sXX0.dds / sXX1.dds live inside each chapter's hed)
  for (const e of cidx.entries) {
    if (!/^s\d\d\.hed$/.test(e.name)) continue;
    let inner; try { inner = parseHed(cdat.subarray(e.off, e.off + e.size)); } catch (x) { continue; }
    const tag = e.name.slice(0, 3);
    let dbuf; try { dbuf = fs.readFileSync(BASE + tag + '.dat'); } catch (x) { continue; }
    for (const x of inner.entries) if (x.name.endsWith('.dds')) out.push({ name: tag + '/' + x.name, buf: dbuf.subarray(x.off, x.off + x.size) });
  }
  // sheets stored directly in common.dat
  for (const e of cidx.entries) {
    if (!e.name.endsWith('.dds')) continue;
    if (e.size > 400000) continue;
    out.push({ name: e.name, buf: cdat.subarray(e.off, e.off + e.size) });
  }
  return out;
}

const argv = process.argv.slice(2);
const chars = (argv[0] || '').split(',').filter(Boolean);
const maxHits = Math.max(1, +(argv[1] || 2));
const outPng = argv[2] || path.join(WORK, '_probe.png');
if (!chars.length) { console.log('usage: node labelprobe.js <char[,char...]> [maxHitsPerSig] [out.png]'); process.exit(1); }

const db = buildDb();
const want = new Set(chars);
const targets = Object.keys(db).filter(k => want.has(db[k].ch));
console.log('suspect sigs selected:', targets.length);
const byLayer = {};
for (const t of targets) byLayer[db[t].from] = (byLayer[db[t].from] || 0) + 1;
console.log('by layer:', JSON.stringify(byLayer));

const set = new Map(targets.map(t => [t, { ch: db[t].ch, from: db[t].from, hits: 0 }]));
const sheets = collectSheets();
console.log('sheets scanned:', sheets.length);

const tiles = [];   // {ch, from, sig, sheet, cell, col, row, rgba, width, ok}
for (const s of sheets) {
  let hdr; try { hdr = parseDDS(s.buf); } catch (x) { continue; }
  if (hdr.fourCC.replace(/\0/g, '').trim() !== 'DXT1') continue;
  const cols = Math.floor(hdr.width / CW), rows = Math.floor(hdr.height / CH);
  let rgba = null;
  for (let c = 0; c < cols * rows; c++) {
    const col = c % cols, row = Math.floor(c / cols);
    const sig = cellSig(s.buf, hdr.dataOffset, hdr.width, col, row);
    const t = set.get(sig);
    if (!t || t.hits >= maxHits) continue;
    if (!rgba) rgba = decodeDXT1(s.buf, hdr.width, hdr.height, hdr.dataOffset);
    t.hits++;
    tiles.push({ ch: t.ch, from: t.from, sig, sheet: s.name, cell: c, col, row, rgba, width: hdr.width });
  }
}

// ---- objective metrics ----
function metrics(t) {
  const { rgba, width, col, row } = t;
  const L = (x, y) => { const i = (y * width + x) * 4; return (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3; };
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, ink = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const v = L(col * CW + x, row * CH + y);
    if (v > 128) { ink++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  const cx = col * CW + Math.floor(CW / 2);
  let runs = 0, prev = false;
  for (let y = miny; y <= maxy; y++) { const on = L(cx, row * CH + y) > 128; if (on && !prev) runs++; prev = on; }
  // ink on left third vs right third, to tell radicals apart (氵/扌/亻 ...)
  let lft = 0, rgt = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const v = L(col * CW + x, row * CH + y) > 128;
    if (v) { if (x < CW / 3) lft++; else if (x >= 2 * CW / 3) rgt++; }
  }
  return { ink, h: maxy - miny + 1, w: maxx - minx + 1, runs, lft, rgt };
}

console.log('\n#  char from      cell       ink  h   w  runs  L/R   bbox');
tiles.forEach((t, i) => {
  const m = metrics(t);
  t.m = m;
  console.log(String(i).padStart(2) + '  ' + t.ch + '   ' + t.from.padEnd(8) + '  ' + t.sheet.padEnd(34) + ' ' + String(t.cell).padStart(4) + '  ' +
    String(m.ink).padStart(3) + '  ' + String(m.h).padStart(2) + '  ' + String(m.w).padStart(2) + '  ' + String(m.runs).padStart(3) + '   ' + m.lft + '/' + m.rgt);
});

// ---- tile into one PNG ----
const SC = 5, TW = CW * SC, TH = CH * SC, PERROW = 8;
const rowsN = Math.ceil(tiles.length / PERROW) || 1;
const W = PERROW * TW, H = rowsN * TH;
const img = Buffer.alloc(W * H * 4, 0);
img.fill(255); // white background; we darken ink below
for (let i = 0; i < tiles.length; i++) {
  const t = tiles[i], ox = (i % PERROW) * TW, oy = Math.floor(i / PERROW) * TH;
  const L = (x, y) => { const k = (y * t.width + x) * 4; return (t.rgba[k] + t.rgba[k + 1] + t.rgba[k + 2]) / 3; };
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const v = Math.round(L(t.col * CW + Math.floor(x / SC), t.row * CH + Math.floor(y / SC)));
    const di = ((oy + y) * W + (ox + x)) * 4;
    img[di] = img[di + 1] = img[di + 2] = 255 - v; img[di + 3] = 255;   // invert: ink -> black on white
  }
}
writePNG(outPng, W, H, img);
console.log('\nwrote ' + outPng + '  ' + W + 'x' + H + '  (' + PERROW + ' per row, tile ' + TW + 'x' + TH + ')');
console.log('tile order = index order printed above (row-major, ' + PERROW + '/row).');