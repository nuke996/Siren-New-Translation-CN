#!/usr/bin/env node
const __P = require('./_config.js');
// Dump / extract small UTF-8 text entries from an archive.
// usage: node _txtdump.js <archPrefix> <nameContains>
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}/`;
const [prefix, contains] = process.argv.slice(2);
const idx = parseHed(fs.readFileSync(BASE + prefix + '.hed'));
const dat = fs.readFileSync(BASE + prefix + '.dat');
const hits = idx.entries.filter(e => e.name.includes(contains));
console.log(`# ${hits.length} entries matching "${contains}" in ${prefix}`);
for (const e of hits) {
  const buf = dat.subarray(e.off, e.off + e.size);
  console.log(`\n===== ${e.name} (${e.size} B) =====`);
  console.log(JSON.stringify(buf.toString('utf8')));
}