#!/usr/bin/env node
const __P = require('./_config.js');
// Collect unknown (not-yet-transcribed) glyph cells from arbitrary common.dat sheets
// (movie subtitles, archive jimaku, ...) and render them as readable contact sheets.
//
// usage: node subvocab.js [--render] [--scale=N] [--per=N] <stem> [stem...]
//   writes work/subvocab.json  (id -> {sig,stem,cell})  and optionally PNGs work/subvocab_NN.png
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;

const args = process.argv.slice(2);
const doRender = args.includes('--render');
const SCALE = +((args.find(a => a.startsWith('--scale=')) || '--scale=3').split('=')[1]);
const PER = +((args.find(a => a.startsWith('--per=')) || '--per=120').split('=')[1]);
const COLS = +((args.find(a => a.startsWith('--cols=')) || '--cols=12').split('=')[1]);
const GUT = +((args.find(a => a.startsWith('--gut=')) || '--gut=0').split('=')[1]);
const GRAY = args.includes('--gray');
const stems = args.filter(a => !a.startsWith('--'));

function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
  try {
    const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
    const vc = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));
    for (const v of vocab) { const ch = vc[String(v.id)]; if (ch && !db[v.sig]) db[v.sig] = ch; }
  } catch (e) { }
  return db;
}
function loadSubDb() {
  const db = {};
  try {
    const v = JSON.parse(fs.readFileSync(path.join(WORK, 'subvocab.json'), 'utf8'));
    const vc = JSON.parse(fs.readFileSync(path.join(WORK, 'subvocab_chars.json'), 'utf8'));
    for (const it of v) { const ch = vc[String(it.id)]; if (ch) db[it.sig] = ch; }
  } catch (e) { }
  return db;
}

const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));

function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function getSheet(stem) {
  const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
  if (!ddsE) throw new Error('no .dds for ' + stem);
  const buf = cdat.subarray(ddsE.off, ddsE.off + ddsE.size);
  const hdr = parseDDS(buf);
  return { buf, hdr, cols: Math.floor(hdr.width / CELL_W), rows: Math.floor(hdr.height / CELL_H) };
}

const db = Object.assign({}, loadDb(), loadSubDb());
const seen = new Set(), vocab = [];
const cache = {};
for (const stem of stems) {
  let s;
  try { s = getSheet(stem); } catch (e) { console.log(stem, 'ERR', e.message); continue; }
  const rgba = decodeDXT1(Buffer.from(s.buf), s.hdr.width, s.hdr.height, s.hdr.dataOffset);
  cache[stem] = { hdr: s.hdr, cols: s.cols, rgba };
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
    let mx = 0;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const i = (((r * CELL_H + y) * s.hdr.width) + (c * CELL_W + x)) * 4;
      const l = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3; if (l > mx) mx = l;
    }
    if (mx < 40) continue;
    const sig = cellSig(s.buf, s.hdr.dataOffset, s.hdr.width, c, r);
    if (db[sig] || seen.has(sig)) continue;
    seen.add(sig);
    vocab.push({ id: vocab.length, sig, stem, cell: r * s.cols + c });
  }
}
fs.writeFileSync(path.join(WORK, 'subvocab.json'), JSON.stringify(vocab, null, 1));
console.log('unknown unique cells:', vocab.length, '-> work/subvocab.json');

// ---- frequency pass: how often is each unknown cell referenced in message text? ----
const { parseFontdata, readPayload } = require('./msgdecode.js');
const sigToId = new Map(vocab.map(v => [v.sig, v.id]));
const counts = new Array(vocab.length).fill(0);
let totalUnknownRefs = 0;
for (const stem of stems) {
  const s = cache[stem];
  if (!s) continue;
  const datE = cidx.entries.find(e => e.name === stem + '.dat');
  if (!datE) continue;
  const mbuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
  let fd; try { fd = parseFontdata(mbuf); } catch (e) { continue; }
  // cell -> id for this sheet
  const cellId = new Array(s.cols * s.hdr.height / CELL_H | 0).fill(-1);
  const rows = Math.floor(s.hdr.height / CELL_H);
  for (let r = 0; r < rows; r++) for (let c = 0; c < s.cols; c++) {
    const sig = cellSig(cdat.subarray(cidx.entries.find(e => e.name === stem + '.dds').off,
      cidx.entries.find(e => e.name === stem + '.dds').off + cidx.entries.find(e => e.name === stem + '.dds').size),
      s.hdr.dataOffset, s.hdr.width, c, r);
    const id = sigToId.get(sig);
    if (id !== undefined) cellId[r * s.cols + c] = id;
  }
  for (let i = 0; i < fd.count; i++) {
    try {
      for (const g of readPayload(mbuf, fd.entries[i].dataOff + 16).glyphs) {
        if (g < cellId.length && cellId[g] >= 0) { counts[cellId[g]]++; totalUnknownRefs++; }
      }
    } catch (x) { }
  }
}
const freq = vocab.map((v, i) => ({ id: v.id, count: counts[i] })).sort((a, b) => b.count - a.count);
fs.writeFileSync(path.join(WORK, 'subvocab_freq.json'), JSON.stringify(freq, null, 1));
const topN = +((args.find(a => a.startsWith('--top=')) || '--top=40').split('=')[1]);
let cum = 0; for (const f of freq) cum += f.count;
const shown = freq.slice(0, topN);
let cumTop = 0; for (const f of shown) cumTop += f.count;
console.log('total unknown refs:', totalUnknownRefs, ' covers', vocab.length, 'unique cells');
console.log('top', topN, 'cells cover', cumTop, '/', totalUnknownRefs, 'refs =', (100 * cumTop / (totalUnknownRefs || 1)).toFixed(0) + '%');
console.log(shown.map(f => f.id + ':' + f.count).join(' '));

// render only the top-N cells (in frequency order) when --toprender is given
if (args.includes('--toprender')) {
  const items = shown.map(f => vocab[f.id]);
  const rows = Math.ceil(items.length / COLS);
  const cw = CELL_W * SCALE + GUT, chh = CELL_H * SCALE + GUT;
  const ow = COLS * cw, oh = rows * chh;
  const cv = Buffer.alloc(ow * oh * 4, 255);
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const s = cache[it.stem];
    const cc = it.cell % s.cols, rr = Math.floor(it.cell / s.cols);
    const r = Math.floor(k / COLS), c = k % COLS;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const si = ((rr * CELL_H + y) * s.hdr.width + (cc * CELL_W + x)) * 4;
      const l = Math.round((s.rgba[si] + s.rgba[si + 1] + s.rgba[si + 2]) / 3);
      const v = GRAY ? l : (l > 40 ? 0 : 255);
      for (let yy = 0; yy < SCALE; yy++) for (let xx = 0; xx < SCALE; xx++) {
        const d = ((r * chh + y * SCALE + yy) * ow + (c * cw + x * SCALE + xx)) * 4;
        cv[d] = cv[d + 1] = cv[d + 2] = v; cv[d + 3] = 255;
      }
    }
  }
  for (let r = 0; r <= rows; r++) { const y = r * chh - 1; if (y >= 0 && y < oh) for (let x = 0; x < ow; x++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = 200; } }
  for (let c = 0; c <= COLS; c++) { const x = c * cw - 1; if (x < 0 || x >= ow) continue; const col = (c % 5 === 0) ? 90 : 200; for (let y = 0; y < oh; y++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = col; } }
  const out = path.join(WORK, `subvocab_top${topN}.png`);
  writePNG(out, ow, oh, cv);
  fs.writeFileSync(path.join(WORK, `subvocab_top${topN}.txt`),
    shown.map((f, k) => `pos ${Math.floor(k / COLS)},${k % COLS}  id=${f.id}  count=${f.count}`).join('\n') + '\n');
  console.log('wrote', out);
}

if (doRender) {
  const batches = Math.ceil(vocab.length / PER);
  const layout = [];
  for (let bi = 0; bi < batches; bi++) {
    const items = vocab.slice(bi * PER, bi * PER + PER);
    const rows = Math.ceil(items.length / COLS);
    const cw = CELL_W * SCALE + GUT, chh = CELL_H * SCALE + GUT;
    const ow = COLS * cw, oh = rows * chh;
    const cv = Buffer.alloc(ow * oh * 4, 255);
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const s = cache[it.stem];
      const cc = it.cell % s.cols, rr = Math.floor(it.cell / s.cols);
      const r = Math.floor(k / COLS), c = k % COLS;
      for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
        const si = ((rr * CELL_H + y) * s.hdr.width + (cc * CELL_W + x)) * 4;
        const l = Math.round((s.rgba[si] + s.rgba[si + 1] + s.rgba[si + 2]) / 3);
        const v = l > 40 ? 0 : 255;   // dark glyph on white
        for (let yy = 0; yy < SCALE; yy++) for (let xx = 0; xx < SCALE; xx++) {
          const d = ((r * chh + y * SCALE + yy) * ow + (c * cw + x * SCALE + xx)) * 4;
          cv[d] = cv[d + 1] = cv[d + 2] = v; cv[d + 3] = 255;
        }
      }
    }
    // grid lines
    for (let r = 0; r <= rows; r++) { const y = r * chh - 1; if (y >= 0 && y < oh) for (let x = 0; x < ow; x++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = 200; } }
    for (let c = 0; c <= COLS; c++) { const x = c * cw - 1; if (x < 0 || x >= ow) continue; const col = (c % 5 === 0) ? 90 : 200; for (let y = 0; y < oh; y++) { const d = (y * ow + x) * 4; cv[d] = cv[d + 1] = cv[d + 2] = col; } }
    const out = path.join(WORK, `subvocab_${String(bi).padStart(2, '0')}.png`);
    writePNG(out, ow, oh, cv);
    console.log('wrote', out, 'ids', bi * PER, '..', bi * PER + items.length - 1);
    layout.push(`# ${path.basename(out)}  ids ${bi * PER}..${bi * PER + items.length - 1}  (${COLS} per row)`);
  }
  fs.writeFileSync(path.join(WORK, 'subvocab_layout.txt'), layout.join('\n') + '\n');
}
module.exports = { loadDb, getSheet, cellSig };