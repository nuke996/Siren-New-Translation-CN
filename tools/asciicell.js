#!/usr/bin/env node
const __P = require('./_config.js');
// Print glyph cells as ASCII art (grayscale) - identifies a cell without image tooling.
// usage: node asciicell.js <vocabId> [vocabId...]
'use strict';
const fs = require('fs'), path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CW = 24, CH = 28;
const RAMP = ' .:-=+*#%@';
const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
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
  cache[tag] = { hdr, rgba, cols: Math.floor(hdr.width / CW) };
  return cache[tag];
}
const byId = {}; for (const v of vocab) byId[v.id] = v;
for (const id of process.argv.slice(2).map(Number)) {
  const it = byId[id];
  if (!it) { console.log(id, '?'); continue; }
  const s = getSheet(it.tag);
  const cc = it.cell % s.cols, rr = Math.floor(it.cell / s.cols);
  console.log('=== id ' + id + '  tag ' + it.tag + '  cell ' + it.cell + ' ===');
  for (let y = 0; y < CH; y++) {
    let line = '';
    for (let x = 0; x < CW; x++) {
      const si = ((rr * CH + y) * s.hdr.width + (cc * CW + x)) * 4;
      const l = (s.rgba[si] + s.rgba[si + 1] + s.rgba[si + 2]) / 3;
      line += RAMP[Math.min(9, Math.round(l / 255 * 9))];
    }
    console.log(line);
  }
}