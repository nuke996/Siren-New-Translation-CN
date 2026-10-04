#!/usr/bin/env node
const __P = require('./_config.js');
// D13: hud/s99/now_loading.dds (256x128 DXT5). The visible art lives in the ALPHA
// channel; RGB carries the flat tint + a black block. Replace the "LOADING"
// glyph alpha with Chinese text, keep everything else, re-encode DXT5.
// usage: node _d13gen.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const NAME = 'hud/s99/now_loading.dds';
const TEXT = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d13.json', 'utf8')).text;
const CLEAR = { x: 45, y: 7, w: 68, h: 20 };  // old "LOADING" glyph box
const Y = 9;                                   // baseline y for the new text

// ---- read
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const e = idx.entries.find(x => x.name === NAME);
const orig = Buffer.from(dat.subarray(e.off, e.off + e.size));
const W = orig.readUInt32LE(16), H = orig.readUInt32LE(12);
const bw = W / 4, bh = H / 4;

// ---- decode DXT5 (color + alpha)
function decodeBlocks(buf) {
  const A = new Uint8Array(W * H), RGB = Buffer.alloc(W * H * 3);
  let off = 128;
  const uc = v => { const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31; return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]; };
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const a0 = buf[off], a1 = buf[off + 1];
    const ab = BigInt(buf.readUInt32LE(off + 2)) | (BigInt(buf.readUInt32LE(off + 6)) << 32n);
    const av = new Array(8); av[0] = a0; av[1] = a1;
    if (a0 > a1) { for (let i = 2; i < 8; i++) av[i] = Math.round(((8 - i) * a0 + (i - 1) * a1) / 7); }
    else { for (let i = 2; i < 6; i++) av[i] = Math.round(((6 - i) * a0 + (i - 1) * a1) / 5); av[6] = 0; av[7] = 255; }
    const c0 = buf.readUInt16LE(off + 8), c1 = buf.readUInt16LE(off + 10);
    const cbits = buf.readUInt32LE(off + 12);
    off += 16;
    const p0 = uc(c0), p1 = uc(c1); const col = [p0, p1];
    if (c0 > c1) { col[2] = [(2 * p0[0] + p1[0]) / 3 | 0, (2 * p0[1] + p1[1]) / 3 | 0, (2 * p0[2] + p1[2]) / 3 | 0]; col[3] = [(p0[0] + 2 * p1[0]) / 3 | 0, (p0[1] + 2 * p1[1]) / 3 | 0, (p0[2] + 2 * p1[2]) / 3 | 0]; }
    else { col[2] = [(p0[0] + p1[0]) / 2 | 0, (p0[1] + p1[1]) / 2 | 0, (p0[2] + p1[2]) / 2 | 0]; col[3] = [0, 0, 0]; }
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const x = bx * 4 + px, y = by * 4 + py;
      A[y * W + x] = av[Number((ab >> BigInt(3 * (py * 4 + px))) & 7n)];
      const ci = (cbits >> (2 * (py * 4 + px))) & 3, d = (y * W + x) * 3;
      RGB[d] = col[ci][0]; RGB[d + 1] = col[ci][1]; RGB[d + 2] = col[ci][2];
    }
  }
  return { A, RGB };
}
const { A, RGB } = decodeBlocks(orig);

// ---- erase the old glyphs and write the Chinese coverage
for (let y = CLEAR.y; y < CLEAR.y + CLEAR.h; y++) for (let x = CLEAR.x; x < CLEAR.x + CLEAR.w; x++) if (x < W && y < H) A[y * W + x] = 0;

const bmpDir = path.join(WORK, 'mask'); fs.mkdirSync(bmpDir, { recursive: true });
const job = { font: 'SimHei', size: 17, bold: 1, width: 1024, height: 96, lines: [{ text: TEXT, out: path.join(bmpDir, '_nl.bmp'), size: 17 }] };
const jobPath = path.join(bmpDir, '_nl_job.json');
fs.writeFileSync(jobPath, '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(TOOLS, 'render_text.ps1'), '-Job', jobPath], { stdio: 'inherit' });

const bb = fs.readFileSync(job.lines[0].out);
const boff = bb.readUInt32LE(10), bwid = bb.readInt32LE(18), brawH = bb.readInt32LE(22), bbpp = bb.readUInt16LE(28);
function lum(x, y) { const h = Math.abs(brawH); const yy = brawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bbpp * bwid + 31) / 32) * 4; return bb[boff + yy * stride + x * (bbpp / 8)]; }
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (let y = 0; y < Math.abs(brawH); y++) for (let x = 0; x < bwid; x++) if (lum(x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
const inkW = x1 - x0 + 1, inkH = y1 - y0 + 1;
const px = Math.round((CLEAR.x + CLEAR.w / 2) - inkW / 2);
console.log(`text "${TEXT}" ink=${inkW}x${inkH} -> x=${px} y=${Y} (old LOADING box x48..108 y10..23)`);
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  const v = lum(x, y); const tx = px + (x - x0), ty = Y + (y - y0);
  if (tx >= 0 && tx < W && ty >= 0 && ty < H) { const q = ty * W + tx; if (v > A[q]) A[q] = v; }
}

// ---- encode DXT5
function pack565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
function unpack565v(c) { return [(c >> 11) & 31, (c >> 5) & 63, c & 31]; }
const data = Buffer.alloc(bw * bh * 16); let o = 0;
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  const av = [], cv = [];
  for (let py = 0; py < 4; py++) for (let px2 = 0; px2 < 4; px2++) {
    const x = bx * 4 + px2, y = by * 4 + py;
    av.push(A[y * W + x]);
    const d = (y * W + x) * 3; cv.push([RGB[d], RGB[d + 1], RGB[d + 2]]);
  }
  // alpha
  let amax = Math.max(...av), amin = Math.min(...av);
  let a0 = amax, a1 = amin;
  if (a0 === a1) { a1 = a0 > 0 ? a0 - 1 : 0; }
  const lev = new Array(8);
  if (a0 > a1) { lev[0] = a0; lev[1] = a1; for (let i = 2; i < 8; i++) lev[i] = Math.round(((8 - i) * a0 + (i - 1) * a1) / 7); }
  else { lev[0] = a0; lev[1] = a1; for (let i = 2; i < 6; i++) lev[i] = Math.round(((6 - i) * a0 + (i - 1) * a1) / 5); lev[6] = 0; lev[7] = 255; }
  const bidx = [];
  for (let i = 0; i < 16; i++) { let best = 0, bd = 1e9; for (let k = 0; k < 8; k++) { const d = Math.abs(av[i] - lev[k]); if (d < bd) { bd = d; best = k; } } bidx.push(best); }
  let packed = 0n; for (let i = 0; i < 16; i++) packed |= BigInt(bidx[i]) << BigInt(3 * i);
  data[o] = a0; data[o + 1] = a1;
  for (let i = 0; i < 6; i++) data[o + 2 + i] = Number((packed >> BigInt(8 * i)) & 0xFFn);
  // color
  let rmax = 0, gmax = 0, bmax = 0, rmin = 255, gmin = 255, bmin = 255;
  for (const c of cv) { if (c[0] > rmax) rmax = c[0]; if (c[1] > gmax) gmax = c[1]; if (c[2] > bmax) bmax = c[2]; if (c[0] < rmin) rmin = c[0]; if (c[1] < gmin) gmin = c[1]; if (c[2] < bmin) bmin = c[2]; }
  let c0 = pack565(rmax, gmax, bmax), c1 = pack565(rmin, gmin, bmin);
  if (c0 === c1) c1 = c0 > 0 ? c0 - 1 : 0;
  const e0 = unpack565v(c0), e1 = unpack565v(c1);
  const pal = [e0.map(v => (v << 3) | (v >> 2)), e1.map(v => (v << 3) | (v >> 2))];
  pal[2] = c0 > c1 ? pal[0].map((v, i) => (2 * v + pal[1][i]) / 3 | 0) : pal[0].map((v, i) => (v + pal[1][i]) / 2 | 0);
  pal[3] = c0 > c1 ? pal[0].map((v, i) => (v + 2 * pal[1][i]) / 3 | 0) : [0, 0, 0];
  let cbits = 0;
  for (let i = 0; i < 16; i++) { let best = 0, bd = 1e9; for (let k = 0; k < 4; k++) { const d = Math.abs(cv[i][0] - pal[k][0]) + Math.abs(cv[i][1] - pal[k][1]) + Math.abs(cv[i][2] - pal[k][2]); if (d < bd) { bd = d; best = k; } } cbits |= best << (2 * i); }
  data.writeUInt16LE(c0, o + 8); data.writeUInt16LE(c1, o + 10); data.writeUInt32LE(cbits >>> 0, o + 12);
  o += 16;
}
const out = Buffer.concat([orig.subarray(0, 128), data]);
const outPath = path.join(WORK, 'mask', 'hud_s99_now_loading_dds.dds');
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${out.length} B, orig ${e.size})`);

// ---- preview: composite over dark
const pv = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { const a = A[i] / 255; const d = i * 3; pv[i * 4] = Math.round(RGB[d] * a); pv[i * 4 + 1] = Math.round(RGB[d + 1] * a); pv[i * 4 + 2] = Math.round(RGB[d + 2] * a); pv[i * 4 + 3] = 255; }
writePNG(path.join(WORK, 'mask', 'hud_s99_now_loading_dds.png'), W, H, pv);

const dest = path.join(WORK, 'patch_common.json');
const cur = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : {};
cur[NAME] = outPath;
fs.writeFileSync(dest, JSON.stringify(cur, null, 1));
console.log(`merged 1 into ${dest} (total ${Object.keys(cur).length})`);