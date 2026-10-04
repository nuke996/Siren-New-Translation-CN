#!/usr/bin/env node
const __P = require('./_config.js');
// List, per chapter, the script/msg/*.dat + paired .dds entries inside its .hed.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
for (const e of cidx.entries) {
  if (!(e.name.length === 7 && e.name.startsWith('s') && e.name.endsWith('.hed'))) continue;
  const tag = e.name.slice(0, 3);
  const idx = parseHed(cdat.subarray(e.off, e.off + e.size));
  const dats = idx.entries.filter(x => /script\/msg\/.*\.dat$/.test(x.name));
  const dds = idx.entries.filter(x => /script\/msg\/.*\.dds$/.test(x.name));
  console.log(tag, 'msgdats=' + dats.length, 'dds=' + dds.length,
    '|', dats.map(d => d.name.split('/').pop() + '(' + d.size + ')').join(' '),
    '|', dds.map(d => d.name.split('/').pop() + '(' + d.size + ')').join(' '));
}