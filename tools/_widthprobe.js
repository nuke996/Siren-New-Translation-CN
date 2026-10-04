#!/usr/bin/env node
// Probe the per-record width metadata in a FONTDATA file vs the glyph-token count,
// to explain subtitle centring. usage: node _widthprobe.js <dat> [maxShow]
'use strict';
const fs = require('fs');
const { parseFontdata } = require('./msgdecode.js');
const file = process.argv[2];
const maxShow = Number(process.argv[3] || 200);
const buf = fs.readFileSync(file);
const fd = parseFontdata(buf);
const readCStr = (off) => { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); };
const entries = [];
for (let i = 0; i < fd.count; i++) entries.push({ name: readCStr(fd.entries[i].nameOff + 16), a: fd.entries[i].dataOff + 16 });
const nameStart = Math.min(...fd.entries.map(x => x.nameOff + 16));
const order = entries.map((x, i) => ({ a: x.a, i })).sort((p, q) => p.a - q.a);
const endOf = new Map();
order.forEach((o, k) => endOf.set(o.i, Math.min(k + 1 < order.length ? order[k + 1].a : buf.length, nameStart)));
const MARK = Buffer.from('fffd181cfffc', 'hex');
let shown = 0;
for (let i = 0; i < fd.count && shown < maxShow; i++) {
  const s = entries[i].a, e = endOf.get(i);
  const idx = buf.indexOf(MARK, s);
  if (idx < 0 || idx >= e) { console.log(entries[i].name, 'no marker'); continue; }
  const hdrEnd = idx + MARK.length + 2;
  const flag = buf.readUInt16BE(s);
  const A = buf.readUInt16BE(s + 2);
  const B = flag === 0x0201 ? buf.readUInt16BE(s + 4) : null;
  const tailA = buf.readUInt16BE(hdrEnd - 2);
  let oc = 0;
  for (let p = hdrEnd; p + 1 < e; p += 2) { const v = buf.readUInt16BE(p); if (v === 0xffff) break; if (v < 0xff00) oc++; }
  console.log(`${entries[i].name}  flag=${flag.toString(16)}  A=${A} tailA=${tailA} B=${B}  glyphs=${oc}  A/g=${oc ? (A / oc).toFixed(2) : '-'}`);
  shown++;
}