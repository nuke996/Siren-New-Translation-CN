#!/usr/bin/env node
const __P = require('./_config.js');
// Final sweep: (a) common.dat FONTDATA tables missing from the patch,
// (b) chapter FONTDATA records whose name is not covered by the chapter draft.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const W = `${__P.WORK}/`;
const base = n => n.replace(/@0x[0-9a-f]+$/i, '');

const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');
const patch = JSON.parse(fs.readFileSync(W + 'patch_common.json', 'utf8'));

// (a)
console.log('=== common.dat FONTDATA tables not in patch ===');
let miss = 0;
for (const e of cidx.entries) {
  if (!/\.dat$/i.test(e.name)) continue;
  const b = cdat.subarray(e.off, e.off + 8);
  if (b.toString('ascii', 0, 8) !== 'FONTDATA') continue;
  const dds = e.name.replace(/\.dat$/, '.dds');
  if (!(e.name in patch) && !(dds in patch)) { console.log('  ' + e.name + ' (' + e.size + 'B)'); miss++; }
}
console.log('  missing: ' + miss);

// (b)
console.log('\n=== chapter records named EP*_CP* not in that chapter draft ===');
const tags = [];
for (let i = 1; i <= 25; i++) tags.push('s' + String(i).padStart(2, '0'));
for (const tag of tags) {
  const ch = cidx.entries.find(x => x.name === tag + '.hed');
  if (!ch) continue;
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const fbuf = fs.readFileSync(HDD + tag + '.dat');
  const draftPath = W + 'zh_draft_chapter_' + tag + '.json';
  if (!fs.existsSync(draftPath)) continue;
  const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  const dset = new Set((draft.lines || []).map(l => base(l.name)));
  for (const e of idx.entries) {
    if (!/\d0\.dat$/.test(e.name)) continue;
    const buf = fbuf.subarray(e.off, e.off + e.size);
    const n = buf.readUInt32BE(12);
    const gap = [];
    for (let i = 0; i < n; i++) {
      const no = buf.readUInt32BE(16 + i * 8) + 16;
      let en = no; while (buf[en] !== 0) en++;
      const nm = buf.toString('ascii', no, en);
      if (/^EP\d\d_CP\d/.test(nm) && !dset.has(nm)) gap.push(nm);
    }
    if (gap.length) console.log(`  ${tag}: ${gap.length}  ${gap.join(', ')}`);
  }
}
console.log('done');