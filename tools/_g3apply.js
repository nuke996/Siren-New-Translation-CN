#!/usr/bin/env node
const __P = require('./_config.js');
// G3 apply: write the visually-confirmed sig-level label corrections into
// chap_templates.json (highest-priority decode layer, so it wins over vocab).
// Idempotent. Run with --apply to write.
'use strict';
const fs = require('fs');
const { parseDDS } = require('./dds2png.js');
const WORK = `${__P.WORK}`;
const APPLY = process.argv.includes('--apply');

const cands = JSON.parse(fs.readFileSync(WORK + '/_g3cands.json', 'utf8'));

// extra fix from the A32 cascading case (bitmap verified by _cropfile render):
// cell164 is labelled タ but renders グ.
{
  const dds = fs.readFileSync(WORK + '/import/hud_movie_ep02_cp1.orig.dds');
  const hdr = parseDDS(dds);
  const CW = 24, CH = 28, BLKW = 6, BLKH = 7, cols = Math.floor(hdr.width / CW);
  const bpr = (hdr.width / 4) * 8;
  const cell = 164, col = cell % cols, row = Math.floor(cell / cols);
  const b0 = hdr.dataOffset + row * BLKH * bpr + col * BLKW * 8, parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(dds.subarray(base, base + BLKW * 8)); }
  cands.push({ sig: Buffer.concat(parts).toString('hex'), from: 'タ', to: 'グ', cell, where: ['A32(tail)'] });
}

const p = WORK + '/chap_templates.json';
const tpl = JSON.parse(fs.readFileSync(p, 'utf8'));
let n = 0;
for (const c of cands) {
  const cur = tpl[c.sig];
  const tag = cur === c.to ? '(already correct)' : cur === undefined ? '(new)' : `(was ${cur})`;
  console.log(`${c.sig.slice(0, 24)}…  ${c.from} -> ${c.to}  cell${c.cell}  ${tag}  [${c.where.join(' ')}]`);
  if (cur !== c.to) { if (APPLY) { tpl[c.sig] = c.to; n++; } }
}
if (APPLY) { fs.writeFileSync(p, JSON.stringify(tpl, null, 1) + '\n'); console.log('chap_templates edits:', n, 'total sigs:', Object.keys(tpl).length); }
else console.log('(dry run; pass --apply to write)');
