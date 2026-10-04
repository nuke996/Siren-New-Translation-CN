const __P = require('./_config.js');
'use strict';
// Compare patched entries in HDD vs mirror common.dat to find what is actually deployed.
const fs = require('fs');
const crypto = require('crypto');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const MIR = `${__P.MIRROR}/`;
const PATCH = `${__P.WORK}/patch/`;
const ORIG = `${__P.DISC}/`;
const keys = Object.keys(JSON.parse(fs.readFileSync(`${__P.WORK}/patch_common.json`, 'utf8')));
function open(dir) {
  const idx = parseHed(fs.readFileSync(dir + 'common.hed'));
  return { fd: fs.openSync(dir + 'common.dat', 'r'), map: new Map(idx.entries.map(e => [e.name, e])) };
}
const h = open(HDD), m = open(MIR), p = open(PATCH), o = open(ORIG);
function hash(x, name) {
  const e = x.map.get(name); if (!e) return 'MISSING';
  const b = Buffer.alloc(e.size); fs.readSync(x.fd, b, 0, e.size, e.off);
  return crypto.createHash('md5').update(b).digest('hex').slice(0, 8);
}
let stat = { hddOnly: [], mirOnly: [], both: [], neither: [], hddLocal: [] };
for (const k of keys) {
  const hh = hash(h, k), mm = hash(m, k), oo = hash(o, k);
  const hTr = hh !== oo, mTr = mm !== oo;
  if (hTr && mTr) stat.both.push(k);
  else if (hTr && !mTr) stat.hddOnly.push(k);
  else if (!hTr && mTr) stat.mirOnly.push(k);
  else stat.neither.push(k);
}
console.log(`entries=${keys.length}  translated both:${stat.both.length}  HDD-only:${stat.hddOnly.length}  MIR-only:${stat.mirOnly.length}  neither:${stat.neither.length}`);
console.log('--- NEITHER (patch listed but untranslated in HDD & mirror) ---');
console.log(stat.neither.join('\n'));
console.log('--- MIR-only (translated in mirror but not HDD) ---');
console.log(stat.mirOnly.join('\n'));
console.log('--- HDD-only count', stat.hddOnly.length, '(sample)');
console.log(stat.hddOnly.slice(0, 10).join('\n'));