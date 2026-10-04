#!/usr/bin/env node
const __P = require('./_config.js');
// Render the in-game manual pages (A8 masks, 512x1024) into Chinese.
//
// The manual pages place every text line at a fixed y; some lines carry a
// runtime-overlaid status icon (player/ally/enemy markers) in the x<33 band,
// which is NOT part of the mask -- so each line is pasted at the ORIGINAL
// ink-x (read from the source mask row-bands) to keep those icons in place.
//
// usage: node _manualbuild.js [size] [bold]
//   reads  work/manual_zh.json + work/manualpng/<id>.dds
//   writes work/manualpng/<id>.out.dds (+ .out.png)
//   merges the flat {entry:file} map into work/patch_common.json
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseDDS, writePNG } = require('./dds2png.js');

const WORK = `${__P.WORK}`;
const PNGDIR = path.join(WORK, 'manualpng');
const TOOLS = `${__P.TOOLS}`;
const SIZE = process.argv[2] ? Number(process.argv[2]) : 19;
const BOLD = process.argv[3] !== undefined ? Number(process.argv[3]) : 1;

const zh = JSON.parse(fs.readFileSync(path.join(WORK, 'manual_zh.json'), 'utf8'));
const idxPath = { rd: path.join(PNGDIR, 'rd_index.json'), rr: path.join(PNGDIR, 'rr_index.json') };
const index = {};
for (const k of ['rd', 'rr']) for (const e of JSON.parse(fs.readFileSync(idxPath[k], 'utf8'))) index[e.name] = e;

// locate contiguous ink row-bands (one per text line) in an A8 mask
function bands(ddsFile) {
  const raw = fs.readFileSync(ddsFile);
  const d = parseDDS(raw);
  const W = d.width, H = d.height;
  const data = raw.subarray(d.dataOffset, d.dataOffset + W * H);
  const out = [];
  let cur = null;
  for (let y = 0; y < H; y++) {
    let n = 0, x0 = 1e9, x1 = -1;
    for (let x = 0; x < W; x++) { if (data[y * W + x] > 16) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; } }
    if (n > 0) {
      if (!cur) cur = { y0: y, y1: y, x0, x1 };
      else { cur.y1 = y; if (x0 < cur.x0) cur.x0 = x0; if (x1 > cur.x1) cur.x1 = x1; }
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return { W, H, bands: out };
}

const patchPath = path.join(WORK, 'patch_common.json');
const patch = fs.existsSync(patchPath) ? JSON.parse(fs.readFileSync(patchPath, 'utf8')) : {};
let added = 0, bad = 0;

for (const page of zh.pages) {
  const meta = index[page.id];
  if (!meta) { console.log('MISSING index for ' + page.id); continue; }
  const { W, H, bands: bs } = bands(meta.file);
  if (bs.length !== page.lines.length) {
    console.log(`!! ${page.id}: bands=${bs.length} lines=${page.lines.length} -- SKIP`);
    continue;
  }
  const lines = [];
  page.lines.forEach((ln, i) => {
    if (!ln.zh) return;                       // empty line -> leave blank
    lines.push({ text: ln.zh, y: bs[i].y0, x: bs[i].x0 });
  });
  const specPath = path.join(PNGDIR, page.id + '.spec.json');
  const outDds = path.join(PNGDIR, page.id + '.out.dds');
  const outPng = path.join(PNGDIR, page.id + '.out.png');
  fs.writeFileSync(specPath, JSON.stringify({ font: 'SimHei', size: SIZE, bold: BOLD, align: 'left', lines }, null, 1), 'utf8');
  execFileSync(process.execPath, [path.join(TOOLS, 'build_mask.js'), meta.file, specPath, outDds, outPng], { stdio: 'inherit' });
  const size = fs.statSync(outDds).size;
  if (size > meta.size) { console.log(`  OVER ${page.id}: ${size} > ${meta.size}`); bad++; }
  patch[meta.entry] = outDds;
  added++;
}
fs.writeFileSync(patchPath, JSON.stringify(patch, null, 1));
console.log(`\n== manual: ${added} pages rendered, oversize=${bad}, patch_common.json now ${Object.keys(patch).length} entries`);