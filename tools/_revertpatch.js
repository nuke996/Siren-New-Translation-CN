#!/usr/bin/env node
const __P = require('./_config.js');
// Revert selected patched entries back to their ORIGINAL disc bytes.
// Rewrites work/patch_common.json so those entries point at the extracted
// originals (so every future _deploy.js keeps them original).
//
// usage: node _revertpatch.js <nameSubstring> [nameSubstring ...]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');

const BASE = `${__P.DISC}/`;
const W = `${__P.WORK}`;
const OUT = path.join(W, 'revert');
const PATCH = path.join(W, 'patch_common.json');
fs.mkdirSync(OUT, { recursive: true });

const subs = process.argv.slice(2);
if (!subs.length) { console.error('usage: node _revertpatch.js <substr> ...'); process.exit(1); }

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const patch = JSON.parse(fs.readFileSync(PATCH, 'utf8'));
let n = 0;
for (const name of Object.keys(patch)) {
  if (!subs.some(s => name.includes(s))) continue;
  const e = idx.entries.find(x => x.name === name);
  if (!e) { console.log('MISSING in disc: ' + name); continue; }
  const safe = name.replace(/[^A-Za-z0-9_]+/g, '_');
  const out = path.join(OUT, safe + '.dds');
  fs.writeFileSync(out, dat.subarray(e.off, e.off + e.size));
  patch[name] = out;
  n++;
}
fs.writeFileSync(PATCH, JSON.stringify(patch, null, 1));
console.log(`reverted ${n} entries to original disc bytes -> ${OUT}`);
console.log(`patch_common.json now has ${Object.keys(patch).length} entries`);