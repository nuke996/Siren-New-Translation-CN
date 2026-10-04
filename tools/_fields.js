#!/usr/bin/env node
const __P = require('./_config.js');
// For each record in a FONTDATA table, print flag, header fields and glyph count.
// Goal: see whether a header field encodes pixel width (=> subtitle centering source).
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const [stem] = process.argv.slice(2);
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const datE = cidx.entries.find(e => e.name === stem + '.dat');
const buf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
const count = buf.readUInt32BE(12);
const ent = [];
for (let i = 0; i < count; i++) { const p = 16 + i * 8; ent.push({ nameOff: buf.readUInt32BE(p), dataOff: buf.readUInt32BE(p + 4) }); }
function cstr(o) { let e = o; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', o, e); }
const MARK = Buffer.from('fffd181cfffc', 'hex');
console.log('name                 flag  A     B     glyphs  fffe?');
for (let i = 0; i < count; i++) {
  const abs = ent[i].dataOff + 16;
  const flag = buf.readUInt16BE(abs);
  const h1 = buf.readUInt16BE(abs + 2);
  const h2 = flag === 0x201 ? buf.readUInt16BE(abs + 4) : -1;
  const mi = buf.indexOf(MARK, abs);
  let p = mi + MARK.length + 2, n = 0, hasSep = false;
  while (p + 1 < buf.length) { const v = buf.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffe) { hasSep = true; continue; } if (v >= 0xff00) continue; n++; }
  console.log(cstr(ent[i].nameOff + 16).padEnd(20), '0x' + flag.toString(16), String(h1).padStart(5), String(h2).padStart(5), String(n).padStart(6), hasSep ? '  Y' : '');
}