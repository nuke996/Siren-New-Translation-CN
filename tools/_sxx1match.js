const __P = require('./_config.js');
'use strict';
// Identify sXX1 glyph cells by shape-matching against the same chapter's sXX0 atlas
// (sXX0 cells are labeled via the sig DB). sXX0 = 21x18 @24x28 ink(4..24, x+1);
// sXX1 = 28xN @18x22 ink(row*22+4, col*18+1).
// usage: node _sxx1match.js <tag> [minNcc]
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { loadDb } = require('./chapdecode.js');
const BASE = `${__P.DISC}/`;
const tag = process.argv[2] || 's01';
const MIN_NCC = parseFloat(process.argv[3] || '0.75');
const db = loadDb();
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const dbuf = fs.readFileSync(BASE + tag + '.dat');

function loadSheet(name) {
  const e = idx.entries.find(x => x.name.endsWith(name));
  const b = dbuf.subarray(e.off, e.off + e.size);
  const h = parseDDS(b);
  const rgba = decodeDXT1(b, h.width, h.height, h.dataOffset);
  const W = h.width, H = h.height, L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return { W, H, L, data: b, h };
}
const N = 16;
function feat(L, W, ox, oy, cw, ch) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (ox + x >= W) continue;
    if (L[(oy + y) * W + (ox + x)] > 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0 || x1 === x0 || y1 === y0) return null;
  const out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const sx = x0 + (x1 - x0) * i / (N - 1), sy = y0 + (y1 - y0) * j / (N - 1);
    out[j * N + i] = L[(oy + Math.round(sy)) * W + (ox + Math.round(sx))];
  }
  let m = 0; for (const v of out) m += v; m /= N * N;
  let s = 0; for (const v of out) s += (v - m) * (v - m); s = Math.sqrt(s) || 1;
  for (let k = 0; k < N * N; k++) out[k] = (out[k] - m) / s;
  return out;
}
function ncc(a, b) { let d = 0; for (let k = 0; k < N * N; k++) d += a[k] * b[k]; return d; }
function sigAt(sheet, col, row, bw, bh) {
  const bpr = (sheet.W / 4) * 8;
  const b0 = sheet.h.dataOffset + row * bh * bpr + col * bw * 8;
  const parts = [];
  for (let by = 0; by < bh; by++) { const base = b0 + by * bpr; parts.push(sheet.data.subarray(base, base + bw * 8)); }
  return Buffer.concat(parts).toString('hex');
}

const s0 = loadSheet(tag + '0.dds');
const refs = [];
for (let r = 0; r < Math.floor(s0.H / 28); r++) for (let c = 0; c < Math.floor(s0.W / 24); c++) {
  const ch2 = db[sigAt(s0, c, r, 6, 7)];
  if (!ch2) continue;
  const f = feat(s0.L, s0.W, c * 24 + 1, r * 28 + 4, 22, 22);
  if (f) refs.push({ char: ch2, f });
}
console.log(`${tag}: refs labeled = ${refs.length}`);

const s1 = loadSheet(tag + '1.dds');
const cols = Math.floor(s1.W / 18), rows = Math.floor(s1.H / 22);
const map = {}, stats = { blank: 0, ok: 0, weak: 0, total: cols * rows };
let globalMax = -9;
const lines = [];
for (let r = 0; r < rows; r++) {
  let rowtxt = '';
  for (let c = 0; c < cols; c++) {
    const cell = r * cols + c;
    const f = feat(s1.L, s1.W, c * 18 + 1, r * 22 + 4, 16, 16);
    if (!f) { map[cell] = ' '; stats.blank++; rowtxt += '·'; continue; }
    let b1 = -9, b2 = -9, char1 = '?';
    for (const ref of refs) { const v = ncc(f, ref.f); if (v > b1) { b2 = b1; b1 = v; char1 = ref.char; } else if (v > b2) b2 = v; }
    globalMax = Math.max(globalMax, b1);
    if (cell < 6) { const top = refs.map(rf => ({ c: rf.char, v: ncc(f, rf.f) })).sort((a, b) => b.v - a.v).slice(0, 4); console.log(`  cell${cell} top: ` + top.map(t => `${t.c}=${t.v.toFixed(3)}`).join(' ')); }
    if (b1 >= MIN_NCC) { map[cell] = char1; stats.ok++; rowtxt += char1; }
    else { map[cell] = ''; stats.weak++; rowtxt += '?'; }
    if (c === cols - 1) { /* noop */ }
  }
  lines.push(`r${r}: ${rowtxt}`);
}
console.log(lines.join('\n'));
console.log(`cells: total=${stats.total} ok=${stats.ok} weak=${stats.weak} blank=${stats.blank}  grid=${cols}x${rows}  globalMax=${globalMax.toFixed(3)}`);
fs.writeFileSync(`${__P.WORK}/` + tag + '_s1map.json', JSON.stringify({ tag, cols, rows, map }, null, 0));
console.log('wrote work/' + tag + '_s1map.json');