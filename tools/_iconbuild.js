#!/usr/bin/env node
const __P = require('./_config.js');
// Localise the button-icon atlas hud/font_02_icon_jp.dds (256x256 DXT5).
// The atlas is an alpha mask: white icons/labels on transparent.  Only the
// Japanese button-name labels are re-drawn in Chinese; symbol icons and the
// English labels are left untouched (their alpha blocks are not rewritten).
//
// usage: node _iconbuild.js [--analyze] [--deploy]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { writePNG } = require('./dds2png.js');

const HDD = `${__P.HDD}/`;
const W = `${__P.WORK}/`;
const TMP = W + 'msn/tmp/';
const PS1 = path.join(__dirname, 'render_text.ps1');
const FONT = process.env.ICON_FONT || 'SimHei';
fs.mkdirSync(TMP, { recursive: true });

const NAME = 'hud/font_02_icon_jp.dds';
const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');
const ce = cidx.entries.find(e => e.name === NAME);
const fd = fs.openSync(HDD + 'common.dat', 'r');
const dds = Buffer.from(cdat.subarray(ce.off, ce.off + ce.size));
fs.closeSync(fd);

const Wd = dds.readUInt32LE(16), Hd = dds.readUInt32LE(12);
const bw = Wd / 4, bh = Hd / 4;
const alpha = Buffer.alloc(Wd * Hd);
const a = new Array(8);
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  const o = 128 + (by * bw + bx) * 16;
  a[0] = dds[o]; a[1] = dds[o + 1];
  if (a[0] > a[1]) { for (let i = 2; i < 8; i++) a[i] = Math.round(((8 - i) * a[0] + (i - 1) * a[1]) / 7); }
  else { for (let i = 2; i < 6; i++) a[i] = Math.round(((6 - i) * a[0] + (i - 1) * a[1]) / 5); a[6] = 0; a[7] = 255; }
  const abits = BigInt(dds.readUInt32LE(o + 2)) | (BigInt(dds.readUInt32LE(o + 6)) << 32n);
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
    const x = bx * 4 + px, y = by * 4 + py;
    alpha[y * Wd + x] = a[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)];
  }
}

function bands(x0, x1, y0, y1) {
  const out = [];
  let s = -1;
  for (let y = y0; y <= y1; y++) {
    let ink = 0;
    for (let x = x0; x <= x1; x++) if (alpha[y * Wd + x] > 40) ink++;
    if (ink > 0 && s < 0) s = y; else if (ink === 0 && s >= 0) { out.push([s, y - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, y1]);
  return out;
}
function colRange(y0, y1) { let lo = 1e9, hi = -1; for (let y = y0; y <= y1; y++) for (let x = 0; x < Wd; x++) if (alpha[y * Wd + x] > 40) { if (x < lo) lo = x; if (x > hi) hi = x; } return [lo, hi]; }

if (process.argv.includes('--analyze')) {
  console.log('ink bands (x 0..140):');
  for (const b of bands(0, 140, 0, Hd - 1)) { const c = colRange(b[0], b[1]); console.log(`  y=${b[0]}..${b[1]} h=${b[1] - b[0] + 1} x=${c[0]}..${c[1]}`); }
  process.exit(0);
}

// The three Japanese labels (verified by --analyze):
//   右スティック y=113..128, 左スティック y=135..149, 方向キー y=157..172
const labels = JSON.parse(fs.readFileSync(W + 'i18n_src/icon.json', 'utf8')).labels;
const tb = labels.map(l => l.y);
console.log('label bands:', JSON.stringify(tb.map(b => [b[0], b[1], colRange(b[0], b[1])])));

// render the Chinese labels
const job = { font: FONT, size: 20, bold: 0, width: 512, height: 48, lines: [] };
labels.forEach((l, i) => job.lines.push({ text: l.zh, out: path.join(TMP, `icon_${i}.bmp`), size: 20 }));
const jp = path.join(TMP, 'icon_job.json');
fs.writeFileSync(jp, '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jp], { stdio: 'ignore' });
function readBMP(p) { const b = fs.readFileSync(p); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) }; }
function lumAt(bmp, x, y) { const h = Math.abs(bmp.rawH); const yy = bmp.rawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4; return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)]; }
function bbox(bmp, th) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) if (lumAt(bmp, x, y) > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; }

labels.forEach((l, i) => {
  const [y0, y1] = tb[i];
  const [cx0, cx1] = colRange(y0, y1);
  const boxH = y1 - y0 + 1, boxW = cx1 - cx0 + 1;
  // clear old label
  for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = 0; x <= cx1 + 4; x++) if (y >= 0 && y < Hd && x < Wd) alpha[y * Wd + x] = 0;
  const bmp = readBMP(job.lines[i].out);
  const bb = bbox(bmp, 16);
  const inkW = bb[2] - bb[0] + 1, inkH = bb[3] - bb[1] + 1;
  const scale = Math.min(boxW / inkW, boxH / inkH, 1.4);
  const dw = Math.round(inkW * scale), dh = Math.round(inkH * scale);
  const px0 = cx0, py0 = y0 + Math.round((boxH - dh) / 2);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sxx = bb[0] + Math.floor(x / scale), syy = bb[1] + Math.floor(y / scale);
    const v = lumAt(bmp, sxx, syy);
    const tx = px0 + x, ty = py0 + y;
    if (tx >= 0 && tx < Wd && ty >= 0 && ty < Hd && v > alpha[ty * Wd + tx]) alpha[ty * Wd + tx] = v;
  }
  console.log(`"${l.jp}" -> "${l.zh}" box y=${y0}..${y1} x=${cx0}..${cx1} ink=${inkW}x${inkH} scale=${scale.toFixed(2)} -> paste ${dw}x${dh}@(${px0},${py0})`);
});

// re-encode the alpha of every block that overlaps the three label bands
const yLo = 110, yHi = 176;
const bx0 = 0, bx1 = Math.floor(140 / 4) + 1;
const out = Buffer.from(dds);
for (let by = Math.floor(yLo / 4); by <= Math.floor((yHi - 1) / 4); by++) for (let bx = bx0; bx <= bx1; bx++) {
  if (bx >= bw || by >= bh) continue;
  const o = 128 + (by * bw + bx) * 16;
  let lo = 255, hi = 0;
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const v = alpha[(by * 4 + py) * Wd + bx * 4 + px]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) { out[o] = lo; out[o + 1] = lo; out.writeUInt32LE(0, o + 2); out.writeUInt16LE(0, o + 6); }
  else {
    // DXT5 8-alpha mode: a0 > a1 -> endpoints at index 0/1, ramp at 2..7
    out[o] = hi; out[o + 1] = lo;
    const ramp = new Array(8);
    ramp[0] = hi; ramp[1] = lo;
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

fs.writeFileSync(W + 'font_02_icon_jp_zh.dds', out);
console.log('wrote ' + W + 'font_02_icon_jp_zh.dds (' + out.length + ' B)');

// preview alpha
const o2 = Buffer.alloc(Wd * Hd * 4, 255);
const alpha2 = Buffer.alloc(Wd * Hd);
const aa = new Array(8);
for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
  const o = 128 + (by * bw + bx) * 16;
  aa[0] = out[o]; aa[1] = out[o + 1];
  if (aa[0] > aa[1]) { for (let i = 2; i < 8; i++) aa[i] = Math.round(((8 - i) * aa[0] + (i - 1) * aa[1]) / 7); }
  else { for (let i = 2; i < 6; i++) aa[i] = Math.round(((6 - i) * aa[0] + (i - 1) * aa[1]) / 5); aa[6] = 0; aa[7] = 255; }
  const abits = BigInt(out.readUInt32LE(o + 2)) | (BigInt(out.readUInt32LE(o + 6)) << 32n);
  for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const x = bx * 4 + px, y = by * 4 + py; if (x < Wd && y < Hd) alpha2[y * Wd + x] = aa[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)]; }
}
for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const g = 255 - alpha2[y * Wd + x]; const i = (y * Wd + x) * 4; o2[i] = o2[i + 1] = o2[i + 2] = g; }
writePNG(W + 'font_02_icon_jp_zh.png', Wd, Hd, o2);
console.log('wrote preview');

if (process.argv.includes('--deploy')) {
  const fh = fs.openSync(HDD + 'common.dat', 'r+');
  try { fs.writeSync(fh, out, 0, out.length, ce.off); } finally { fs.closeSync(fh); }
  console.log('DEPLOYED ' + NAME + ' @' + ce.off);
}