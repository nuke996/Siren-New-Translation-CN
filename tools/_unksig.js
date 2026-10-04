#!/usr/bin/env node
const __P = require('./_config.js');
// Deduplicate the "unknown" glyph cells (bitmaps whose char is not yet in the
// decode DB) ACROSS all exported tables, keyed by cellSig. The decode DB is
// sig-keyed, so one identified sig fixes that glyph in every table that shares it.
// -> yields the real workload for "export correct Japanese".
//
// usage: node _unksig.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parseFontdata } = require('./msgdecode.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const DIR = `${__P.WORK}/import`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;

function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}

const sigAgg = new Map();   // sig -> { n, tables:Set, cells:Set, sample:{stem,col,row,width,h,dataOffset} }
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
  const used = new Set();
  for (let i = 0; i < fd.count; i++) {
    let p = fd.entries[i].dataOff + 16 + 12;
    for (; p + 1 < buf.length; p += 2) {
      const v = buf.readUInt16BE(p);
      if (v === 0xffff) break;
      if (v >= 0xff00) { if (v === 0xfffb) p += 2; continue; }
      used.add(v);
    }
  }
  const sheet = fs.readFileSync(ddsPath);
  const hdr = parseDDS(sheet);
  const cols = Math.floor(hdr.width / CELL_W);
  let unk = 0;
  for (const c of used) {
    if (glyphs[c]) continue;
    unk++;
    const col = c % cols, row = Math.floor(c / cols);
    const sig = cellSig(sheet, hdr.dataOffset, hdr.width, col, row);
    let a = sigAgg.get(sig);
    if (!a) { a = { n: 0, tables: new Set(), cells: new Set(), sample: { stem, c, col, row, width: hdr.width, h: hdr.height, dataOffset: hdr.dataOffset } }; sigAgg.set(sig, a); }
    a.n++; a.tables.add(stem); a.cells.add(c);
  }
  perTable.push({ stem, used: used.size, unk });
}

const arr = [...sigAgg.entries()].map(([sig, a]) => ({ sig, n: a.n, tables: [...a.tables], cells: [...a.cells], sample: a.sample }))
  .sort((x, y) => y.n - x.n);
const cls = s => /^s\d/.test(s) ? 'chapter' : (/movie/.test(s) ? 'movie' : 'archive/other');
const byCls = { chapter: 0, movie: 0, 'archive/other': 0 };
for (const r of arr) byCls[cls(r.sample.stem)]++;

console.log('distinct unknown glyph bitmaps (sig-keyed, deduped across ALL tables):', arr.length);
for (const k of Object.keys(byCls)) console.log('   ' + k + ': ' + byCls[k]);
console.log('\ntop 40 by occurrence (times-referenced across tables):');
for (const r of arr.slice(0, 40)) console.log('  x' + String(r.n).padStart(3) + '  tables=' + String(r.tables.length).padStart(2) + '  ' + r.sample.stem + ' cell ' + r.sample.c + '  sig=' + r.sig.slice(0, 16) + '…');

fs.writeFileSync(path.join(DIR, '_unksigs.json'), JSON.stringify(arr.map((r, i) => ({ i, n: r.n, ntables: r.tables.length, sample: r.sample.stem, cell: r.sample.c, sig: r.sig })), null, 1));

// ---- contact sheet: render one representative cell per distinct sig, x2 scale ----
const S = 2, GCOLS = 20;
const rows = Math.ceil(arr.length / GCOLS);
const ow = GCOLS * CELL_W * S, oh = rows * CELL_H * S;
const cv = Buffer.alloc(ow * oh * 4);
for (let i = 0; i < ow * oh; i++) { cv[i * 4] = 255; cv[i * 4 + 1] = 255; cv[i * 4 + 2] = 255; cv[i * 4 + 3] = 255; }
for (let k = 0; k < arr.length; k++) {
  const s = arr[k].sample;
  const sheet = fs.readFileSync(path.join(DIR, s.stem + '.orig.dds'));
  const rgba = decodeDXT1(sheet, s.width, s.h, s.dataOffset);
  const gx = (k % GCOLS) * CELL_W * S, gy = Math.floor(k / GCOLS) * CELL_H * S;
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const si = (((s.row * CELL_H + y) * s.width) + (s.col * CELL_W + x)) * 4;
    const lum = (rgba[si] + rgba[si + 1] + rgba[si + 2]) / 3;
    const g = 255 - Math.round(lum);
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const di = ((gy + y * S + dy) * ow + (gx + x * S + dx)) * 4;
      cv[di] = g; cv[di + 1] = g; cv[di + 2] = g; cv[di + 3] = 255;
    }
  }
  // thin separator
  for (let y = 0; y < CELL_H * S; y++) { const x = gx; if (x < ow) { const di = ((gy + y) * ow + x) * 4; cv[di] = cv[di + 1] = cv[di + 2] = 200; } }
}
writePNG(path.join(DIR, '_unksigs.png'), ow, oh, cv);
console.log('\nwrote _unksigs.json and _unksigs.png (' + ow + 'x' + oh + ', reading order = _unksigs.json index)');