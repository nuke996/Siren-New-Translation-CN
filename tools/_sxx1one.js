const __P = require('./_config.js');
'use strict';
// Render specific sXX1 records to uniquely-named PNGs so duplicate names can be told apart.
// usage: node _sxx1one.js <tag> <name> [outdir]
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}/`;
const tag = process.argv[2], want = process.argv[3];
const OUT = WORK + (process.argv[4] || (tag + '1one'));
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const ddsE = idx.entries.find(e => e.name.endsWith(tag + '1.dds'));
const datE = idx.entries.find(e => e.name.endsWith(tag + '1.dat'));
const ddsRaw = Buffer.from(dbuf.subarray(ddsE.off, ddsE.off + ddsE.size));
const dat = Buffer.from(dbuf.subarray(datE.off, datE.off + datE.size));
const d = parseDDS(ddsRaw);
const rgba = decodeDXT1(ddsRaw, d.width, d.height, d.dataOffset);
const lum = new Uint8Array(d.width * d.height);
for (let i = 0; i < d.width * d.height; i++) lum[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
const COLS = 28, PX = 18, PY = 22, Y0 = 4, IW = 16, IH = 16;
function cellPx(g, x, y) { const r = Math.floor(g / COLS), c = g % COLS; const sx = c * PX + 1 + x, sy = r * PY + Y0 + y; if (sx < 0 || sy < 0 || sx >= d.width || sy >= d.height) return 0; return lum[sy * d.width + sx]; }
const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
recs.forEach(r => r.name = nameOf(r.nameOff));
recs.sort((a, b) => a.dataOff - b.dataOff);
function parse(start) {
  const flag = dat.readUInt16BE(start), N = flag >> 8;
  let p = start + 2 + 2 * N;
  p += 4; if (dat.readUInt16BE(p) !== 0xfffc) throw new Error('no FFFC'); p += 2;
  const segs = [];
  for (let k = 0; k < N; k++) {
    if (k > 0) { p += 4; }
    p += 2;
    const skel = [];
    while (p + 1 < dat.length) {
      const v = dat.readUInt16BE(p);
      if (v === 0xffff || v === 0xfffe) break;
      if (v === 0xfffd || v === 0xfffb) { skel.push({ t: [v, dat.readUInt16BE(p + 2)] }); p += 4; continue; }
      if (v === 0xfffc) { skel.push({ t: [v] }); p += 2; continue; }
      if (v < 0xff00) { const run = []; while (p + 1 < dat.length) { const u = dat.readUInt16BE(p); if (u >= 0xff00) break; run.push(u); p += 2; } skel.push({ run }); continue; }
      skel.push({ t: [v] }); p += 2;
    }
    segs.push({ w: 0, skel, runs: skel.filter(s => s.run).map(s => s.run.length) });
  }
  return { flag, N, segs };
}
const WRAP = 28, GAPX = 3, GAPY = 8, TOKW = 10;
fs.mkdirSync(OUT, { recursive: true });
let occ = 0;
for (const r of recs) {
  if (r.name !== want) continue;
  occ++;
  const rec = parse(r.dataOff);
  const rows = [];
  for (const s of rec.segs) {
    const items = [];
    for (const el of s.skel) { if (el.run) for (const g of el.run) items.push({ g }); else items.push({ tok: true }); }
    if (!items.length) { rows.push([]); continue; }
    for (let k = 0; k < items.length; k += WRAP) rows.push(items.slice(k, k + WRAP));
  }
  if (!rows.length) rows.push([]);
  const maxLen = Math.max(...rows.map(x => x.length));
  const w = maxLen * (IW + GAPX), h = rows.length * (IH + GAPY);
  const img = Buffer.alloc(w * h * 4, 255);
  rows.forEach((rowItems, ri) => rowItems.forEach((it, ci) => {
    const bx = ci * (IW + GAPX), by = ri * (IH + GAPY);
    if (it.tok) { for (let y = 4; y < 12; y++) for (let x = 3; x < 3 + TOKW; x++) { const tx = bx + x, ty = by + y; if (tx < w && ty < h) { const q = (ty * w + tx) * 4; img[q] = 128; img[q + 1] = 128; img[q + 2] = 128; } } return; }
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const v = cellPx(it.g, x, y) > 55 ? 0 : 255; const tx = bx + x, ty = by + y; if (tx < w && ty < h) { const q = (ty * w + tx) * 4; img[q] = v; img[q + 1] = v; img[q + 2] = v; } }
  }));
  const file = OUT + '/' + want + '_occ' + occ + '_0x' + rec.flag.toString(16) + '.png';
  writePNG(file, w, h, img);
  console.log(`occ${occ} flag=0x${rec.flag.toString(16)} segs=${rec.N} runs=${JSON.stringify(rec.segs.map(s => s.runs))} -> ${file}`);
}
if (!occ) console.log('no record named ' + want);