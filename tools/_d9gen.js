#!/usr/bin/env node
const __P = require('./_config.js');
// D9: menu/jp/caution/caution_01..09.dds  (1280x720 DXT1, white text on black).
// Render Chinese lines (white on black) into a luminance canvas, keep the original
// art where required (caution_03 controller illustration), then full-image DXT1 re-encode.
// usage: node _d9gen.js [onlyNN]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { decodeDXT1, writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const OUTDIR = path.join(WORK, 'mask');
fs.mkdirSync(OUTDIR, { recursive: true });

// Text is externalised to work/i18n_src/d9.json so it can be exported/imported.
const C = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d9.json', 'utf8')).C;

function readBMP(p) {
  const b = fs.readFileSync(p);
  return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) };
}
function lumAt(bmp, x, y) {
  const h = Math.abs(bmp.rawH);
  const yy = bmp.rawH > 0 ? (h - 1 - y) : y;
  const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4;
  const v = bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)];
  return bmp.bpp === 32 ? bmp.b[bmp.off + yy * stride + x * 4] : v;
}

function encodeGray(lum, W, H) {
  const pack = (v) => ((v >> 3) << 11) | ((v >> 2) << 5) | (v >> 3);
  const unpackv = (c) => [(c >> 11) & 31, (c >> 5) & 63, c & 31];
  const toGray = (v) => (((v[0] << 3) | (v[0] >> 2)) * 0.299 + ((v[1] << 2) | (v[1] >> 4)) * 0.587 + ((v[2] << 3) | (v[2] >> 2)) * 0.114);
  const out = Buffer.alloc((W / 4) * (H / 4) * 8); let o = 0;
  for (let by = 0; by < H / 4; by++) for (let bx = 0; bx < W / 4; bx++) {
    const vals = [];
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) vals.push(lum[(by * 4 + py) * W + (bx * 4 + px)]);
    const mx = Math.max(...vals), mn = Math.min(...vals);
    let c0 = pack(mx), c1 = pack(mn);
    if (c0 === c1) c1 = c0 > 0 ? c0 - 1 : 0;
    const e0 = unpackv(c0), e1 = unpackv(c1);
    const g0 = toGray(e0), g1 = toGray(e1);
    const pal = c0 > c1 ? [g0, g1, (g0 + 2 * g1) / 3, (2 * g0 + g1) / 3] : [g0, g1, (g0 + g1) / 2, 0];
    let bits = 0;
    for (let i = 0; i < 16; i++) { let best = 0, bd = 1e9; for (let k = 0; k < 4; k++) { const d = Math.abs(vals[i] - pal[k]); if (d < bd) { bd = d; best = k; } } bits |= best << (i * 2); }
    out.writeUInt16LE(c0, o); o += 2; out.writeUInt16LE(c1, o); o += 2; out.writeUInt32LE(bits >>> 0, o); o += 4;
  }
  return out;
}

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const patch = {};
const only = process.argv[2];
const keys = Object.keys(C).filter(k => !only || k === only);

for (const k of keys) {
  const name = `menu/jp/caution/caution_${k}.dds`;
  const e = idx.entries.find(x => x.name === name);
  if (!e) { console.log('MISSING ' + name); continue; }
  const orig = Buffer.from(dat.subarray(e.off, e.off + e.size));
  const W = orig.readUInt32LE(16), H = orig.readUInt32LE(12);
  const rgba = decodeDXT1(orig, W, H, 128);
  const lum = new Uint8Array(W * H);
  const conf = C[k];
  if (conf.keep) for (let i = 0; i < W * H; i++) lum[i] = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  if (conf.clear) for (const r of conf.clear) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && x < W && y >= 0 && y < H) lum[y * W + x] = 0;

  // render lines
  const job = { font: 'SimHei', size: 22, bold: 1, width: 2048, height: 128, lines: [] };
  conf.lines.forEach((ln, i) => job.lines.push({ text: ln.text, out: path.join(OUTDIR, `_ca${k}_l${i}.bmp`), size: ln.size }));
  const jobPath = path.join(OUTDIR, `_ca${k}_job.json`);
  fs.writeFileSync(jobPath, '\uFEFF' + JSON.stringify(job), 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(TOOLS, 'render_text.ps1'), '-Job', jobPath], { stdio: 'inherit' });

  conf.lines.forEach((ln, i) => {
    const bmp = readBMP(job.lines[i].out);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) if (lumAt(bmp, x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const inkW = x1 - x0 + 1;
    const align = ln.align || 'center';
    const px = ln.x !== undefined ? ln.x : (align === 'center' ? Math.round((W - inkW) / 2) : align === 'right' ? W - inkW - 1 : 0);
    console.log(`  ca${k} L${i} "${ln.text}" ink=${inkW}x${y1 - y0 + 1} -> x=${px} y=${ln.y}`);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = lumAt(bmp, x, y); const tx = px + (x - x0), ty = ln.y + (y - y0);
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) { const q = ty * W + tx; if (v > lum[q]) lum[q] = v; }
    }
  });

  const enc = encodeGray(lum, W, H);
  const out = Buffer.concat([orig.subarray(0, 128), enc]);
  const safe = name.replace(/[^A-Za-z0-9_]+/g, '_');
  const outPath = path.join(OUTDIR, safe + '.dds');
  fs.writeFileSync(outPath, out);
  patch[name] = outPath;
  console.log(`wrote ${outPath} (${out.length} B, orig ${e.size})`);
  // preview
  const pv = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { const g = lum[i]; pv[i * 4] = g; pv[i * 4 + 1] = g; pv[i * 4 + 2] = g; pv[i * 4 + 3] = 255; }
  writePNG(path.join(OUTDIR, safe + '.png'), W, H, pv);
}

if (!only) {
  const dest = path.join(WORK, 'patch_common.json');
  const cur = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : {};
  let n = 0; for (const k of Object.keys(patch)) { cur[k] = patch[k]; n++; }
  fs.writeFileSync(dest, JSON.stringify(cur, null, 1));
  console.log(`merged ${n} into ${dest} (total ${Object.keys(cur).length})`);
}