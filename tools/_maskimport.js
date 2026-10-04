#!/usr/bin/env node
const __P = require('./_config.js');
// Batch-render A8 mask entries from an archive and emit a sntp_pack patch.
// Reusable for every A8 (menu/UI) localisation set (mission hints, pause text,
// manual, archive documents, ...).
//
// usage: node _maskimport.js <job.json>
// job.json = {
//   "arch": "common",                    // archive prefix under PS3_GAME/.../data
//   "font": "SimHei", "size": 46, "bold": 1, "align": "center",
//   "items": [ { "name": "menu/jp/.../s01_object_main.dds",
//                "lines": [ { "text": "...", "y": 0 } ] }, ... ]
// }
// writes work/mask/<safe>.dds for each item and work/mask/patch.json
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const OUTDIR = path.join(WORK, 'mask');
const TOOLS = `${__P.TOOLS}`;

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const arch = job.arch || 'common';
const idx = parseHed(fs.readFileSync(BASE + arch + '.hed'));
const dat = fs.readFileSync(BASE + arch + '.dat');
fs.mkdirSync(OUTDIR, { recursive: true });

const patch = [];
const results = [];
for (const it of job.items) {
  const e = idx.entries.find(x => x.name === it.name);
  if (!e) { console.log('MISSING entry: ' + it.name); continue; }
  const safe = it.name.replace(/[^A-Za-z0-9_]+/g, '_');
  const origDds = path.join(OUTDIR, safe + '.orig.dds');
  const outDds = path.join(OUTDIR, safe + '.dds');
  const preview = path.join(OUTDIR, safe + '.png');
  fs.writeFileSync(origDds, dat.subarray(e.off, e.off + e.size));
  const spec = {
    font: it.font || job.font || 'SimHei',
    size: it.size || job.size || 46,
    bold: it.bold !== undefined ? it.bold : (job.bold !== undefined ? job.bold : 1),
    align: it.align || job.align || 'center',
    lines: it.lines,
  };
  if (it.keep) spec.keep = true;
  if (it.clear) spec.clear = it.clear;
  const specPath = path.join(OUTDIR, safe + '.spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 1), 'utf8');
  execFileSync(process.execPath, [path.join(TOOLS, 'build_mask.js'), origDds, specPath, outDds, preview], { stdio: 'inherit' });
  patch.push({ name: it.name, file: outDds });
  results.push({ name: it.name, out: outDds, size: fs.statSync(outDds).size, orig: e.size });
}
const patchPath = path.join(OUTDIR, 'patch.json');
fs.writeFileSync(patchPath, JSON.stringify({ arch, entries: patch }, null, 1));
console.log(`\n== ${job.items.length} items processed, patch -> ${patchPath}`);
// Optional: merge the flat {name:file} map into an existing sntp_pack patch file
// (used by _deploy.js). usage: node _maskimport.js <job.json> --into <patch.json>
const intoIdx = process.argv.indexOf('--into');
if (intoIdx >= 0 && process.argv[intoIdx + 1]) {
  const dest = process.argv[intoIdx + 1];
  const cur = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : {};
  let n = 0;
  for (const p of patch) { cur[p.name] = p.file; n++; }
  fs.writeFileSync(dest, JSON.stringify(cur, null, 1));
  console.log(`  merged ${n} entries into ${dest} (total ${Object.keys(cur).length})`);
}
let bad = 0;
for (const r of results) if (r.size > r.orig) { bad++; console.log(`  OVER: ${r.name} ${r.size} > ${r.orig}`); }
console.log(`  oversize: ${bad}`);