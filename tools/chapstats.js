const __P = require('./_config.js');
// Per-chapter capacity stats for SIREN: New Translation (PS3, BCJS30020).
// For every chapter (sXX.hed embedded in common.dat) it reports, for the main
// dialogue sheet sXX0.dds and its message sXX0.dat:
//   - sheet geometry (w x h, cols x rows, cell count)
//   - blank cells (free slots) among the grid
//   - unique glyph indices actually referenced by the messages, and max index
//
// usage: node chapstats.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');

const BASE = `${__P.DISC}/`;
const CELL_W = 24, CELL_H = 28;

function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }

function sheetBlanks(buf) {
  const h = parseDDS(buf);
  const fourCC = h.fourCC.replace(/\0/g, '').trim();
  if (fourCC !== 'DXT1') return null;
  const cols = Math.floor(h.width / CELL_W), rows = Math.floor(h.height / CELL_H);
  const rgba = decodeDXT1(buf, h.width, h.height, h.dataOffset);
  let blank = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let mx = 0;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const i = ((r * CELL_H + y) * h.width + (c * CELL_W + x)) * 4;
      const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (l > mx) mx = l;
    }
    if (mx < 40) blank++;
  }
  return { w: h.width, h: h.height, cols, rows, total: cols * rows, blank };
}

function msgGlyphs(buf) {
  const fd = parseFontdata(buf);
  const set = new Set();
  let max = -1;
  for (let i = 0; i < fd.count; i++) {
    const abs = fd.entries[i].dataOff + 16;
    let g;
    try { g = readPayload(buf, abs).glyphs; } catch (e) { continue; }
    for (const v of g) { set.add(v); if (v > max) max = v; }
  }
  return { count: fd.count, uniq: set.size, max };
}

const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const chaps = cidx.entries.filter(e => e.name.length === 7 && e.name.startsWith('s') && e.name.endsWith('.hed'))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---- compare mode: are the chapter sheets cell-for-cell identical (shared ordering)? ----
function cellSig(rgba, w, col, row) {
  let h = 5381;
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const i = ((row * CELL_H + y) * w + (col * CELL_W + x)) * 4;
    h = ((h * 33) ^ rgba[i]) >>> 0;
  }
  return h;
}
function sheetStatsOf(chapDat, idx, stem) {
  const dbuf = fs.readFileSync(BASE + chapDat);
  const de = idx.entries.find(e => e.name.includes('script/msg/') && e.name.endsWith(stem + '.dds'));
  if (!de) return null;
  const buf = dbuf.subarray(de.off, de.off + de.size);
  const h = parseDDS(buf);
  const cols = Math.floor(h.width / CELL_W), rows = Math.floor(h.height / CELL_H);
  const rgba = decodeDXT1(buf, h.width, h.height, h.dataOffset);
  const sigs = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sigs.push(cellSig(rgba, h.width, c, r));
  return sigs;
}
if (process.argv[2] === 'cmp') {
  const per = {};
  for (const ch of chaps) {
    const tag = ch.name.slice(0, 3);
    const cp = BASE + tag + '.dat';
    if (!fs.existsSync(cp)) continue;
    let idx; try { idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size)); } catch (e) { continue; }
    const s = sheetStatsOf(tag + '.dat', idx, tag + '0');
    if (s) per[tag] = s;
  }
  const ref = per['s01'];
  console.log('ref = s01 (' + ref.length + ' cells)');
  for (const [tag, s] of Object.entries(per)) {
    const n = Math.min(ref.length, s.length);
    let m = 0; for (let i = 0; i < n; i++) if (ref[i] === s[i]) m++;
    console.log(`${tag}: cells=${s.length}  match-vs-s01=${m}/${n} (${(100 * m / n).toFixed(0)}%)`);
  }
  process.exit(0);
}

console.log('chap | datBytes | msgs | uniqGlyph | maxIdx | sheet | grid | blank/total');
for (const ch of chaps) {
  const hb = cdat.subarray(ch.off, ch.off + ch.size);
  let idx; try { idx = parseHed(hb); } catch (e) { console.log(ch.name + ' parse err'); continue; }
  const tag = ch.name.slice(0, 3);              // e.g. 's01'
  const chapDat = BASE + tag + '.dat';
  if (!fs.existsSync(chapDat)) { console.log(tag + ' : no ' + tag + '.dat'); continue; }
  const dbuf = fs.readFileSync(chapDat);
  const dats = idx.entries.filter(e => e.name.includes('script/msg/') && e.name.endsWith('.dat'));
  for (const de of dats) {
    const stem = de.name.split('/').pop().replace(/\.dat$/, '');   // s010
    const ddsEntry = idx.entries.find(e => e.name.includes('script/msg/') && e.name.endsWith(stem + '.dds'));
    const mbuf = dbuf.subarray(de.off, de.off + de.size);
    let gstat;
    try { gstat = msgGlyphs(mbuf); } catch (e) { gstat = { count: '?', uniq: '?', max: '?' }; }
    let sstat = null;
    if (ddsEntry) { try { sstat = sheetBlanks(dbuf.subarray(ddsEntry.off, ddsEntry.off + ddsEntry.size)); } catch (e) { } }
    console.log([
      tag, de.size, gstat.count, gstat.uniq, gstat.max,
      stem + '.dds',
      sstat ? `${sstat.w}x${sstat.h} ${sstat.cols}x${sstat.rows}` : 'n/a',
      sstat ? `${sstat.blank}/${sstat.total}` : 'n/a',
    ].join(' | '));
  }
}