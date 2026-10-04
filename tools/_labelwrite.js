#!/usr/bin/env node
const __P = require('./_config.js');
// Rewrite hud/launcher/label.dat messages from work/label_zh.json (lines) using
// work/label_cells.json (char -> cell index) produced by _labelgen.js.
//
// label record grammar (big endian, verified):
//   u16 flag | u16 x N widths | FF FD <ctl> FF FC | u16 w[0]
//   seg0: <tokens> <glyphs>  then for k=1..N-1: FF FE FF FC | u16 w[k] | <tokens> <glyphs>
//   u16 0xFFFF
//   N = flag>>8.  Text lines map to the N segment slots whose original width != 0
//   (the other slots are blank paragraphs).  Glyph advance = 16 px.
//
// usage: node _labelwrite.js
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/`;
const ADV = 16;

const dat = fs.readFileSync(D + 'label.dat');
const cells = JSON.parse(fs.readFileSync(D + 'label_cells.json', 'utf8'));
const zh = JSON.parse(fs.readFileSync(D + 'label_zh.json', 'utf8'));
const textOf = new Map(zh.lines.map(l => [l.name, l.text.split('\n')]));

const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
recs.sort((a, b) => a.dataOff - b.dataOff);
const nameStart = Math.min(...recs.map(r => r.nameOff));
recs.forEach((r, i) => { r.name = nameOf(r.nameOff); r.next = i + 1 < recs.length ? recs[i + 1].dataOff : nameStart; });

function parse(start, end) {
  const flag = dat.readUInt16BE(start), N = flag >> 8;
  const widths = [];
  for (let k = 0; k < N; k++) widths.push(dat.readUInt16BE(start + 2 + 2 * k));
  let p = start + 2 + 2 * N;
  if (dat.readUInt16BE(p) !== 0xfffd) throw new Error('no FFFD @' + p);
  const ctl = dat.readUInt16BE(p + 2); p += 4;
  if (dat.readUInt16BE(p) !== 0xfffc) throw new Error('no FFFC @' + p);
  p += 2;
  const segs = [];
  for (let k = 0; k < N; k++) {
    if (k > 0) {
      if (dat.readUInt16BE(p) !== 0xfffe || dat.readUInt16BE(p + 2) !== 0xfffc) throw new Error('no FFFE FFFC @' + p);
      p += 4;
    }
    const w = dat.readUInt16BE(p); p += 2;
    const tokens = [], glyphs = [];
    while (p + 1 < end) {
      const v = dat.readUInt16BE(p);
      if (v === 0xffff || v === 0xfffe) break;
      if (v === 0xfffd || v === 0xfffb) { tokens.push([v, dat.readUInt16BE(p + 2)]); p += 4; continue; }
      if (v === 0xfffc) { p += 2; continue; }
      if (v < 0xff00) { glyphs.push(v); p += 2; continue; }
      tokens.push([v]); p += 2;
    }
    segs.push({ w, tokens, glyphs });
  }
  return { flag, N, widths, ctl, segs };
}

const out = Buffer.from(dat);
let totalEdits = 0;
for (const r of recs) {
  const rec = parse(r.dataOff, r.next);
  const lines = textOf.get(r.name);
  if (!lines) throw new Error('no draft for ' + r.name);
  if (rec.segs[k0(rec)] === undefined) { }
  const textIdx = rec.widths.map((w, k) => w !== 0 ? k : -1).filter(k => k >= 0);
  if (textIdx.length !== lines.length) throw new Error(`${r.name}: ${textIdx.length} text slots vs ${lines.length} draft lines`);
  const lineAt = new Map();
  textIdx.forEach((k, i) => lineAt.set(k, lines[i]));

  const newW = rec.widths.map((w, k) => lineAt.has(k) ? ADV * lineAt.get(k).length : 0);
  const parts = [];
  const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16BE(v & 0xffff, 0); return b; };
  parts.push(u16(rec.flag));
  for (let k = 0; k < rec.N; k++) parts.push(u16(newW[k]));
  parts.push(u16(0xfffd), u16(rec.ctl), u16(0xfffc));
  for (let k = 0; k < rec.N; k++) {
    if (k > 0) parts.push(u16(0xfffe), u16(0xfffc));
    parts.push(u16(newW[k]));
    for (const t of rec.segs[k].tokens) { for (const x of t) parts.push(u16(x)); }
    const txt = lineAt.get(k);
    if (txt !== undefined) {
      for (const ch of txt) {
        const cell = cells[ch];
        if (cell === undefined) throw new Error(`no cell for "${ch}" in ${r.name}`);
        parts.push(u16(cell));
      }
    }
  }
  parts.push(u16(0xffff));
  const body = Buffer.concat(parts);
  const room = r.next - r.dataOff;
  if (body.length > room) throw new Error(`${r.name} too big: ${body.length} > ${room}`);
  const pad = Buffer.alloc(room - body.length, 0xff);
  Buffer.concat([body, pad]).copy(out, r.dataOff);
  const glyphs = [...lineAt.values()].reduce((a, s) => a + s.length, 0);
  console.log(`${r.name.padEnd(17)} flag=0x${rec.flag.toString(16)} N=${rec.N} slots=[${textIdx.join(',')}] glyphs=${glyphs} body=${body.length}/${room}`);
  totalEdits++;
}
fs.writeFileSync(D + 'label_zh.dat', out);
console.log(`wrote label_zh.dat (${out.length} B, same size: ${out.length === dat.length}) edits=${totalEdits}`);
function k0() { return 0; }