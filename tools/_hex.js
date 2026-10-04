#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseFontdata } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const stem = process.argv[2];
const datE = cidx.entries.find(e => e.name === stem + '.dat');
const mbuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
const fd = parseFontdata(mbuf);
const want = process.argv.slice(3);
for (let i = 0; i < fd.count; i++) {
  let e = fd.entries[i].nameOff + 16, s = e; while (mbuf[s] !== 0) s++;
  const name = mbuf.toString('utf8', e, s);
  if (want.length && !want.includes(name)) continue;
  const abs = fd.entries[i].dataOff + 16;
  const hex = [];
  for (let k = 0; k < 40; k += 2) hex.push(mbuf.readUInt16BE(abs + k).toString(16).padStart(4, '0'));
  console.log(name.padEnd(16), 'abs=' + abs, hex.join(' '));
}