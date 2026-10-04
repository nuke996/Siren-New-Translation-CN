// Extract one entry from a SNTP archive to a file. usage: node _getent.js <arch.hed> <arch.dat> <entryName> <outPath>
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const [, , hed, dat, name, out] = process.argv;
const idx = parseHed(fs.readFileSync(hed));
const e = idx.entries.find(x => x.name === name);
if (!e) { console.error('not found: ' + name); process.exit(1); }
const buf = fs.readFileSync(dat);
fs.writeFileSync(out, buf.subarray(e.off, e.off + e.size));
console.log(`${name} -> ${out}  ${e.size} B  @${e.off}`);