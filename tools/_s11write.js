#!/usr/bin/env node
const __P = require('./_config.js');
// Rewrite a chapter's sXX1 FONTDATA messages with Chinese, preserving the original
// inline button-icon control tokens (FFFD/FFFB/FFFC) and per-segment layout.
// Grammar (big endian):
//   u16 flag | u16 x N widths | FF FD <ctl> FF FC | u16 w[0]
//   seg0: <token|glyph-run ...>  then for k=1..N-1: FF FE FF FC | u16 w[k] | <...>
//   u16 0xFFFF
// Each glyph run (maximal consecutive index < 0xFF00) is replaced by the matching
// draft run; tokens stay in place.  New segment width = iconW + 16*newCount,
// iconW = max(0, oldW - 16*oldCount).  Advance = 16 px (verified).
//
// usage: node _s11write.js <tag>
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = process.env.SNT_BASE || `${__P.DISC}/`;
const D = `${__P.WORK}/`;
const IMP = D + 'import/';
const ADV = 16;
const tag = process.argv[2];
if (!tag) { console.log('usage: node _s11write.js <tag>'); process.exit(1); }

const cells = JSON.parse(fs.readFileSync(D + tag + '1_cells.json', 'utf8'));
const draft = JSON.parse(fs.readFileSync(D + 'zh_draft_sxx1.json', 'utf8'));
const chap = draft[tag] || {};
const draftOf = (n, flag) => chap[n + '@0x' + flag.toString(16)] || chap[n] || draft.shared[n];
function toFW(s) { let o = ''; for (const ch of s) { const c = ch.codePointAt(0); o += (c >= 0x21 && c <= 0x7e) ? String.fromCodePoint(c + 0xfee0) : ch; } return o; }

const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const datE = idx.entries.find(e => e.name.endsWith(tag + '1.dat'));
const dat = Buffer.from(dbuf.subarray(datE.off, datE.off + datE.size));

const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
const nameStart = Math.min(...recs.map(r => r.nameOff));
recs.sort((a, b) => a.dataOff - b.dataOff);
recs.forEach((r, i) => { r.name = nameOf(r.nameOff); r.next = i + 1 < recs.length ? recs[i + 1].dataOff : nameStart; });

// parse one record -> segs: [{w, skel:[{t:[u16,...]}| {run:[idx...]}], runs:[len...]}]
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
    if (k > 0) { if (dat.readUInt16BE(p) !== 0xfffe || dat.readUInt16BE(p + 2) !== 0xfffc) throw new Error('no sep @' + p); p += 4; }
    const w = dat.readUInt16BE(p); p += 2;
    const skel = [];
    while (p + 1 < end) {
      const v = dat.readUInt16BE(p);
      if (v === 0xffff || v === 0xfffe) break;
      if (v === 0xfffd || v === 0xfffb) { skel.push({ t: [v, dat.readUInt16BE(p + 2)] }); p += 4; continue; }
      if (v === 0xfffc) { skel.push({ t: [v] }); p += 2; continue; }
      if (v < 0xff00) {
        const run = [];
        while (p + 1 < end) { const u = dat.readUInt16BE(p); if (u >= 0xff00) break; run.push(u); p += 2; }
        skel.push({ run }); continue;
      }
      skel.push({ t: [v] }); p += 2;
    }
    segs.push({ w, skel, runs: skel.filter(s => s.run).map(s => s.run.length) });
  }
  return { flag, N, ctl, segs };
}

const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16BE(v & 0xffff, 0); return b; };
const out = Buffer.from(dat);
let edits = 0;
for (const r of recs) {
  const rec = parse(r.dataOff, r.next);
  const segsText = draftOf(r.name, rec.flag);
  if (!segsText) throw new Error('no draft for ' + r.name);
  if (segsText.length !== rec.segs.length) throw new Error(`${r.name}: draft segs ${segsText.length} != ${rec.segs.length}`);
  const parts = [u16(rec.flag)];
  // new widths
  const newW = rec.segs.map((s, k) => {
    const oldCount = s.runs.reduce((a, b) => a + b, 0);
    const iconW = Math.max(0, s.w - ADV * oldCount);
    const runsTxt = segsText[k];
    if (runsTxt.length !== s.runs.length) throw new Error(`${r.name} seg${k}: draft runs ${runsTxt.length} != ${s.runs.length}`);
    const newCount = runsTxt.reduce((a, t) => a + toFW(t).length, 0);
    return iconW + ADV * newCount;
  });
  for (let k = 0; k < rec.N; k++) parts.push(u16(newW[k]));
  parts.push(u16(0xfffd), u16(rec.ctl), u16(0xfffc));
  for (let k = 0; k < rec.N; k++) {
    if (k > 0) parts.push(u16(0xfffe), u16(0xfffc));
    parts.push(u16(newW[k]));
    let ri = 0;
    for (const el of rec.segs[k].skel) {
      if (el.t) { for (const x of el.t) parts.push(u16(x)); continue; }
      const txt = toFW(segsText[k][ri++]);
      for (const c of txt) { const cell = cells[c]; if (cell === undefined) throw new Error(`no cell for "${c}" (${r.name})`); parts.push(u16(cell)); }
    }
  }
  parts.push(u16(0xffff));
  const body = Buffer.concat(parts);
  const room = r.next - r.dataOff;
  if (body.length > room) throw new Error(`${r.name} too big: ${body.length} > ${room}`);
  Buffer.concat([body, Buffer.alloc(room - body.length, 0xff)]).copy(out, r.dataOff);
  console.log(`${r.name.padEnd(18)} flag=0x${rec.flag.toString(16)} N=${rec.N} oldW=[${rec.segs.map(s => s.w)}] newW=[${newW}] body=${body.length}/${room}`);
  edits++;
}
fs.mkdirSync(IMP, { recursive: true });
fs.writeFileSync(IMP + tag + '1.dat', out);
console.log(`wrote import/${tag}1.dat (${out.length} B, same size: ${out.length === dat.length}) edits=${edits}`);