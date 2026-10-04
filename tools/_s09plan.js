#!/usr/bin/env node
const __P = require('./_config.js');
// Plan the s09 translation: how many of s09's records already have a translation
// elsewhere in the project (reusable), and which need fresh translation.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const W = `${__P.WORK}/`;
const base = n => n.replace(/@0x[0-9a-f]+$/i, '');

// build global name -> text (first wins) + record conflicts
const map = {}, conflicts = new Set();
for (const f of fs.readdirSync(W)) {
  let j;
  const p = W + f;
  if (/^zh_draft_chapter_s\d+\.json$/.test(f)) { j = JSON.parse(fs.readFileSync(p, 'utf8')); for (const l of j.lines || []) { const k = base(l.name); if (!(k in map)) map[k] = l.text; else if (map[k] !== l.text) conflicts.add(k); } }
}
{
  const j = JSON.parse(fs.readFileSync(W + 'zh_draft_sxx1.json', 'utf8'));
  const walk = o => { for (const [k, v] of Object.entries(o || {})) { const kk = base(k); const t = Array.isArray(v) ? v.map(r => r.join('')).join('|') : v; if (typeof t === 'string') { if (!(kk in map)) map[kk] = t; else if (map[kk] !== t) conflicts.add(kk); } } };
  walk(j.shared); for (const k of Object.keys(j)) if (k !== 'shared' && k !== '_note') walk(j[k]);
}
console.log('global reusable names=' + Object.keys(map).length + '  conflicting=' + conflicts.size);

// s09 records
const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');
const ch = cidx.entries.find(x => x.name === 's09.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const fbuf = fs.readFileSync(HDD + 's09.dat');
function names(suffix) {
  const e = idx.entries.find(x => x.name.endsWith('s09' + suffix));
  if (!e) return null;
  const b = fbuf.subarray(e.off, e.off + e.size);
  const n = b.readUInt32BE(12), out = [];
  for (let i = 0; i < n; i++) { const no = b.readUInt32BE(16 + i * 8) + 16; let en = no; while (b[en] !== 0) en++; out.push(b.toString('utf8', no, en)); }
  return out;
}
const n0 = names('0.dat') || [];
const n1 = names('1.dat') || [];
console.log('s090 records=' + n0.length + '  s091 records=' + n1.length);
const cov0 = n0.filter(n => base(n) in map);
const gap0 = n0.filter(n => !(base(n) in map));
console.log('s090 reusable=' + cov0.length + '  need-translate=' + gap0.length);
console.log('\n--- s090 NEED TRANSLATE ---');
console.log(gap0.join('\n'));
console.log('\n--- s090 reusable (sample) ---');
console.log(cov0.slice(0, 20).map(n => n + ' = ' + map[base(n)]).join('\n'));
const cov1 = n1.filter(n => base(n) in map);
console.log('\ns091 reusable=' + cov1.length + '/' + n1.length);
console.log(n1.map(n => n + (base(n) in map ? ' = ' + map[base(n)] : '  <<< MISSING')).join('\n'));