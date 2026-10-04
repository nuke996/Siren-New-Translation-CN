#!/usr/bin/env node
const __P = require('./_config.js');
// Validate the subagent-produced per-batch archive translations and merge them
// into work/archive_zh.json  =  { "menu/jp/main_archive/archives/01/a01_text_1.dds": [{jp,zh},...], ... }
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const ZH = path.join(WORK, 'archzh');
const layouts = JSON.parse(fs.readFileSync(path.join(WORK, 'archlayout.json'), 'utf8'));
const byShort = {};
for (const p of layouts) byShort[p.entry.replace(/^.*\//, '').replace(/\.dds$/, '')] = p;

const out = {};
let pages = 0, lines = 0, errs = 0;
for (const f of fs.readdirSync(ZH).filter(x => /^batch_\d+\.json$/.test(x)).sort()) {
  const arr = JSON.parse(fs.readFileSync(path.join(ZH, f), 'utf8'));
  for (const pg of arr) {
    const meta = byShort[pg.entry];
    if (!meta) { console.log('UNKNOWN entry', pg.entry, 'in', f); errs++; continue; }
    if (!Array.isArray(pg.lines) || pg.lines.length !== meta.lines.length) {
      console.log(`LINE MISMATCH ${pg.entry}: got ${pg.lines ? pg.lines.length : 'n/a'} want ${meta.lines.length}`); errs++;
    }
    out[meta.entry] = pg.lines;
    pages++; lines += (pg.lines || []).length;
  }
}
fs.writeFileSync(path.join(WORK, 'archive_zh.json'), JSON.stringify(out, null, 1));
console.log(`merged ${pages}/${layouts.length} pages, ${lines} lines, errors=${errs}`);
const missing = layouts.filter(p => !out[p.entry]).map(p => p.entry);
if (missing.length) console.log('MISSING:', missing.join(', '));