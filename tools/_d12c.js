#!/usr/bin/env node
const __P = require('./_config.js');
// Merge D12 part files into trans.json + validate keys against common.hed.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const D = `${__P.WORK}/d12/`;
const BASE = `${__P.DISC}/`;
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const names = new Set(idx.entries.map(e => e.name));

const trans = JSON.parse(fs.readFileSync(D + 'trans.json', 'utf8'));
const before = Object.keys(trans.items).length;
for (const f of fs.readdirSync(D).filter(x => /^part_.*\.json$/.test(x)).sort()) {
  const p = JSON.parse(fs.readFileSync(D + f, 'utf8'));
  for (const [g, d] of Object.entries(p.defaults || {})) trans.defaults[g] = Object.assign(trans.defaults[g] || {}, d);
  let bad = 0, n = 0;
  for (const [k, v] of Object.entries(p.items || {})) {
    if (!names.has(k)) { console.log('  BAD KEY in ' + f + ': ' + k); bad++; continue; }
    trans.items[k] = v; n++;
  }
  console.log(`${f}: +${n} items  (${bad} bad keys)`);
}
fs.writeFileSync(D + 'trans.json', JSON.stringify(trans, null, 1));
const after = Object.keys(trans.items).length;
console.log(`trans.json items ${before} -> ${after}`);
// coverage report against the D12 groups
const groups = {};
for (const e of idx.entries) {
  if (!/^menu\/jp\/main_(status|map)\//.test(e.name) || !/\.dds$/i.test(e.name)) continue;
  if (/item_img|weapon_img|gui_map|\/element\//.test(e.name)) continue;
  const g = e.name.replace(/\/[^/]+$/, '');
  groups[g] = groups[g] || [0, 0];
  groups[g][1]++;
  if (trans.items[e.name]) groups[g][0]++;
}
for (const g of Object.keys(groups).sort()) console.log(`  cover ${String(groups[g][0]).padStart(4)}/${String(groups[g][1]).padStart(4)}  ${g}`);
