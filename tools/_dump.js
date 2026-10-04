#!/usr/bin/env node
const __P = require('./_config.js');
// Full u16 dump of a FONTDATA record (original BASE data), to inspect control codes.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const [stem, ...names] = process.argv.slice(2);
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const datE = cidx.entries.find(e => e.name === stem + '.dat');
const buf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
const count = buf.readUInt32BE(12);
const ent = [];
for (let i = 0; i < count; i++) { const p = 16 + i * 8; ent.push({ nameOff: buf.readUInt32BE(p), dataOff: buf.readUInt32BE(p + 4) }); }
function cstr(o) { let e = o; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', o, e); }
for (const nm of names) {
  const i = ent.findIndex(e => cstr(e.nameOff + 16) === nm);
  if (i < 0) { console.log(nm, 'NOT FOUND'); continue; }
  const abs = ent[i].dataOff + 16;
  const flag = buf.readUInt16BE(abs);
  console.log(`\n=== ${nm} flag=0x${flag.toString(16)} abs=${abs} ===`);
  const vals = [];
  let p = abs, n = 0;
  while (p + 1 < buf.length && n < 200) { const v = buf.readUInt16BE(p); vals.push(v); p += 2; n++; if (v === 0xffff) break; }
  for (let k = 0; k < vals.length; k += 12) {
    const seg = vals.slice(k, k + 12);
    console.log('  ' + String(k).padStart(3) + ': ' + seg.map(v => v.toString(16).padStart(4, '0')).join(' '));
  }
}