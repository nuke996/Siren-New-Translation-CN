const __P = require('./_config.js');
'use strict';
// Render sXX1 (GUIDE/TUTORIAL) messages by pasting atlas cells, so the Japanese can be read.
// sXX1 grid = 28 cols, cell 18x22, ink origin (col*18+1, row*22+4), ink 16x16.
// usage: node _sxx1render.js <tag> [outdir]
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}/`;
const tag = process.argv[2] || 's01';
const OUT = WORK + (process.argv[3] || (tag + '1msg'));
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const ddsE = idx.entries.find(e => e.name.endsWith(tag + '1.dds'));
const datE = idx.entries.find(e => e.name.endsWith(tag + '1.dat'));
const ddsRaw = process.argv[4] ? fs.readFileSync(process.argv[4]) : Buffer.from(dbuf.subarray(ddsE.off, ddsE.off + ddsE.size));
const dat = process.argv[5] ? fs.readFileSync(process.argv[5]) : Buffer.from(dbuf.subarray(datE.off, datE.off + datE.size));
const d = parseDDS(ddsRaw);
const rgba = decodeDXT1(ddsRaw, d.width, d.height, d.dataOffset);
const lum = new Uint8Array(d.width * d.height);
for (let i = 0; i < d.width * d.height; i++) lum[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
const COLS = 28, PX = 18, PY = 22, Y0 = 4, IW = 16, IH = 16;
function cellPx(g, x, y) { const r = Math.floor(g / COLS), c = g % COLS; const sx = c * PX + 1 + x, sy = r * PY + Y0 + y; if (sx < 0 || sy < 0 || sx >= d.width || sy >= d.height) return 0; return lum[sy * d.width + sx]; }

// --- FONTDATA header ---
const magic = dat.toString('latin1', 0, 8);
if (magic !== 'FONTDATA') throw new Error('bad magic ' + magic);
const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
recs.forEach(r => { r.name = nameOf(r.nameOff); });
recs.sort((a, b) => a.dataOff - b.dataOff);

// --- parse one record (sXX1 grammar) ---
// returns segs: [{ w, skel:[{t:[u16,...]}|{run:[idx,...]}], runs:[len,...], toks:[op,...] }]
function parse(start) {
  const flag = dat.readUInt16BE(start), N = flag >> 8;
  let p = start + 2 + 2 * N;
  if (dat.readUInt16BE(p) !== 0xfffd) throw new Error('no FFFD @' + p);
  const ctl = dat.readUInt16BE(p + 2); p += 4;
  if (dat.readUInt16BE(p) !== 0xfffc) throw new Error('no FFFC');
  p += 2;
  const segs = [];
  for (let k = 0; k < N; k++) {
    if (k > 0) { if (dat.readUInt16BE(p) !== 0xfffe || dat.readUInt16BE(p + 2) !== 0xfffc) throw new Error('no sep @' + p); p += 4; }
    const w = dat.readUInt16BE(p); p += 2;
    const skel = [], toks = [];
    while (p + 1 < dat.length) {
      const v = dat.readUInt16BE(p);
      if (v === 0xffff || v === 0xfffe) break;
      if (v === 0xfffd || v === 0xfffb) { const op = dat.readUInt16BE(p + 2); skel.push({ t: [v, op] }); toks.push(op); p += 4; continue; }
      if (v === 0xfffc) { skel.push({ t: [v] }); p += 2; continue; }
      if (v < 0xff00) { const run = []; while (p + 1 < dat.length) { const u = dat.readUInt16BE(p); if (u >= 0xff00) break; run.push(u); p += 2; } skel.push({ run }); continue; }
      skel.push({ t: [v] }); p += 2;
    }
    segs.push({ w, skel, runs: skel.filter(s => s.run).map(s => s.run.length), toks });
  }
  return { flag, N, ctl, segs };
}

const WRAP = 28, GAPX = 3, GAPY = 8, TOKW = 10;
const meta = [];
fs.mkdirSync(OUT, { recursive: true });
for (const r of recs) {
  let segs;
  try { segs = parse(r.dataOff).segs; } catch (e) { console.log(`${r.name}: PARSE ERR ${e.message}`); continue; }
  // build rows per segment (each segment starts a new block) so segment
  // boundaries are visually clear; tokens render as grey squares.
  const rows = [];
  for (const s of segs) {
    const items = [];
    for (const el of s.skel) {
      if (el.run) for (const g of el.run) items.push({ g });
      else items.push({ tok: true, v: el.t[0] });
    }
    if (!items.length) { rows.push([]); continue; }
    for (let k = 0; k < items.length; k += WRAP) rows.push(items.slice(k, k + WRAP));
  }
  if (!rows.length) rows.push([]);
  const maxLen = Math.max(...rows.map(x => x.length));
  const w = maxLen * (IW + GAPX), h = rows.length * (IH + GAPY);
  const img = Buffer.alloc(w * h * 4, 255);
  rows.forEach((rowItems, ri) => rowItems.forEach((it, ci) => {
    const bx = ci * (IW + GAPX), by = ri * (IH + GAPY);
    if (it.tok) {
      // draw a small filled grey square to mark a button-icon token
      for (let y = 4; y < 12; y++) for (let x = 3; x < 3 + TOKW; x++) {
        const tx = bx + x, ty = by + y;
        if (tx < w && ty < h) { const q = (ty * w + tx) * 4; img[q] = 128; img[q + 1] = 128; img[q + 2] = 128; }
      }
      return;
    }
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
      const v = cellPx(it.g, x, y) > 55 ? 0 : 255;
      const tx = bx + x, ty = by + y;
      if (tx < w && ty < h) { const q = (ty * w + tx) * 4; img[q] = v; img[q + 1] = v; img[q + 2] = v; }
    }
  }));
  const file = OUT + '/' + r.name.replace(/[^\w]/g, '_') + '.png';
  writePNG(file, w, h, img);
  const skelStr = segs.map(s => s.skel.map(e => e.run ? '(' + e.run.length + ')' : '[t' + e.t[1] + ']').join('')).join(' | ');
  meta.push({ name: r.name, flag: '0x' + dat.readUInt16BE(r.dataOff).toString(16), widths: segs.map(s => s.w), skel: skelStr, segRuns: segs.map(s => s.runs), segToks: segs.map(s => s.toks), file: file.split('/').pop() });
  console.log(`${r.name.padEnd(18)} flag=${meta[meta.length - 1].flag} widths=[${segs.map(s => s.w).join(',')}] ${skelStr} -> ${file.split('/').pop()} (${w}x${h})`);
}
fs.writeFileSync(OUT + '/index.json', JSON.stringify(meta, null, 1));
console.log('wrote', meta.length, 'images to', OUT);