#!/usr/bin/env node
const __P = require('./_config.js');
// Compute per-page text-line bands for the archive document masks and write
// work/archlayout.json  =  [{entry, file, size, W, H, lines:[{y0,y1,x0,x1}]}]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const OUTDIR = path.join(WORK, 'archdds');
fs.mkdirSync(OUTDIR, { recursive: true });

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const hits = idx.entries.filter(e => /main_archive\/archives\/\d+\/a\d+_text_\d+\.dds$/.test(e.name));

function bands(data, W, H) {
  const out = []; let cur = null;
  for (let y = 0; y < H; y++) {
    let n = 0, x0 = 1e9, x1 = -1;
    for (let x = 0; x < W; x++) if (data[y * W + x] > 16) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (n > 0) {
      if (!cur) cur = { y0: y, y1: y, x0, x1 };
      else { cur.y1 = y; if (x0 < cur.x0) cur.x0 = x0; if (x1 > cur.x1) cur.x1 = x1; }
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

const result = [];
for (const e of hits) {
  const buf = Buffer.from(dat.subarray(e.off, e.off + e.size));
  const hdr = parseDDS(buf);
  const W = hdr.width, H = hdr.height;
  const data = buf.subarray(hdr.dataOffset, hdr.dataOffset + W * H);
  const ls = bands(data, W, H);
  const ddsFile = path.join(OUTDIR, e.name.replace(/^.*archives\//, '').replace(/\//g, '_'));
  fs.writeFileSync(ddsFile, buf);
  result.push({ entry: e.name, file: ddsFile, size: e.size, W, H, lines: ls });
  console.log(e.name.replace(/^.*archives\//, '').padEnd(14), 'lines=' + ls.length,
    ls.map(b => `y${b.y0}..${b.y1}`).join(' '));
}
fs.writeFileSync(path.join(WORK, 'archlayout.json'), JSON.stringify(result, null, 1));
console.log('wrote archlayout.json', result.length, 'pages, total lines', result.reduce((a, p) => a + p.lines.length, 0));