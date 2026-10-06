#!/usr/bin/env node
const __P = require('./_config.js');
// Localise the in-game tutorial / HUD atlas hud/s99/s99_dxt5.dds (512x1024 DXT5).
// The visible art lives in the RGB channels; the ALPHA channel is the text/icon
// mask.  The Japanese objective headers (終了条件: / 目的: / 小目的:) are re-drawn
// in Chinese by rewriting ONLY the affected DXT5 alpha blocks, so the RGB art is
// preserved byte-for-byte.  Text is externalised to work/i18n_src/d14.json.
// usage: node _s99build.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { writePNG } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const W = `${__P.WORK}`;
const PS1 = path.join(__dirname, 'render_text.ps1');
const NAME = 'hud/s99/s99_dxt5.dds';
const OUT = 'mask/hud_s99_s99_dxt5_dds.dds';

const J = JSON.parse(fs.readFileSync(W + '/i18n_src/d14.json', 'utf8'));
const lines = J.lines;
const RIGHT = J.right;
const CLR = J.clear;

// ---- read the original texture ----
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const e = idx.entries.find(x => x.name === NAME);
if (!e) throw new Error('entry not found: ' + NAME);
const dds = Buffer.from(dat.subarray(e.off, e.off + e.size));
const Wd = dds.readUInt32LE(16), Hd = dds.readUInt32LE(12);
const bw = Wd / 4, bh = Hd / 4;

// ---- decode the DXT5 alpha channel ----
const alpha = Buffer.alloc(Wd * Hd);
const a = new Array(8);
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  const o = 128 + (by * bw + bx) * 16;
  a[0] = dds[o]; a[1] = dds[o + 1];
  if (a[0] > a[1]) { for (let i = 2; i < 8; i++) a[i] = Math.round(((8 - i) * a[0] + (i - 1) * a[1]) / 7); }
  else { for (let i = 2; i < 6; i++) a[i] = Math.round(((6 - i) * a[0] + (i - 1) * a[1]) / 5); a[6] = 0; a[7] = 255; }
  const abits = BigInt(dds.readUInt32LE(o + 2)) | (BigInt(dds.readUInt32LE(o + 6)) << 32n);
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
    alpha[(by * 4 + py) * Wd + bx * 4 + px] = a[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)];
  }
}

// ---- clear the old Japanese header area ----
for (let y = CLR.y; y < CLR.y + CLR.h; y++) for (let x = CLR.x; x < CLR.x + CLR.w; x++) {
  if (x >= 0 && x < Wd && y >= 0 && y < Hd) alpha[y * Wd + x] = 0;
}

// ---- render the Chinese lines ----
const tmp = path.join(W, 'mask');
fs.mkdirSync(tmp, { recursive: true });
const job = { font: J.font || 'SimHei', size: J.size, bold: J.bold !== undefined ? J.bold : 1, width: Wd, height: 96, lines: [] };
lines.forEach((l, i) => job.lines.push({ text: l.zh, out: path.join(tmp, `_s99_${i}.bmp`), size: l.size || J.size }));
const jp = path.join(tmp, '_s99_job.json');
fs.writeFileSync(jp, '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jp], { stdio: 'ignore' });

function readBMP(p) { const b = fs.readFileSync(p); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) }; }
function lumAt(bmp, x, y) { const h = Math.abs(bmp.rawH); const yy = bmp.rawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4; return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)]; }
function bbox(bmp, th) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) if (lumAt(bmp, x, y) > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; }

lines.forEach((l, i) => {
  const bmp = readBMP(job.lines[i].out);
  const bb = bbox(bmp, 16);
  const inkW = bb[2] - bb[0] + 1, inkH = bb[3] - bb[1] + 1;
  const px = RIGHT - inkW + 1;
  console.log(`"${l.jp}" -> "${l.zh}" ink=${inkW}x${inkH} right=${RIGHT} -> paste x=${px} y=${l.y}`);
  for (let y = bb[1]; y <= bb[3]; y++) for (let x = bb[0]; x <= bb[2]; x++) {
    const v = lumAt(bmp, x, y);
    const tx = px + (x - bb[0]), ty = l.y + (y - bb[1]);
    if (tx >= 0 && tx < Wd && ty >= 0 && ty < Hd && v > alpha[ty * Wd + tx]) alpha[ty * Wd + tx] = v;
  }
});

// ---- re-encode the alpha of the blocks covering the changed region ----
const out = Buffer.from(dds);
const yLo = CLR.y, yHi = CLR.y + CLR.h;
const bx1 = Math.ceil((CLR.x + CLR.w) / 4);
for (let by = Math.floor(yLo / 4); by <= Math.floor((yHi - 1) / 4); by++) for (let bx = 0; bx <= bx1; bx++) {
  if (bx >= bw || by >= bh) continue;
  const o = 128 + (by * bw + bx) * 16;
  let lo = 255, hi = 0;
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const v = alpha[(by * 4 + py) * Wd + bx * 4 + px]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) { out[o] = lo; out[o + 1] = lo; out.writeUInt32LE(0, o + 2); out.writeUInt16LE(0, o + 6); }
  else {
    out[o] = hi; out[o + 1] = lo;
    const ramp = new Array(8); ramp[0] = hi; ramp[1] = lo;
    for (let i = 2; i < 8; i++) ramp[i] = Math.round(((8 - i) * hi + (i - 1) * lo) / 7);
    let bits = 0n;
    for (let i = 0; i < 16; i++) {
      const py = Math.floor(i / 4), px = i % 4;
      const v = alpha[(by * 4 + py) * Wd + bx * 4 + px];
      let best = 0, bd = 1e9;
      for (let k = 0; k < 8; k++) { const d = Math.abs(v - ramp[k]); if (d < bd) { bd = d; best = k; } }
      bits |= BigInt(best) << BigInt(3 * i);
    }
    out.writeUInt32LE(Number(bits & 0xffffffffn), o + 2);
    out.writeUInt16LE(Number((bits >> 32n) & 0xffffn), o + 6);
  }
}

const outPath = path.join(W, OUT);
fs.writeFileSync(outPath, out);
console.log('wrote ' + outPath + ' (' + out.length + ' B, orig ' + dds.length + ')');

// ---- preview (alpha composited over black) ----
const pv = Buffer.alloc(Wd * Hd * 4);
for (let i = 0; i < Wd * Hd; i++) { const v = alpha[i]; pv[i * 4] = v; pv[i * 4 + 1] = v; pv[i * 4 + 2] = v; pv[i * 4 + 3] = 255; }
writePNG(path.join(W, 's99_dxt5_zh.png'), Wd, Hd, pv);
console.log('wrote preview ' + path.join(W, 's99_dxt5_zh.png'));

// ---- merge into patch_common.json ----
const pp = path.join(W, 'patch_common.json');
const cur = fs.existsSync(pp) ? JSON.parse(fs.readFileSync(pp, 'utf8')) : {};
cur[NAME] = OUT;
fs.writeFileSync(pp, JSON.stringify(cur, null, 1));
console.log('merged 1 into ' + pp + ' (total ' + Object.keys(cur).length + ')');
