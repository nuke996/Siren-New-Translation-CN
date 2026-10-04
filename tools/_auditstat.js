#!/usr/bin/env node
const __P = require('./_config.js');
// For every exported table (work/import/*.orig.dat + matching *.map.json),
// report how many DISTINCT glyph cells are referenced by messages and are still
// unknown (map entry empty). That is the real audit size for "correct Japanese".
'use strict';
const fs = require('fs');
const path = require('path');
const { parseFontdata } = require('./msgdecode.js');
const DIR = `${__P.WORK}/import`;

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.orig.dat'));
const rows = [];
const agg = { mainChap: { cells: 0, unk: 0 }, movie: { cells: 0, unk: 0 }, other: { cells: 0, unk: 0 } };
const unkCellsByStem = {};
for (const f of files) {
  const stem = f.replace('.orig.dat', '');
  const mapPath = path.join(DIR, stem + '.map.json');
  if (!fs.existsSync(mapPath)) continue;
  let map;
  try { map = JSON.parse(fs.readFileSync(mapPath, 'utf8')); } catch (e) { continue; }
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
  const unk = [...used].filter(c => !glyphs[c]);
  rows.push({ stem, used: used.size, unk: unk.length, total: glyphs.length });
  unkCellsByStem[stem] = unk;
  const bucket = /^s\d/.test(stem) ? agg.mainChap : (/movie/.test(stem) ? agg.movie : agg.other);
  bucket.cells += used.size; bucket.unk += unk.length;
}
rows.sort((a, b) => b.unk - a.unk);
for (const r of rows) if (r.unk) console.log(`${r.stem}  used ${r.used}  UNKNOWN ${r.unk}`);
console.log('\n== totals (sum over tables, NOT deduped across tables) ==');
console.log('chapter main  sXX0:', JSON.stringify(agg.mainChap));
console.log('movie tables      :', JSON.stringify(agg.movie));
console.log('other (archive)   :', JSON.stringify(agg.other));
fs.writeFileSync(path.join(DIR, '_unknown_cells.json'), JSON.stringify(unkCellsByStem, null, 2));
console.log('\nwrote _unknown_cells.json (' + Object.keys(unkCellsByStem).length + ' stems)');