#!/usr/bin/env node
const __P = require('./_config.js');
// F-probe 2: for the 3 UTF-8 text containers, compare original (disc) vs deployed (HDD) text
// and report which non-ASCII chars are absent from fontidexu8.tbl.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');

const W = `${__P.WORK}/`;
const DISC = `${__P.DISC}/`;
const HDD = `${__P.HDD}/`;

const tb = fs.readFileSync(W + 'fontidexu8.tbl');
const byChar = {};
for (let o = 2000; o + 8 <= tb.length; o += 8) {
  const raw = Buffer.from([tb[o], tb[o + 1], tb[o + 2], tb[o + 3]]).reverse();
  const s = raw.toString('utf8');
  if (s.includes('\uFFFD')) continue;
  const t = s.replace(/\0+$/g, '');
  if (!t) continue;
  if (byChar[t] === undefined) byChar[t] = tb.readUInt32BE(o + 4);
}

const names = ['text/system.dat', 'installarchive/header_music.txt', 'installarchive/header_photo.txt', 'setting/render_setting.txt'];
const idxD = parseHed(fs.readFileSync(DISC + 'common.hed'));
const datD = fs.readFileSync(DISC + 'common.dat');
const idxH = parseHed(fs.readFileSync(HDD + 'common.hed'));
const datH = fs.readFileSync(HDD + 'common.dat');
const ent = (idx, dat, n) => { const e = idx.entries.find(x => x.name === n); return e ? dat.subarray(e.off, e.off + e.size) : null; };

// rebuild byChar from the DEPLOYED tbl (honours the grown size field)
{
  const t = ent(idxH, datH, 'fontidexu8.tbl');
  console.log('deployed fontidexu8.tbl size: ' + t.length + ' B');
  for (let o = 2000; o + 8 <= t.length; o += 8) {
    const raw = Buffer.from([t[o], t[o + 1], t[o + 2], t[o + 3]]).reverse();
    const s = raw.toString('utf8');
    if (s.includes('\uFFFD')) continue;
    const c = s.replace(/\0+$/g, '');
    if (!c) continue;
    if (byChar[c] === undefined) byChar[c] = t.readUInt32BE(o + 4);
  }
  console.log('deployed unique chars: ' + Object.keys(byChar).length);
}

const allMissing = new Set();
for (const n of names) {
  const d = ent(idxD, datD, n), h = ent(idxH, datH, n);
  console.log('\n===== ' + n + ' =====');
  console.log('DISC  : ' + JSON.stringify((d || Buffer.alloc(0)).toString('utf8').replace(/\r/g, '\\r')));
  console.log('HDD   : ' + JSON.stringify((h || Buffer.alloc(0)).toString('utf8').replace(/\r/g, '\\r')));
  const s = (h || Buffer.alloc(0)).toString('utf8');
  const chars = [...new Set([...s].filter(c => c.codePointAt(0) > 0x7f))];
  const missing = chars.filter(c => byChar[c] === undefined);
  missing.forEach(c => allMissing.add(c));
  console.log('HDD non-ASCII uniq=' + chars.length + ' missing=' + missing.length + (missing.length ? ' -> ' + missing.join('') : ''));
}
console.log('\n===== ALL MISSING (union) =====');
console.log([...allMissing].join('') + '   (' + allMissing.size + ' chars)');