#!/usr/bin/env node
const __P = require('./_config.js');
// Extract one entry from a chapter archive. usage: node _chapext.js <tag> <entryName> <outFile>
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const [tag, name, out] = process.argv.slice(2);
const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');
const ch = cidx.entries.find(e => e.name === tag + '.hed');
if (!ch) { console.error('no ' + tag + '.hed'); process.exit(1); }
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const e = idx.entries.find(x => x.name === name);
if (!e) { console.error('not found: ' + name); process.exit(1); }
const fd = fs.openSync(HDD + tag + '.dat', 'r');
const buf = Buffer.alloc(e.size);
fs.readSync(fd, buf, 0, e.size, e.off);
fs.closeSync(fd);
fs.writeFileSync(out, buf);
console.log(`${tag}:${name} -> ${out}  ${e.size} B @${e.off}`);