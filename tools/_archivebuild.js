#!/usr/bin/env node
const __P = require('./_config.js');
// Render the in-game archive document pages (A8 masks, 1024x2048) into Chinese.
//
// Each source page is a stack of text lines at a fixed pitch (26px). The line
// bands were measured into work/archlayout.json; translations live in
// work/archive_zh.json keyed by full entry name. Each translated line is pasted
// at its ORIGINAL ink-x so the lateral alignment is preserved.
//
// usage: node _archivebuild.js [size] [bold]
//
// The Japanese originals use a 26px line pitch with ~20-21px ink; size 20
// reproduces that height and is applied to EVERY line (no per-line auto-shrink),
// so a page never mixes font sizes.  Keep this value when switching typefaces.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const OUTDIR = path.join(WORK, 'archout');
const SIZE = process.argv[2] ? Number(process.argv[2]) : 20;
const BOLD = process.argv[3] !== undefined ? Number(process.argv[3]) : 0;
fs.mkdirSync(OUTDIR, { recursive: true });

const layouts = JSON.parse(fs.readFileSync(path.join(WORK, 'archlayout.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(WORK, 'archive_zh.json'), 'utf8'));

const patchPath = path.join(WORK, 'patch_common.json');
const patch = fs.existsSync(patchPath) ? JSON.parse(fs.readFileSync(patchPath, 'utf8')) : {};
let added = 0, bad = 0, skipped = 0, wide = 0;

// rough rendered-width estimate for SimHei (CJK = 1 em, ASCII/punct = 0.55 em)
function estWidth(s, size) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c <= 0x7f) w += size * 0.55; else w += size * 1.0;
  }
  return w;
}

for (const p of layouts) {
  const lines = zh[p.entry];
  if (!lines) { console.log('NO ZH for ' + p.entry); skipped++; continue; }
  if (lines.length !== p.lines.length) { console.log(`!! ${p.entry}: zh=${lines.length} bands=${p.lines.length} SKIP`); skipped++; continue; }
  const spec = [];
  lines.forEach((ln, i) => {
    const t = (ln.zh || '').trim();
    if (!t) return;
    // Every line shares the base size so the page stays visually uniform.  The
    // width estimate is only a warning: a genuinely over-long line is reported
    // (and would be clipped) instead of being silently shrunk.
    const est = estWidth(t, SIZE) * 1.05;
    const avail = p.W - p.lines[i].x0 - 4;
    if (est > avail) console.log(`  WIDE ${p.entry} line${i}: est ${Math.round(est)} > avail ${avail}`);
    spec.push({ text: t, y: p.lines[i].y0, x: p.lines[i].x0 });
  });
  const base = path.basename(p.entry).replace(/\.dds$/, '');
  const specPath = path.join(OUTDIR, base + '.spec.json');
  const outDds = path.join(OUTDIR, base + '.out.dds');
  const outPng = path.join(OUTDIR, base + '.out.png');
  fs.writeFileSync(specPath, JSON.stringify({ font: 'SimHei', size: SIZE, bold: BOLD, align: 'left', lines: spec }, null, 1), 'utf8');
  execFileSync(process.execPath, [path.join(TOOLS, 'build_mask.js'), p.file, specPath, outDds, outPng], { stdio: 'inherit' });
  const size = fs.statSync(outDds).size;
  if (size > p.size) { console.log(`  OVER ${p.entry}: ${size} > ${p.size}`); bad++; }
  patch[p.entry] = outDds;
  added++;
}
fs.writeFileSync(patchPath, JSON.stringify(patch, null, 1));
console.log(`\n== archive: ${added} pages rendered, oversize=${bad}, skipped=${skipped}, patch_common.json now ${Object.keys(patch).length} entries`);