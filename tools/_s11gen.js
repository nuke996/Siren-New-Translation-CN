#!/usr/bin/env node
const __P = require('./_config.js');
// Build a Chinese glyph atlas for a chapter's sXX1 sheet (GUIDE/TUTORIAL).
// Geometry = same as label: 28 cols, cell 18x22, ink origin (col*18+1, row*22+4),
// ink 16x16, advance 16px.  18px cells are not 4px aligned -> full-image DXT1 re-encode.
//
// Outputs: work/import/<tag>1.dds  (same size as original),  work/<tag>1_cells.json {char:cell}
// usage: node _s11gen.js <tag> [size]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, writePNG } = require('./dds2png.js');

const BASE = process.env.SNT_BASE || `${__P.DISC}/`;
const D = `${__P.WORK}/`;
const IMP = D + 'import/';
const PS1 = path.join(__dirname, 'render_text.ps1');
const tag = process.argv[2];
if (!tag) { console.log('usage: node _s11gen.js <tag> [size]'); process.exit(1); }
const SIZE = Number(process.argv[3]) || 17;
const COLS = 28, PX = 18, PY = 22, Y0 = 4;

function toFW(s) {
  let o = '';
  for (const ch of s) { const c = ch.codePointAt(0);
    if (c >= 0x21 && c <= 0x7e) o += String.fromCodePoint(c + 0xfee0); else o += ch; }
  return o;
}

// ---- locate sXX1 sheet ----
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
if (!ch) throw new Error('no chapter ' + tag);
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const ddsE = idx.entries.find(e => e.name.endsWith(tag + '1.dds'));
const datE = idx.entries.find(e => e.name.endsWith(tag + '1.dat'));
const rawDds = Buffer.from(dbuf.subarray(ddsE.off, ddsE.off + ddsE.size));
const dat = Buffer.from(dbuf.subarray(datE.off, datE.off + datE.size));
const hdr = parseDDS(rawDds);
const W = hdr.width, H = hdr.height, ROWS = Math.floor(H / PY), NC = COLS * ROWS;

// ---- record names ----
const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
recs.sort((a, b) => a.dataOff - b.dataOff);
function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
recs.forEach(r => r.name = nameOf(r.nameOff));

// ---- draft ----
const draft = JSON.parse(fs.readFileSync(D + 'zh_draft_sxx1.json', 'utf8'));
const chap = draft[tag] || {};
// allow a duplicate record name to be disambiguated by flag: "NAME@0x201"
function draftOf(name, flag) { return chap[name + '@0x' + flag.toString(16)] || chap[name] || draft.shared[name]; }

const chars = [], seen = new Set(), missing = [];
for (const r of recs) {
  const segs = draftOf(r.name, dat.readUInt16BE(r.dataOff));
  if (!segs) { missing.push(r.name); continue; }
  for (const runs of segs) for (const run of runs) for (const ch2 of toFW(run)) {
    if (!seen.has(ch2)) { seen.add(ch2); chars.push(ch2); }
  }
}
if (missing.length) { console.log('WARN no draft for: ' + missing.join(', ')); }
console.log(`${tag}: grid ${COLS}x${ROWS} cap=${NC}  distinct chars=${chars.length}  msgs=${recs.length}`);
if (chars.length > NC) throw new Error(`too many distinct glyphs ${chars.length} > ${NC}`);

// ---- render ----
const job = { font: 'SimHei', size: SIZE, bold: 0, hint: process.env.ZH_HINT || 'sbp', width: 120, height: 120, lines: [] };
const outs = [];
chars.forEach((c, i) => { const o = path.join(D, `_s1${i}.bmp`); outs.push(o); job.lines.push({ text: c, out: o }); });
const jobPath = path.join(D, `_s11gen_${tag}.json`);
fs.writeFileSync(jobPath, '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jobPath], { stdio: 'inherit' });
function readBMP(p) { const b = fs.readFileSync(p); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) }; }
function lum(bmp, x, y) { const h = Math.abs(bmp.rawH); const yy = bmp.rawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4; return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)]; }

const canvas = new Uint8Array(W * H);
const cellOf = {};
// fixed crop window calibrated for SimHei size 17 drawn at (20,20): the reference
// CJK ink box is x24..37,y21..36 -> window (23,21,16x16) maps its top-left so the
// CJK ink lands exactly on the cell's ink band (col*18+1, row*22+4).
const WX0 = 23, WY0 = 21, WS = 16;
chars.forEach((c, i) => {
  cellOf[c] = i;
  const bmp = readBMP(outs[i]);
  const col = i % COLS, row = Math.floor(i / COLS);
  for (let wy = 0; wy < WS; wy++) for (let wx = 0; wx < WS; wx++) {
    const v = lum(bmp, WX0 + wx, WY0 + wy);
    const tx = col * PX + wx, ty = row * PY + Y0 + wy;
    if (tx >= 0 && tx < W && ty >= 0 && ty < H && v > canvas[ty * W + tx]) canvas[ty * W + tx] = v;
  }
});
outs.forEach(o => { try { fs.unlinkSync(o); } catch (e) { } });

function pack565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
function unpack565v(c) { return [(c >> 11) & 31, (c >> 5) & 63, c & 31]; }
function toGray(v) { return ((v[0] << 3) | (v[0] >> 2)) * 0.299 + ((v[1] << 2) | (v[1] >> 4)) * 0.587 + ((v[2] << 3) | (v[2] >> 2)) * 0.114; }
function encodeBlocks(lumAt) {
  const out = Buffer.alloc((W / 4) * (H / 4) * 8); let o = 0;
  for (let by = 0; by < H / 4; by++) for (let bx = 0; bx < W / 4; bx++) {
    const vals = [];
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) vals.push(lumAt(bx * 4 + px, by * 4 + py));
    const mx = Math.max(...vals), mn = Math.min(...vals);
    let c0 = pack565(mx, mx, mx), c1 = pack565(mn, mn, mn);
    if (c0 === c1) c1 = c0 - 1 < 0 ? 0 : c0 - 1;
    const e0 = unpack565v(c0), e1 = unpack565v(c1);
    const g0 = toGray(e0), g1 = toGray(e1);
    const pal = [g0, g1, (g0 + 2 * g1) / 3, (2 * g0 + g1) / 3];
    let bits = 0;
    for (let i = 0; i < 16; i++) { let best = 0, bd = 1e9; for (let k = 0; k < 4; k++) { const d = Math.abs(vals[i] - pal[k]); if (d < bd) { bd = d; best = k; } } bits |= best << (i * 2); }
    out.writeUInt16LE(c0, o); o += 2; out.writeUInt16LE(c1, o); o += 2; out.writeUInt32LE(bits >>> 0, o); o += 4;
  }
  return out;
}
const data = encodeBlocks((x, y) => canvas[y * W + x]);
const outBuf = Buffer.concat([rawDds.subarray(0, hdr.dataOffset), data]);
fs.mkdirSync(IMP, { recursive: true });
fs.writeFileSync(IMP + tag + '1.dds', outBuf);
console.log(`wrote import/${tag}1.dds (${outBuf.length} B, orig ${rawDds.length})`);
// preview 3x
const S = 3, ow = W * S, oh = H * S, big = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const v = canvas[Math.floor(y / S) * W + Math.floor(x / S)] > 60 ? 0 : 255; const i = (y * ow + x) * 4; big[i] = v; big[i + 1] = v; big[i + 2] = v; big[i + 3] = 255; }
writePNG(D + tag + '1_zh.png', ow, oh, big);
fs.writeFileSync(D + tag + '1_cells.json', JSON.stringify(cellOf, null, 1));
console.log(`wrote ${tag}1_cells.json (${chars.length}) + ${tag}1_zh.png`);
console.log('chars: ' + chars.join(''));