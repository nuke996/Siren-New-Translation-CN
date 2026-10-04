#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
// Inspect one FONTDATA record: header fields + full u16 body stream (raw, no marker skip).
// usage: node _probe201.js <stem> <msgIndex> [chapterTag]
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseFontdata } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const MARK = Buffer.from('fffd181cfffc', 'hex');
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }

const stem = process.argv[2], want = parseInt(process.argv[3], 10), chapter = process.argv[4];
let cidx2 = cidx, datBuf = cdat;
if (chapter) {
  const ch = cidx.entries.find(e => e.name === chapter + '.hed');
  cidx2 = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  datBuf = fs.readFileSync(BASE + chapter + '.dat');
}
const datE = cidx2.entries.find(e => e.name === stem + '.dat');
const buf = Buffer.from(datBuf.subarray(datE.off, datE.off + datE.size));
const fd = parseFontdata(buf);
const abs = fd.entries[want].dataOff + 16;
const flag = buf.readUInt16BE(abs), A = buf.readUInt16BE(abs + 2), B = buf.readUInt16BE(abs + 4);
const mi = buf.indexOf(MARK, abs);
console.log('name=' + readCStr(buf, fd.entries[want].nameOff + 16) + ' abs=' + abs +
  ' flag=0x' + flag.toString(16) + ' A=' + A + '(/22=' + (A / 22) + ') B=' + B + '(/22=' + (B / 22) + ') markAt=' + (mi - abs));
console.log('hdr bytes: ' + buf.subarray(abs, mi).toString('hex') + ' | ' + buf.subarray(mi, mi + 6).toString('hex'));
let p = mi + MARK.length + 2; const vals = [];
while (p + 1 < buf.length) { const v = buf.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; vals.push(v); }
console.log('raw vals(' + vals.length + '): ' + vals.join(','));
console.log('max=' + Math.max(...vals) + '  candidates(==B): ' + vals.map((v, i) => v === B ? i : -1).filter(i => i >= 0).join(','));