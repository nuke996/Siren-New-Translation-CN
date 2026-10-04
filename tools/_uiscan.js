const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const WORK = `${__P.WORK}/`;
const idx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const dat = fs.readFileSync(HDD + 'common.dat');
const patched = new Set();
for (const f of ['patch_common.json', 'patch_font.json']) {
  try { for (const k of Object.keys(JSON.parse(fs.readFileSync(WORK + f, 'utf8')))) patched.add(k); } catch (e) {}
}
const filter = process.argv[2] || 'menu/jp/';
const rows = [];
for (const e of idx.entries) {
  if (!e.name.startsWith(filter) || !e.name.endsWith('.dds')) continue;
  const o = e.off;
  const magic = dat.toString('ascii', o, o + 4);
  if (magic !== 'DDS ') { rows.push({ name: e.name, size: e.size, fmt: 'notDDS:' + JSON.stringify(magic) }); continue; }
  const h = dat.readUInt32LE(o + 12), w = dat.readUInt32LE(o + 16);
  const pfFlags = dat.readUInt32LE(o + 80), fourCC = dat.toString('ascii', o + 84, o + 88).replace(/\0/g, ' ').trim();
  const bpp = dat.readUInt32LE(o + 88), rM = dat.readUInt32LE(o + 92), gM = dat.readUInt32LE(o + 96), bM = dat.readUInt32LE(o + 100), aM = dat.readUInt32LE(o + 104);
  let fmt;
  if (fourCC) fmt = fourCC;
  else fmt = `raw${bpp} r${rM.toString(16)} g${gM.toString(16)} b${bM.toString(16)} a${aM.toString(16)}`;
  rows.push({ name: e.name, size: e.size, w, h, fmt, patched: patched.has(e.name) });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
if (process.argv.includes('--unpatched')) {
  for (const r of rows) if (!r.patched) console.log(`${r.w ? r.w + 'x' + r.h : '???'}\t${r.fmt}\t${r.name}`);
  console.log('unpatched', rows.filter(r => !r.patched).length);
  process.exit(0);
}
if (process.argv.includes('--dirs')) {
  const m = new Map();
  for (const r of rows) if (!r.patched) { const d = r.name.replace(/\/[^/]*$/, ''); m.set(d, (m.get(d) || 0) + 1); }
  for (const [d, c] of [...m.entries()].sort()) console.log(String(c).padStart(4), d);
  console.log('unpatched', rows.filter(r => !r.patched).length, 'in', m.size, 'dirs');
  process.exit(0);
}
for (const r of rows) console.log(`${r.patched ? '[x]' : '[ ]'} ${r.w ? r.w + 'x' + r.h : '???'} ${String(r.fmt).padEnd(26)} ${String(r.size).padStart(8)}  ${r.name}`);
console.log('total', rows.length, 'unpatched', rows.filter(r => !r.patched).length);
