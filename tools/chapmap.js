#!/usr/bin/env node
const __P = require('./_config.js');
// Build a chapter's cell->char map by matching its sheet against templates
// harvested from already-transcribed chapters.
//
// Rationale: every chapter sheet uses the same rasterizer, font, and cell size
// (24x28). DXT1 blocks are 4x4 and both 24 and 28 are multiples of 4, and the
// sheet stride (512/4=128 blocks) keeps every cell block-aligned, so a given
// character compresses to byte-identical DXT1 cells in every chapter.
// => exact byte match is a reliable cross-chapter identity test.
//
// usage:
//   node chapmap.js seed                     # harvest templates from work/*_map*.json
//   node chapmap.js scan <tag> [tag...]      # match each <tag>0.dds, report coverage
//   node chapmap.js write <tag>              # emit work/<tag>_map.json (matched only)
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const TPL = path.join(WORK, 'chap_templates.json');
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;

function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }

// --- locate a chapter's dat + parse its hed ---
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const chaps = {};
for (const e of cidx.entries) {
  if (e.name.length === 7 && e.name.startsWith('s') && e.name.endsWith('.hed')) chaps[e.name.slice(0, 3)] = e;
}

function chapterIndex(tag) {
  const ch = chaps[tag];
  if (!ch) throw new Error('no chapter ' + tag);
  return parseHed(cdat.subarray(ch.off, ch.off + ch.size));
}
function findSheet(idx, stem) {
  const e = idx.entries.find(x => x.name.includes('script/msg/') && x.name.endsWith(stem + '.dds'));
  if (!e) throw new Error('no sheet ' + stem + '.dds');
  return e;
}
function sheetBuffer(tag, stem) {
  const idx = chapterIndex(tag);
  const e = findSheet(idx, stem);
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  return { buf: dbuf.subarray(e.off, e.off + e.size), hdr: parseDDS(dbuf.subarray(e.off, e.off + e.size)), dbuf };
}

// extract the raw DXT1 bytes of one cell as a hex signature
function cellSig(sheet, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;                 // bytes per block-row
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) {
    const base = b0 + by * bpr;
    parts.push(sheet.subarray(base, base + BLKW * 8));
  }
  return Buffer.concat(parts).toString('hex');
}

// ---- seed ----
function seed() {
  const db = {};                                // sig -> char
  const files = fs.readdirSync(WORK).filter(f => /^s\d+_map.*\.json$/.test(f));
  let from = 0;
  for (const f of files) {
    const m = JSON.parse(fs.readFileSync(path.join(WORK, f), 'utf8'));
    const tag = f.slice(0, 3);
    if (!chaps[tag]) continue;
    let sheet;
    try { sheet = sheetBuffer(tag, tag + '0'); } catch (e) { continue; }
    const width = sheet.hdr.width;
    const cols = Math.floor(width / CELL_W), rows = Math.floor(sheet.hdr.height / CELL_H);
    const rgba = decodeDXT1(sheet.buf, sheet.hdr.width, sheet.hdr.height, sheet.hdr.dataOffset);
    const isBlank = (col, row) => {
      let mx = 0;
      for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
        const i = (((row * CELL_H + y) * width) + (col * CELL_W + x)) * 4;
        const l = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
        if (l > mx) mx = l;
      }
      return mx < 40;
    };
    const n = Math.min(m.glyphs.length, cols * rows);
    for (let c = 0; c < n; c++) {
      const ch = m.glyphs[c];
      if (!ch) continue;
      const col = c % cols, row = Math.floor(c / cols);
      if (isBlank(col, row)) continue;                 // injected/empty cell in original sheet
      const sig = cellSig(sheet.buf, sheet.hdr.dataOffset, width, col, row);
      if (!db[sig]) { db[sig] = ch; from++; }
    }
    console.log('seed from', f, 'cells=' + n);
  }
  fs.writeFileSync(TPL, JSON.stringify(db));
  console.log('templates:', Object.keys(db).length, 'unique sigs; wrote', TPL);
}

// Templates harvested from transcribed chapters PLUS the hand-transcribed
// vocabulary (vocab.json holds a sig for every still-unknown cell).
function loadTpl() {
  const db = JSON.parse(fs.readFileSync(TPL, 'utf8'));
  try {
    const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
    const vc = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));
    for (const v of vocab) {
      const ch = vc[String(v.id)];
      if (ch && !db[v.sig]) db[v.sig] = ch;
    }
  } catch (e) { }
  return db;
}

// ---- scan ----
function scan(tags) {
  const db = loadTpl();
  console.log('templates:', Object.keys(db).length);
  for (const tag of tags) {
    let sheet, hdr, cols, rows, total;
    try { sheet = sheetBuffer(tag, tag + '0'); hdr = sheet.hdr; } catch (e) { console.log(tag, 'ERR', e.message); continue; }
    cols = Math.floor(hdr.width / CELL_W); rows = Math.floor(hdr.height / CELL_H); total = cols * rows;
    const matched = new Array(total).fill(null);
    for (let c = 0; c < total; c++) {
      const sig = cellSig(sheet.buf, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
      if (db[sig]) matched[c] = db[sig];
    }
    // how many referenced cells does the message actually use?
    let refs = new Set();
    try {
      const { parseFontdata, readPayload } = require('./msgdecode.js');
      const idx = chapterIndex(tag);
      for (const e of idx.entries) {
        if (!e.name.includes('script/msg/') || !e.name.endsWith(tag + '0.dat')) continue;
        const mbuf = sheet.dbuf.subarray(e.off, e.off + e.size);
        const fd = parseFontdata(mbuf);
        for (let i = 0; i < fd.count; i++) {
          try { for (const g of readPayload(mbuf, fd.entries[i].dataOff + 16).glyphs) refs.add(g); } catch (x) { }
        }
      }
    } catch (e) { }
    const refArr = [...refs].filter(v => v < total).sort((a, b) => a - b);
    const refMatched = refArr.filter(v => matched[v]).length;
    console.log(`${tag}: grid ${cols}x${rows}=${total}  matchedCells=${matched.filter(Boolean).length}  referenced=${refArr.length}  referencedMatched=${refMatched} (${refArr.length ? (100 * refMatched / refArr.length).toFixed(0) : 0}%)  unmatchedRef=${refArr.length - refMatched}`);
  }
}

// ---- write a map (matched cells only) ----
function write(tag) {
  const db = loadTpl();
  const sheet = sheetBuffer(tag, tag + '0'); const hdr = sheet.hdr;
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const glyphs = new Array(cols * rows).fill('');
  let n = 0;
  for (let c = 0; c < cols * rows; c++) {
    const sig = cellSig(sheet.buf, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
    if (db[sig]) { glyphs[c] = db[sig]; n++; }
  }
  const out = { cols, cellW: CELL_W, cellH: CELL_H, sheet: tag + '0.dds', auto: true, note: 'auto-matched from templates; verify before use', glyphs };
  fs.writeFileSync(path.join(WORK, tag + '_map.json'), JSON.stringify(out, null, 2));
  console.log(tag, 'wrote work/' + tag + '_map.json  cells=' + n);
}

const cmd = process.argv[2];
if (cmd === 'seed') seed();
else if (cmd === 'scan') scan(process.argv.slice(3));
else if (cmd === 'write') write(process.argv[3]);
else if (cmd === 'dump') {
  const db = loadTpl(); const tag = process.argv[3];
  const r0 = +(process.argv[4] || 0), r1 = +(process.argv[5] || 0);
  const sheet = sheetBuffer(tag, tag + '0'); const cols = Math.floor(sheet.hdr.width / CELL_W);
  for (let r = r0; r <= r1; r++) {
    const out = [];
    for (let c = 0; c < cols; c++) {
      const g = r * cols + c;
      const sig = cellSig(sheet.buf, sheet.hdr.dataOffset, sheet.hdr.width, c, r);
      out.push(g + ':' + (db[sig] || '·'));
    }
    console.log(out.join('  '));
  }
}
else if (cmd === 'extract') {
  const tag = process.argv[3];
  const sheet = sheetBuffer(tag, tag + '0');
  const out = path.join(WORK, tag + '0_orig.dds');
  fs.writeFileSync(out, sheet.buf);
  console.log('wrote', out, sheet.buf.length, sheet.hdr.width + 'x' + sheet.hdr.height);
}
else if (cmd === 'vocab') {
  // collect every non-blank cell whose signature is not yet in the template DB
  const db = loadTpl();
  const tags = process.argv.slice(3);
  const seen = new Set(), vocab = [];
  for (const tag of tags) {
    let sheet;
    try { sheet = sheetBuffer(tag, tag + '0'); } catch (e) { console.log(tag, 'ERR', e.message); continue; }
    const width = sheet.hdr.width, dof = sheet.hdr.dataOffset;
    const cols = Math.floor(width / CELL_W), rows = Math.floor(sheet.hdr.height / CELL_H);
    const rgba = decodeDXT1(sheet.buf, sheet.hdr.width, sheet.hdr.height, dof);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let mx = 0;
      for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
        const i = (((r * CELL_H + y) * width) + (c * CELL_W + x)) * 4;
        const l = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3; if (l > mx) mx = l;
      }
      if (mx < 40) continue;
      const sig = cellSig(sheet.buf, dof, width, c, r);
      if (db[sig] || seen.has(sig)) continue;
      seen.add(sig);
      vocab.push({ id: vocab.length, sig, tag, cell: r * cols + c });
    }
  }
  const out = path.join(WORK, 'vocab.json');
  fs.writeFileSync(out, JSON.stringify(vocab, null, 1));
  console.log('unknown unique cells:', vocab.length, '->', out);
}
else { console.log('usage: seed | scan <tag...> | write <tag> | dump <tag> <r0> <r1> | extract <tag>'); process.exit(1); }
module.exports = { cellSig, sheetBuffer, chapterIndex };