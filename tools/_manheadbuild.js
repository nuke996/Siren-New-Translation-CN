#!/usr/bin/env node
const __P = require('./_config.js');
// Localise the in-game manual heading masks (Japanese -> Simplified Chinese) and
// merge them into work/patch_common.json.  usage: node _manheadbuild.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');

const BASE = `${__P.DISC}/`;
const W = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;

// Text is externalised to work/i18n_src/manhead.json so it can be exported/imported.
const SRCMH = JSON.parse(fs.readFileSync(W + '/i18n_src/manhead.json', 'utf8'));
const SMALL = SRCMH.small;
const HEAD = SRCMH.head;

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const items = [];

// Section-title masks are 512x32; the Japanese originals keep their ink in the
// top band (y0..~15, ~16px tall).  Match that footprint (size 16 at y0) so the
// Chinese title neither overflows the game's title slot nor overlaps the body
// text below.  Keep these values when switching typefaces.
const SMALL_SIZE = 16;
for (const [base, text] of Object.entries(SMALL)) {
  items.push({ name: `menu/jp/main_manual/small_subject/${base}.dds`, size: SMALL_SIZE, bold: 1, align: 'left', y: 0, lines: [{ text, y: 0 }] });
}

// head_control: 512x256 with 7 stacked lines -> measure the original band tops
{
  const name = 'menu/jp/main_manual/big_subject/menu_manual_head_control.dds';
  const e = idx.entries.find(x => x.name === name);
  const b = dat.subarray(e.off, e.off + e.size);
  const Wd = b.readUInt32LE(16), Hd = b.readUInt32LE(12);
  const alpha = b.subarray(128, 128 + Wd * Hd);
  const bands = [];
  let s = -1;
  for (let y = 0; y < Hd; y++) {
    let ink = 0;
    for (let x = 0; x < Wd; x++) if (alpha[y * Wd + x] > 40) ink++;
    if (ink > 0 && s < 0) s = y; else if (ink === 0 && s >= 0) { bands.push([s, y - 1]); s = -1; }
  }
  if (s >= 0) bands.push([s, Hd - 1]);
  console.log('head_control', Wd + 'x' + Hd, 'bands:', JSON.stringify(bands));
  if (bands.length !== HEAD.length) throw new Error(`head_control bands ${bands.length} != ${HEAD.length}`);
  // 7 stacked lines at a 32px pitch; the Japanese ink is ~20-21px tall.  Size 21
  // reproduces that height so the lines stay inside their slots.  Keep this value
  // when switching typefaces.
  const HEAD_SIZE = 21;
  items.push({ name, size: HEAD_SIZE, bold: 1, align: 'left', lines: HEAD.map((t, i) => ({ text: t, y: bands[i][0] })) });
}

const job = { arch: 'common', font: 'SimHei', items };
const jp = path.join(W, '_manhead_job.json');
fs.writeFileSync(jp, JSON.stringify(job, null, 1), 'utf8');
console.log('job items=' + items.length);
execFileSync(process.execPath, [path.join(TOOLS, '_maskimport.js'), jp, '--into', path.join(W, 'patch_common.json')], { stdio: 'inherit' });