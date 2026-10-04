#!/usr/bin/env node
const __P = require('./_config.js');
// Render every cell involved in a duplicate-char collision at high zoom (grayscale) for re-reading.
// Each duplicate group is drawn as one horizontal row: all members side by side, separated by thin bars.
// usage: node duprender.js [scale] [groupsPerImg]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28;

const isOne = process.argv[2] === 'one';
const SCALE = +((isOne ? process.argv[4] : process.argv[2]) || 8);
const GPP = +(process.argv[3] || 3);      // groups per image
const INVERT = !!process.env.DUP_INVERT;  // render dark-on-light instead

const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
const chars = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));

const groups = {};
for (const v of vocab) {
  const ch = chars[String(v.id)];
  if (!ch) continue;
  (groups[ch] = groups[ch] || []).push(v.id);
}
const dupGroups = Object.keys(groups)
  .filter(c => groups[c].length > 1)
  .map(c => ({ ch: c, ids: groups[c] }))
  .sort((a, b) => Math.min(...a.ids) - Math.min(...b.ids));

console.log('duplicate groups:', dupGroups.length, ' cells:', dupGroups.reduce((n, g) => n + g.ids.length, 0));

const cache = {};
function getSheet(tag) {
  if (cache[tag]) return cache[tag];
  const cdat = fs.readFileSync(BASE + 'common.dat');
  const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  const chh = cidx.entries.find(e => e.name === tag + '.hed');
  const idx = parseHed(cdat.subarray(chh.off, chh.off + chh.size));
  const e = idx.entries.find(x => x.name.includes('script/msg/') && x.name.endsWith(tag + '0.dds'));
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  const buf = dbuf.subarray(e.off, e.off + e.size);
  const hdr = parseDDS(buf);
  const rgba = decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset);
  cache[tag] = { hdr, rgba, cols: Math.floor(hdr.width / CELL_W) };
  return cache[tag];
}

const byId = {}; for (const v of vocab) byId[v.id] = v;

const CW = CELL_W * SCALE, CH = CELL_H * SCALE;
const GAP = 6, ROWGAP = 10, BORDER = 8;
const maxMembers = Math.max(...dupGroups.map(g => g.ids.length));
const perImg = GPP;
const layout = [];

// "one <gi>" renders a single group into dupfix_one_<gi>.png
const oneIdx = process.argv[2] === 'one' ? +process.argv[3] : -1;
const batches = oneIdx >= 0 ? 1 : Math.ceil(dupGroups.length / perImg);

for (let bi = 0; bi < batches; bi++) {
  const gs = oneIdx >= 0 ? [dupGroups[oneIdx]] : dupGroups.slice(bi * perImg, bi * perImg + perImg);
  const mMax = Math.max(...gs.map(g => g.ids.length));
  const ow = BORDER * 2 + mMax * CW + (mMax - 1) * GAP;
  const oh = BORDER * 2 + gs.length * CH + (gs.length - 1) * ROWGAP;
  const cv = Buffer.alloc(ow * oh * 4, INVERT ? 235 : 20);

  for (let gi = 0; gi < gs.length; gi++) {
    const g = gs[gi];
    const y0 = BORDER + gi * (CH + ROWGAP);
    for (let mi = 0; mi < g.ids.length; mi++) {
      const it = byId[g.ids[mi]];
      const s = getSheet(it.tag);
      const cc = it.cell % s.cols, rr = Math.floor(it.cell / s.cols);
      const x0 = BORDER + mi * (CW + GAP);
      for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
        const si = ((rr * CELL_H + y) * s.hdr.width + (cc * CELL_W + x)) * 4;
        const l = Math.round((s.rgba[si] + s.rgba[si + 1] + s.rgba[si + 2]) / 3);
        const v = INVERT ? 255 - l : l;
        for (let yy = 0; yy < SCALE; yy++) for (let xx = 0; xx < SCALE; xx++) {
          const d = ((y0 + y * SCALE + yy) * ow + (x0 + x * SCALE + xx)) * 4;
          cv[d] = cv[d + 1] = cv[d + 2] = v; cv[d + 3] = 255;
        }
      }
    }
  }
  // rails: thin light line around each cell, thick colored separator between groups
  for (let gi = 0; gi < gs.length; gi++) {
    const g = gs[gi];
    const y0 = BORDER + gi * (CH + ROWGAP);
    const y1 = y0 + CH - 1;
    for (let mi = 0; mi < g.ids.length; mi++) {
      const x0 = BORDER + mi * (CW + GAP);
      const x1 = x0 + CW - 1;
      for (let x = x0; x <= x1; x++) for (const y of [y0 - 1, y1 + 1]) {
        if (y < 0 || y >= oh) continue; const d = (y * ow + x) * 4;
        cv[d] = 90; cv[d + 1] = 90; cv[d + 2] = 90;
      }
      for (let y = y0; y <= y1; y++) for (const x of [x0 - 1, x1 + 1]) {
        if (x < 0 || x >= ow) continue; const d = (y * ow + x) * 4;
        cv[d] = 90; cv[d + 1] = 90; cv[d + 2] = 90;
      }
    }
  }
  const name = process.env.DUP_OUT || (oneIdx >= 0 ? `dupfix_one_${oneIdx}.png` : `dupfix_${String(bi).padStart(2, '0')}.png`);
  writePNG(path.join(WORK, name), ow, oh, cv);
  const line = `${name}: ` + gs.map(g => `[${g.ch}] ${g.ids.join(',')}`).join('   ');
  console.log(line);
  layout.push(line);
}
fs.writeFileSync(path.join(WORK, 'dupfix_layout.txt'), layout.join('\n') + '\n');
console.log('wrote', path.join(WORK, 'dupfix_layout.txt'));