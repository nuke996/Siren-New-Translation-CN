#!/usr/bin/env node
const __P = require('./_config.js');
// Audit movie subtitle coverage: every hud/movie/*.jmk names the FONTDATA records
// it plays.  Collect the record names available in every .dat text table
// (common.dat movie/archive/label + each chapter's script/msg + hud/mission) and
// report jmk-referenced names that exist nowhere -> untranslated / missing text.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');

const HDD = `${__P.HDD}/`;
const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');

function fontNames(buf) {
  const out = [];
  if (buf.toString('ascii', 0, 8) !== 'FONTDATA') return out;
  const count = buf.readUInt32BE(12);
  for (let i = 0; i < count; i++) {
    const no = buf.readUInt32BE(16 + i * 8) + 16;
    let e = no; while (e < buf.length && buf[e] !== 0) e++;
    out.push(buf.toString('ascii', no, e));
  }
  return out;
}

// 1) every record name known in common.dat .dat entries
const known = new Set();
let datCount = 0;
for (const e of cidx.entries) {
  if (!/\.dat$/i.test(e.name)) continue;
  const b = cdat.subarray(e.off, e.off + e.size);
  const n = fontNames(b);
  if (n.length) { datCount++; for (const x of n) known.add(x); }
}
console.log('common.dat .dat FONTDATA tables=' + datCount + '  distinct record names=' + known.size);

// 2) chapter archives: script/msg + hud/mission record names
const tags = [];
for (let i = 1; i <= 25; i++) tags.push('s' + String(i).padStart(2, '0'));
let chapNames = 0;
for (const tag of tags) {
  const ch = cidx.entries.find(x => x.name === tag + '.hed');
  if (!ch) continue;
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const fbuf = fs.readFileSync(HDD + tag + '.dat');
  for (const e of idx.entries) {
    if (!/\.dat$/i.test(e.name)) continue;
    const b = fbuf.subarray(e.off, e.off + e.size);
    const n = fontNames(b);
    for (const x of n) { known.add(x); chapNames++; }
  }
}
console.log('names after chapters: ' + known.size + ' (chapter records=' + chapNames + ')');

// 3) jmk-referenced names
function asciiNames(buf) {
  const s = buf.toString('latin1');
  const m = s.match(/[A-Z][A-Z0-9_]{4,}/g) || [];
  return [...new Set(m)];
}
const jmks = cidx.entries.filter(e => /^hud\/movie\/.*\.jmk$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
console.log('\nmovie jmk files=' + jmks.length);
let gaps = 0;
for (const e of jmks) {
  const b = cdat.subarray(e.off, e.off + e.size);
  const names = asciiNames(b).filter(n => /^(EP|ARCHIVE)/.test(n) && (/_\d\d$/.test(n) || /^ARCHIVE\d+$/.test(n)));
  const missing = names.filter(n => !known.has(n));
  if (missing.length) {
    console.log(`  ${e.name}: refs=${names.length} MISSING=${missing.length}  ${missing.join(',')}`);
    gaps++;
  }
}
console.log('\njmk with missing records: ' + gaps + ' / ' + jmks.length);