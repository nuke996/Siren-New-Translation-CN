#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const stem = process.argv[2];
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const datE = cidx.entries.find(e => e.name === stem + '.dat');
const mbuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
const count = mbuf.readUInt32BE(12);
const entries = [];
for (let i = 0; i < count; i++) { const p = 16 + i * 8; entries.push({ nameOff: mbuf.readUInt32BE(p), dataOff: mbuf.readUInt32BE(p + 4) }); }
const nameStart = Math.min(...entries.map(e => e.nameOff + 16));
const abs = entries.map(e => e.dataOff + 16);
const order = abs.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
const endOf = new Map();
order.forEach((o, k) => endOf.set(o.i, Math.min(k + 1 < order.length ? order[k + 1].a : mbuf.length, nameStart)));
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }
function headerEnd(buf, a) { const i = buf.indexOf(MARK, a); return i + MARK.length + 2; }
function readMsg(buf, a) { let p = headerEnd(buf, a), style = null; const out = []; while (p + 1 < buf.length) { const v = buf.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { style = buf.readUInt16BE(p); p += 2; continue; } if (v >= 0xff00) continue; out.push(v); } return { style, glyphs: out }; }
for (const want of process.argv.slice(3)) {
  const i = entries.findIndex(e => readCStr(mbuf, e.nameOff + 16) === want);
  if (i < 0) { console.log(want, 'NOT FOUND'); continue; }
  const { style, glyphs } = readMsg(mbuf, abs[i]);
  const room = endOf.get(i) - headerEnd(mbuf, abs[i]);
  console.log(`${want}  style=${style}  glyphs=${glyphs.length}  room=${room}  maxChars=${Math.floor((room - (style !== null ? 4 : 0) - 2) / 2)}`);
}