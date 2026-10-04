#!/usr/bin/env node
const __P = require('./_config.js');
// Rebuild the hud/launcher/label glyph atlas (512x128 DXT1, 28 cols x 5 rows,
// cell 18x22, ink band y+4..y+19, glyph advance 16px) with SimHei Chinese glyphs,
// re-encoding the WHOLE image (18px cells are not 4px aligned -> cannot patch
// individual DXT1 blocks, so a full re-encode is required).
//
// Outputs:
//   work/label_zh.dds        new atlas
//   work/label_zh.png        preview (3x)
//   work/label_cells.json    { char: cellIndex }
//   work/label_zh.json       { lines:[{name,text}] } normalised (ASCII -> full width)
//
// usage: node _labelgen.js [size]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const D = `${__P.WORK}/`;
const PS1 = path.join(__dirname, 'render_text.ps1');
const SIZE = Number(process.argv[2]) || 17;
const COLS = 28, ROWS = 5, PX = 18, PY = 22, Y0 = 4, ADV = 16, NC = COLS * ROWS;

// ASCII -> full-width so each glyph fills the 16px advance slot (the engine
// advances a fixed 16px per glyph regardless of the character's width).
function toFW(s) {
  let o = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x21 && c <= 0x7e) o += String.fromCodePoint(c + 0xfee0);
    else if (c === 0x20) o += '\u3000';
    else o += ch;
  }
  return o;
}

const draft = JSON.parse(fs.readFileSync(D + 'zh_draft_label.json', 'utf8'));
const lines = draft.lines.map(l => ({ name: l.name, text: toFW(l.text) }));

// distinct chars in first-appearance order
const chars = [];
const seen = new Set();
for (const l of lines) for (const ch of l.text) {
  if (ch === '\n' || ch === '\r') continue;
  if (!seen.has(ch)) { seen.add(ch); chars.push(ch); }
}
console.log(`distinct chars = ${chars.length} (capacity ${NC})`);
if (chars.length > NC) throw new Error('too many distinct glyphs for the atlas');

// ---- render every char ----
const job = { font: 'SimHei', size: SIZE, bold: 0, hint: process.env.ZH_HINT || 'sbp', width: 120, height: 120, lines: [] };
const outs = [];
chars.forEach((c, i) => {
  const o = path.join(D, `_lb${i}.bmp`);
  outs.push(o); job.lines.push({ text: c, out: o });
});
const jobPath = path.join(D, '_labelgen_job.json');
fs.writeFileSync(jobPath, '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jobPath], { stdio: 'inherit' });

function readBMP(p) {
  const b = fs.readFileSync(p);
  return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) };
}
function lum(bmp, x, y) {
  const h = Math.abs(bmp.rawH);
  const yy = bmp.rawH > 0 ? (h - 1 - y) : y;
  const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4;
  return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)];
}

// ---- compose luminance canvas ----
const rawDds = fs.readFileSync(D + 'label.dds');
const hdr = parseDDS(rawDds);
const W = hdr.width, H = hdr.height;
console.log(`atlas ${W}x${H} dataOffset=${hdr.dataOffset} file=${rawDds.length}`);
const canvas = new Uint8Array(W * H); // black background

const cellOf = {};
chars.forEach((c, i) => {
  cellOf[c] = i;
  const bmp = readBMP(outs[i]);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) {
    if (lum(bmp, x, y) > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return;
  const col = i % COLS, row = Math.floor(i / COLS);
  const dx = col * PX + 1 - x0;         // ink left edge -> cell x+1
  const dy = row * PY + Y0 - y0;        // ink top -> band top
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = lum(bmp, x, y);
    const tx = dx + x, ty = dy + y;
    if (tx >= 0 && tx < W && ty >= 0 && ty < H && v > canvas[ty * W + tx]) canvas[ty * W + tx] = v;
  }
});
// free the temp bmps
outs.forEach(o => { try { fs.unlinkSync(o); } catch (e) { } });

// ---- DXT1 encode whole image ----
function pack565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
function unpack565v(c) { return [(c >> 11) & 31, (c >> 5) & 63, c & 31]; }
function toGray(v) { return ((v[0] << 3) | (v[0] >> 2)) * 0.299 + ((v[1] << 2) | (v[1] >> 4)) * 0.587 + ((v[2] << 3) | (v[2] >> 2)) * 0.114; }
function encodeBlocks(lumAt) {
  const out = Buffer.alloc((W / 4) * (H / 4) * 8);
  let o = 0;
  for (let by = 0; by < H / 4; by++) for (let bx = 0; bx < W / 4; bx++) {
    const vals = [];
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) vals.push(lumAt(bx * 4 + px, by * 4 + py));
    const mx = Math.max(...vals), mn = Math.min(...vals);
    let c0 = pack565(mx, mx, mx), c1 = pack565(mn, mn, mn);
    if (c0 === c1) c1 = c0 - 1 < 0 ? 0 : c0 - 1;   // keep 4-colour opaque mode
    const e0 = unpack565v(c0), e1 = unpack565v(c1);
    const g0 = toGray(e0), g1 = toGray(e1);
    const pal = [g0, g1, (g0 + 2 * g1) / 3, (2 * g0 + g1) / 3];
    let bits = 0;
    for (let i = 0; i < 16; i++) {
      let best = 0, bd = 1e9;
      for (let k = 0; k < 4; k++) { const d = Math.abs(vals[i] - pal[k]); if (d < bd) { bd = d; best = k; } }
      bits |= best << (i * 2);
    }
    out.writeUInt16LE(c0, o); o += 2;
    out.writeUInt16LE(c1, o); o += 2;
    out.writeUInt32LE(bits >>> 0, o); o += 4;
  }
  return out;
}
const data = encodeBlocks((x, y) => canvas[y * W + x]);
const outBuf = Buffer.concat([rawDds.subarray(0, hdr.dataOffset), data]);
fs.writeFileSync(D + 'label_zh.dds', outBuf);
console.log(`wrote label_zh.dds (${outBuf.length} B, orig ${rawDds.length})`);

// preview 3x
const S = 3, ow = W * S, oh = H * S;
const big = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
  const v = canvas[Math.floor(y / S) * W + Math.floor(x / S)] > 60 ? 0 : 255;
  const i = (y * ow + x) * 4; big[i] = v; big[i + 1] = v; big[i + 2] = v; big[i + 3] = 255;
}
writePNG(D + 'label_zh.png', ow, oh, big);
console.log('wrote label_zh.png');

fs.writeFileSync(D + 'label_cells.json', JSON.stringify(cellOf, null, 1));
fs.writeFileSync(D + 'label_zh.json', JSON.stringify({ lines }, null, 1));
console.log(`wrote label_cells.json (${chars.length}) + label_zh.json (${lines.length} lines)`);
console.log('chars: ' + chars.join(''));