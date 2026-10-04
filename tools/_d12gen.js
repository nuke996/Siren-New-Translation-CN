#!/usr/bin/env node
const __P = require('./_config.js');
// D12 (menu/jp/main_status|main_map) A8-mask generator, driven by work/d12/trans.json.
//
// trans.json = {
//   "defaults": { "<groupDir>": { "size":22, "bold":1, "align":"left", "x":0, "y":0 } },
//   "items": {
//     "menu/jp/.../foo.dds": { "text":"..." }            // single line
//     "menu/jp/.../bar.dds": { "lines":["a","b"] }        // multi line
//     "menu/jp/.../baz.dds": { "text":"...", "size":20, "align":"center" }
//   }
// }
// usage: node _d12gen.js [--into <patch.json>] [--only <substr>]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const MASK = path.join(WORK, 'mask');
fs.mkdirSync(MASK, { recursive: true });

const trans = JSON.parse(fs.readFileSync(path.join(WORK, 'd12/trans.json'), 'utf8'));
const only = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');

const patch = [];
let n = 0;
for (const [name, spec0] of Object.entries(trans.items)) {
  if (only && !name.includes(only)) continue;
  const e = idx.entries.find(x => x.name === name);
  if (!e) { console.log('MISSING ' + name); continue; }
  const group = name.replace(/\/[^/]+$/, '');
  const d = (trans.defaults && trans.defaults[group]) || {};
  const safe = name.replace(/[^A-Za-z0-9_]+/g, '_');
  const origDds = path.join(MASK, safe + '.orig.dds');
  const outDds = path.join(MASK, safe + '.dds');
  const preview = path.join(MASK, safe + '.png');
  fs.writeFileSync(origDds, dat.subarray(e.off, e.off + e.size));
  const lines = spec0.lines
    ? spec0.lines.map((t, i) => ({ text: t, y: (spec0.y !== undefined ? spec0.y : d.y || 0) + i * (spec0.lh || d.lh || 26) }))
    : [{ text: spec0.text, y: spec0.y !== undefined ? spec0.y : d.y || 0 }];
  const spec = {
    font: 'SimHei',
    size: spec0.size || d.size || 22,
    bold: spec0.bold !== undefined ? spec0.bold : (d.bold !== undefined ? d.bold : 1),
    align: spec0.align || d.align || 'left',
    lines,
  };
  if (d.x !== undefined || spec0.x !== undefined) for (const l of spec.lines) if (l.x === undefined) l.x = spec0.x !== undefined ? spec0.x : d.x;
  const specPath = path.join(MASK, safe + '.spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 1), 'utf8');
  execFileSync(process.execPath, [path.join(TOOLS, 'build_mask.js'), origDds, specPath, outDds, preview], { stdio: 'inherit' });
  const sz = fs.statSync(outDds).size;
  if (sz > e.size) { console.log(`  OVER ${name} ${sz} > ${e.size}`); continue; }
  patch.push({ name, file: outDds });
  n++;
}
console.log(`\n== D12 generated ${n} / ${Object.keys(trans.items).length} items`);
const intoIdx = process.argv.indexOf('--into');
if (intoIdx >= 0) {
  const dest = process.argv[intoIdx + 1];
  const cur = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : {};
  for (const p of patch) cur[p.name] = p.file;
  fs.writeFileSync(dest, JSON.stringify(cur, null, 1));
  console.log(`  merged into ${dest} (total ${Object.keys(cur).length})`);
}
