#!/usr/bin/env node
const __P = require('./_config.js');
// Verify the packed common.dat: for edited movie messages, A/B should equal 22 * zh glyph count.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const DIR = `${__P.WORK}/pack2/`;
const WORK = `${__P.WORK}`;
const cdat = fs.readFileSync(DIR + 'common.dat');
const cidx = parseHed(fs.readFileSync(DIR + 'common.hed'));
const MARK = Buffer.from('fffd181cfffc', 'hex');
const datE = cidx.entries.find(e => e.name === 'hud/movie/ep01_cp1.dat');
const buf = cdat.subarray(datE.off, datE.off + datE.size);
const count = buf.readUInt32BE(12);
function cstr(o) { let e = o; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', o, e); }
const merged = JSON.parse(fs.readFileSync(WORK + '/import/hud_movie_ep01_cp1.merged.json', 'utf8'));
const gl = merged.glyphs;
for (let i = 0; i < count; i++) {
  const p = 16 + i * 8;
  const name = cstr(buf.readUInt32BE(p) + 16);
  if (!/^(EP01_CP1_0[126]|ARCHIVE001)$/.test(name)) continue;
  const abs = buf.readUInt32BE(p + 4) + 16;
  const flag = buf.readUInt16BE(abs);
  const a = buf.readUInt16BE(abs + 2);
  const b = flag === 0x201 ? buf.readUInt16BE(abs + 4) : '-';
  const mi = buf.indexOf(MARK, abs);
  let q = mi + MARK.length + 2, g = 0, raw = [];
  while (q + 1 < buf.length) { const v = buf.readUInt16BE(q); q += 2; if (v === 0xffff) break; if (v >= 0xff00) { raw.push('0x' + v.toString(16)); continue; } g++; }
  let text = '';
  q = mi + MARK.length + 2;
  while (q + 1 < buf.length) { const v = buf.readUInt16BE(q); q += 2; if (v === 0xffff) break; if (v >= 0xff00) continue; text += (gl[v] || '?'); }
  console.log(`${name} flag=0x${flag.toString(16)} A=${a} B=${b} glyphs=${g} expectA=${22 * g} ctrl=[${raw.join(',')}]\n   "${text}"`);
}