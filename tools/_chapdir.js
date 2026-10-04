#!/usr/bin/env node
const __P = require('./_config.js');
// List the entries of a chapter archive (sNN.hed is embedded in common.dat; the
// chapter's payload is HDD sNN.dat). usage: node _chapdir.js s01 [filter]
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const tag = process.argv[2];
const filter = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');
const ch = cidx.entries.find(e => e.name === tag + '.hed');
if (!ch) { console.error('no ' + tag + '.hed'); process.exit(1); }
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
console.log(tag + '.hed entries=' + idx.entries.length);
for (const e of idx.entries) {
  if (filter && !filter.test(e.name)) continue;
  console.log(`  ${String(e.off).padStart(9)} ${String(e.size).padStart(9)}  ${e.name}`);
}