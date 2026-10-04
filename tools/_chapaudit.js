#!/usr/bin/env node
const __P = require('./_config.js');
// Audit chapter text coverage: list every FONTDATA record in each chapter's
// script/msg/sNN0.dat (and sNN1.dat) and check whether the zh draft covers it.
// Records present in the .dat but absent from the draft are UNTRANSLATED.
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const HDD = `${__P.HDD}/`;
const W = `${__P.WORK}/`;

const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');

function recNames(buf) {
  const out = [];
  if (buf.toString('ascii', 0, 8) !== 'FONTDATA') return null;
  const count = buf.readUInt32BE(12);
  for (let i = 0; i < count; i++) {
    const no = buf.readUInt32BE(16 + i * 8) + 16;
    let e = no; while (e < buf.length && buf[e] !== 0) e++;
    out.push(buf.toString('utf8', no, e));
  }
  return out;
}
const base = n => n.replace(/@0x[0-9a-f]+$/i, '');

const tags = [];
for (let i = 1; i <= 25; i++) tags.push('s' + String(i).padStart(2, '0'));
let totalGap = 0;
for (const tag of tags) {
  const ch = cidx.entries.find(x => x.name === tag + '.hed');
  if (!ch) { console.log(tag, 'NO HED'); continue; }
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const fbuf = fs.readFileSync(HDD + tag + '.dat');
  let d0 = null, d1 = null;
  for (const e of idx.entries) {
    if (e.name.endsWith(tag + '0.dat')) d0 = recNames(fbuf.subarray(e.off, e.off + e.size));
    if (e.name.endsWith(tag + '1.dat')) d1 = recNames(fbuf.subarray(e.off, e.off + e.size));
  }
  const draftPath = W + 'zh_draft_chapter_' + tag + '.json';
  const draft = fs.existsSync(draftPath) ? JSON.parse(fs.readFileSync(draftPath, 'utf8')) : { lines: [] };
  const dset = new Set((draft.lines || []).map(l => base(l.name)));
  const miss0 = d0 ? d0.filter(n => !dset.has(base(n))) : [];
  const sxx1 = JSON.parse(fs.readFileSync(W + 'zh_draft_sxx1.json', 'utf8'));
  const sset = new Set([...Object.keys(sxx1.shared || {}), ...Object.keys(sxx1[tag] || {})].map(base));
  const miss1 = d1 ? d1.filter(n => !sset.has(base(n))) : [];
  if (miss0.length || miss1.length) {
    console.log(`${tag}: sNN0 dat=${d0 ? d0.length : '-'} missingDraft=${miss0.length}  sNN1 dat=${d1 ? d1.length : '-'} missingDraft=${miss1.length}`);
    if (miss0.length) console.log('    sNN0 gaps: ' + miss0.join(', '));
    if (miss1.length) console.log('    sNN1 gaps: ' + miss1.join(', '));
    totalGap += miss0.length + miss1.length;
  }
}
console.log('\nTOTAL missing-from-draft records: ' + totalGap);