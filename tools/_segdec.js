#!/usr/bin/env node
// Decode a named FONTDATA record's payload, splitting at the inline width marker (=B).
// usage: node _segdec.js <dat> <map.json> <name...>
'use strict';
const fs = require('fs');
const { parseFontdata } = require('./msgdecode.js');
const [dat, mapPath, ...names] = process.argv.slice(2);
const buf = fs.readFileSync(dat);
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8')).glyphs || [];
const fd = parseFontdata(buf);
const readCStr = (off) => { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); };
const MARK = Buffer.from('fffd181cfffc', 'hex');
const abs = fd.entries.map(e => e.dataOff + 16);
const nameStart = Math.min(...fd.entries.map(x => x.nameOff + 16));
const order = abs.map((a, i) => ({ a, i })).sort((p, q) => p.a - q.a);
const endOf = new Map();
order.forEach((o, k) => endOf.set(o.i, Math.min(k + 1 < order.length ? order[k + 1].a : buf.length, nameStart)));
const want = new Set(names);
for (let i = 0; i < fd.count; i++) {
  const nm = readCStr(fd.entries[i].nameOff + 16);
  if (want.size && !want.has(nm)) continue;
  const s = abs[i], e = endOf.get(i);
  const flag = buf.readUInt16BE(s), A = buf.readUInt16BE(s + 2);
  const B = flag === 0x0201 ? buf.readUInt16BE(s + 4) : 0;
  const mi = buf.indexOf(MARK, s);
  if (mi < 0) { console.log(nm, 'no marker'); continue; }
  const hdrEnd = mi + MARK.length + 2;
  const tailA = buf.readUInt16BE(hdrEnd - 2);
  const seg1 = [], seg2 = [];
  let cur = seg1, sawMark = false;
  const toks = [];
  for (let p = hdrEnd; p + 1 < e; p += 2) {
    const v = buf.readUInt16BE(p);
    if (v === 0xffff) break;
    if (v === 0xfffb) { p += 2; toks.push(`<style:${buf.readUInt16BE(p)}>`); continue; }
    if (v >= 0xff00) { toks.push(`<ctl:${v.toString(16)}>`); continue; }
    if (!sawMark && B > 0 && v === B) { sawMark = true; cur = seg2; toks.push(`|MARK|`); continue; }
    const ch = map[v] || '◇';
    cur.push(ch); toks.push(process.env.SEGCELLS ? `${ch}#${v} ` : ch);
  }
  console.log(`\n${nm}  flag=${flag.toString(16)} A=${A} B=${B} tailA=${tailA}  seg1=${seg1.length} seg2=${seg2.length}`);
  console.log(`  seg1: ${seg1.join('')}`);
  console.log(`  seg2: ${seg2.join('')}`);
  console.log(`  toks: ${toks.join('')}`);
}
