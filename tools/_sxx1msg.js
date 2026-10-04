const __P = require('./_config.js');
'use strict';
// Dump sXX1 FONTDATA records raw: header fields + full u16 stream.
// usage: node _sxx1msg.js <tag> [maxMsgs]
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseFontdata } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const tag = process.argv[2] || 's01';
const maxMsgs = parseInt(process.argv[3] || '14', 10);
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const datE = idx.entries.find(e => e.name.endsWith(tag + '1.dat'));
const buf = Buffer.from(fs.readFileSync(BASE + tag + '.dat').subarray(datE.off, datE.off + datE.size));
const fd = parseFontdata(buf);
function cstr(o) { let e = o; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', o, e); }
console.log(`${tag}1  count=${fd.count}  size=${buf.length}`);
for (let i = 0; i < Math.min(fd.count, maxMsgs); i++) {
  const e = fd.entries[i];
  const abs = e.dataOff + 16;
  const name = cstr(e.nameOff + 16);
  const flag = buf.readUInt16BE(abs), N = flag >> 8;
  const widths = []; for (let k = 0; k < N; k++) widths.push(buf.readUInt16BE(abs + 2 + 2 * k));
  console.log(`\n[${i}] ${name} abs=${abs} flag=0x${flag.toString(16)} N=${N} widths=[${widths.join(',')}]`);
  // dump u16 opcodes until 0xffff
  let p = abs + 2 + 2 * N; const toks = [];
  let end = buf.indexOf(Buffer.from('ffff', 'hex'), p);
  if (end < 0 || end % 2 !== 0) end = buf.length - 2;
  let guard = 0;
  while (p + 1 < buf.length && guard++ < 4000) {
    const v = buf.readUInt16BE(p); p += 2;
    if (v === 0xffff) { toks.push('END'); break; }
    if (v === 0xfffd) { toks.push(`FD(${buf.readUInt16BE(p)})`); p += 2; continue; }
    if (v === 0xfffb) { toks.push(`FB(${buf.readUInt16BE(p)})`); p += 2; continue; }
    if (v === 0xfffc) { toks.push('FC'); continue; }
    if (v === 0xfffe) { toks.push('FE'); continue; }
    if (v >= 0xff00) { toks.push('0x' + v.toString(16)); continue; }
    toks.push(String(v));
  }
  console.log('  ' + toks.join(' '));
}