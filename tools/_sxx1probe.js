#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
// Probe the second chapter sheet (sXX1): DDS dimensions + FONTDATA message count.
// usage: node _sxx1probe.js [tag...]   (default s01..s25)
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');
const { parseFontdata } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const tags = process.argv.slice(2).length ? process.argv.slice(2) : Array.from({ length: 25 }, (_, i) => 's' + String(i + 1).padStart(2, '0'));
for (const tag of tags) {
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  if (!ch) { console.log(tag, 'no chapter'); continue; }
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  for (const s of ['0', '1']) {
    const ddsE = idx.entries.find(e => e.name.endsWith(tag + s + '.dds'));
    const datE = idx.entries.find(e => e.name.endsWith(tag + s + '.dat'));
    if (!ddsE) { console.log(tag + s, 'no dds'); continue; }
    const hdr = parseDDS(dbuf.subarray(ddsE.off, ddsE.off + ddsE.size));
    let cnt = '-';
    if (datE) { const fd = parseFontdata(Buffer.from(dbuf.subarray(datE.off, datE.off + datE.size))); cnt = fd.count; }
    console.log(tag + s, hdr.width + 'x' + hdr.height, 'msgs=' + cnt);
  }
}