#!/usr/bin/env node
const __P = require('./_config.js');
// F-probe: does fontidexu8.tbl (char->glyph) cover the Chinese chars we wrote into
// the UTF-8 text containers (system.dat etc.)?  If yes, runtime Chinese can resolve
// to a glyph slot in font01.dds; if the slot's bitmap is still Japanese, it renders wrong.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');

const W = `${__P.WORK}/`;
const HDD = `${__P.HDD}/`;
const HED = HDD + 'common.hed';
const DAT = HDD + 'common.dat';

// --- decode fontidexu8.tbl byChar (table B) ---
const tb = fs.readFileSync(W + 'fontidexu8.tbl');
const byChar = {};
for (let o = 2000; o + 8 <= tb.length; o += 8) {
  const raw = Buffer.from([tb[o], tb[o + 1], tb[o + 2], tb[o + 3]]).reverse();
  const s = raw.toString('utf8');
  if (s.includes('\uFFFD')) continue;
  const t = s.replace(/\0+$/g, '');
  if (!t) continue;
  const g = tb.readUInt32BE(o + 4);
  if (byChar[t] === undefined) byChar[t] = g;
}

// --- read a container entry ---
const idx = parseHed(fs.readFileSync(HED));
const dat = fs.readFileSync(DAT);
function ent(name) { const e = idx.entries.find(x => x.name === name); return e ? dat.subarray(e.off, e.off + e.size) : null; }

const targets = ['text/system.dat'];
for (const name of targets) {
  const b = ent(name);
  if (!b) { console.log('MISS', name); continue; }
  console.log('== ' + name + ' (' + b.length + 'B) ==');
  const s = b.toString('utf8');
  console.log(JSON.stringify(s.slice(0, 400)));
  const chars = [...new Set([...s].filter(c => c.codePointAt(0) > 0x7f))];
  const missing = chars.filter(c => byChar[c] === undefined);
  console.log('non-ASCII unique chars: ' + chars.length + '  missing in font table: ' + missing.length);
  if (missing.length) console.log('  missing -> ' + missing.join('') + '  codes=' + missing.map(c => 'U+' + c.codePointAt(0).toString(16)).join(' '));
}
