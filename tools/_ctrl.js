#!/usr/bin/env node
const __P = require('./_config.js');
// Dump the raw u16 stream of one message (original) to look for layout control codes.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const MARK = Buffer.from('fffd181cfffc', 'hex');
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
  const mi = buf.indexOf(MARK, abs);
  let p = mi + MARK.length;
  const codes = [];
  for (let k = 0; k < 8; k++) { codes.push(buf.readUInt16BE(p).toString(16)); p += 2; }
  console.log(`${nm} flag=0x${flag.toString(16)} start=${abs} mark@${mi} bytesBeforeMark=${mi - abs} firstU16AfterMark=${codes.join(' ')}`);
  // full tail scan until 0xffff, flag control codes
  let q = mi + MARK.length; const ctrl = []; let n = 0;
  while (q + 1 < buf.length && n < 400) { const v = buf.readUInt16BE(q); q += 2; n++; if (v === 0xffff) break; if (v >= 0xff00) ctrl.push('@' + (n - 1) + ':0x' + v.toString(16)); }
  console.log('   controls(full):', ctrl.join(' ') || '(none)');
}