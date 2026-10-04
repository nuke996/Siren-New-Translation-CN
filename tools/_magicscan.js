#!/usr/bin/env node
const __P = require('./_config.js');
// Find EVERY text container in the game and report whether it is handled.
// Scans common.dat entries and each chapter archive for known magics:
//   FONTDATA, MSN_DATA, JMK_DATA, TCD_DATA, plus plain UTF-8 .txt/.dat.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');

const MAGICS = ['FONTDATA', 'MSN_DATA', 'JMK_DATA', 'TCD_DATA', 'HUDSDDAT', 'TCD_DATA'];

function scan(buf, name, out) {
  const head = buf.toString('latin1', 0, 16);
  for (const m of ['FONTDATA', 'MSN_DATA', 'JMK_DATA', 'TCD_DATA']) {
    if (head.startsWith(m)) { out.push({ name, magic: m, size: buf.length }); return; }
  }
}
const found = [];
// common.dat
for (const e of cidx.entries) {
  if (!/\.(dat|dds|tbl|txt|ssd|jmk|uvd|film|epm|bin|lst|tcd)$/i.test(e.name)) continue;
  scan(cdat.subarray(e.off, e.off + Math.min(e.size, 64)), e.name, found);
}
const byMagic = {};
for (const f of found) (byMagic[f.magic] = byMagic[f.magic] || []).push(f);
console.log('=== common.dat text containers ===');
for (const [m, list] of Object.entries(byMagic)) console.log(`${m}: ${list.length}   e.g. ${list.slice(0, 3).map(x => x.name).join(', ')}`);

// chapters
console.log('\n=== chapter text containers ===');
const tags = [];
for (let i = 1; i <= 25; i++) tags.push('s' + String(i).padStart(2, '0'));
let perChapter = {};
for (const tag of tags) {
  const ch = cidx.entries.find(x => x.name === tag + '.hed');
  if (!ch) continue;
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const fbuf = fs.readFileSync(HDD + tag + '.dat');
  const f2 = [];
  for (const e of idx.entries) {
    if (!/\.(dat|tbl|txt|ssd|jmk|uvd|film|epm|bin|lst|tcd)$/i.test(e.name)) continue;
    scan(fbuf.subarray(e.off, e.off + Math.min(e.size, 64)), e.name, f2);
  }
  perChapter[tag] = f2.map(x => x.name + '[' + x.magic + ']');
}
const allNames = new Set();
for (const [t, l] of Object.entries(perChapter)) { console.log(`${t}: ${l.length}  ${l.join(' ')}`); l.forEach(x => allNames.add(x.replace(/^.*\//, '').replace(/s\d\d/, 'sXX'))); }
console.log('\ncontainer name patterns across chapters: ' + [...allNames].join(', '));