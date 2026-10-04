#!/usr/bin/env node
const __P = require('./_config.js');
// Build + (optionally) deploy the HUD mission object atlas.
//
// For each chapter the game bakes its objective lines as one text line per
// MSN_DATA record into hud/mission/sNN_mission.dds, with the record giving
// (a=y offset, b=ink width, c=line height).  This tool re-renders every line in
// Chinese (text reused from the D12/D1 translation data via work/msn/*.json),
// pastes it back into the DXT1 atlas and updates the `b` width field.
//
// usage: node _msnbuild.js [--deploy] [tag ...]      (default: all chapters)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

// Base to read originals from: live HDD install if present, else the disc source.
const BASE = `${__P.BASE}/`;
const W = `${__P.WORK}/`;
const MSN = W + 'msn/';
const TMP = MSN + 'tmp/';
const D12 = W + 'd12/';
const PS1 = path.join(__dirname, 'render_text.ps1');
const FONT = process.env.MSN_FONT || 'SimHei';
const MAXW = 250;
fs.mkdirSync(TMP, { recursive: true });

// ---------- translation resolution ----------
const items = {};
for (const f of ['trans.json', 'part_smallaim_1.json', 'part_smallaim_2.json', 'part_status.json', 'part_landmark.json']) {
  if (!fs.existsSync(D12 + f)) continue;
  const j = JSON.parse(fs.readFileSync(D12 + f, 'utf8'));
  for (const [k, v] of Object.entries(j.items || j)) {
    if (v && typeof v === 'object' && typeof v.text === 'string') items[k] = v.text;
    else if (typeof v === 'string') items[k] = v;
  }
}
const byObj = {}, byMission = {};
for (const [k, t] of Object.entries(items)) {
  let m = k.match(/text_(?:small)?aim\/s(\d\d)_(object\d\d_\d\d)\.dds$/i);
  if (m) { byObj['s' + m[1] + '_' + m[2].toLowerCase()] = t; continue; }
  m = k.match(/text_mission\/s(\d\d)_object_main\.dds$/i);
  if (m) { byMission['s' + m[1]] = t; }
}
function textOf(tag, name) {
  if (/_OBJECT_MAIN$/i.test(name)) return byMission[tag] || null;
  const m = name.match(/^(S\d\d)_(OBJECT\d\d_\d\d)$/i);
  if (m) return byObj[m[1].toLowerCase() + '_' + m[2].toLowerCase()] || null;
  return null;
}
// Blocks with no name-based hit are resolved from a sibling in the same dedup
// group; the single un-covered group is OBJECT11_05 = "小目的なし".
const blocks = JSON.parse(fs.readFileSync(MSN + '_blocks.json', 'utf8'));
const chaptersJson = JSON.parse(fs.readFileSync(MSN + '_chapters.json', 'utf8'));
const blockText = {};   // h -> chinese
for (const u of blocks) {
  for (const s of u.sites) { const t = textOf(s.tag, s.name); if (t) { blockText[u.h] = t; break; } }
  if (!blockText[u.h] && u.sites.every(s => /OBJECT11_05$/.test(s.name))) blockText[u.h] = '无小目标';
}
const tagH = {};        // tag -> { recordIndex: blockHash }
for (const [tag, recs] of Object.entries(chaptersJson)) { tagH[tag] = {}; for (const r of recs) tagH[tag][r.i] = r.h; }

// ---------- DXT1 encode ----------
function pack565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
function encodeAtlas(rgba, w, h) {
  const bw = w >> 2, bh = h >> 2;
  const out = Buffer.alloc(bw * bh * 8);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let lo = 255, hi = 0;
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const i = ((by * 4 + py) * w + bx * 4 + px) * 4;
      const l = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
      if (l < lo) lo = l; if (l > hi) hi = l;
    }
    let c0, c1, pal;
    if (hi - lo < 8) { c0 = c1 = pack565(hi, hi, hi); pal = [hi, hi, hi, -1]; }
    else { c0 = pack565(lo, lo, lo); c1 = pack565(hi, hi, hi); if (c0 > c1) { const t = c0; c0 = c1; c1 = t; } pal = [lo, hi, (lo + hi) / 2, -1]; }
    let bits = 0;
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const i = ((by * 4 + py) * w + bx * 4 + px) * 4;
      const l = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
      let best, bd = 1e9;
      // index 3 = transparent black: only for near-black background
      for (let k = 0; k < 4; k++) {
        const d = k === 3 ? (l < 60 ? l * 0.6 : 1e9) : Math.abs(l - pal[k]);
        if (d < bd) { bd = d; best = k; }
      }
      bits |= best << ((py * 4 + px) * 2);
    }
    out.writeUInt16LE(c0, o); out.writeUInt16LE(c1, o + 2); out.writeUInt32LE(bits >>> 0, o + 4); o += 8;
  }
  return out;
}

// ---------- BMP ----------
function readBMP(p) { const b = fs.readFileSync(p); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) }; }
function lumAt(bmp, x, y) { const h = Math.abs(bmp.rawH); const yy = bmp.rawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4; return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)]; }
function bbox(bmp, th) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) { if (lumAt(bmp, x, y) > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return [x0, y0, x1, y1]; }

const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const cdat = fs.readFileSync(BASE + 'common.dat');
function indexOf(tag) { const ch = cidx.entries.find(e => e.name === tag + '.hed'); return ch ? parseHed(cdat.subarray(ch.off, ch.off + ch.size)) : null; }
function readEnt(tag, name) { const idx = indexOf(tag); const e = idx.entries.find(x => x.name === name); const fd = fs.openSync(BASE + tag + '.dat', 'r'); const b = Buffer.alloc(e.size); fs.readSync(fd, b, 0, e.size, e.off); fs.closeSync(fd); return { e, buf: b }; }

const args = process.argv.slice(2);
const deploy = args.includes('--deploy');
let tags = args.filter(a => /^s\d\d$/.test(a));
if (!tags.length) { for (let i = 1; i <= 25; i++) tags.push('s' + String(i).padStart(2, '0')); }

let ok = 0, failed = 0;
for (const tag of tags) {
  const idx = indexOf(tag);
  if (!idx) { console.log(tag, 'NO HED'); failed++; continue; }
  const datName = 'hud/mission/' + tag + '_mission.dat';
  const ddsName = 'hud/mission/' + tag + '_mission.dds';
  const datE = idx.entries.find(e => e.name === datName);
  const ddsE = idx.entries.find(e => e.name === ddsName);
  if (!datE || !ddsE) { console.log(tag, 'NO MISSION ENTRIES'); failed++; continue; }
  const dat = readEnt(tag, datName).buf;
  const dds = readEnt(tag, ddsName).buf;
  const count = dat.readUInt32BE(12);
  const hdr = parseDDS(dds);
  const rgba = decodeDXT1(dds, hdr.width, hdr.height, hdr.dataOffset);
  const Wd = hdr.width, Hd = hdr.height;

  // gather lines
  const lines = [];
  for (let i = 0; i < count; i++) {
    const o = 16 + i * 12;
    const a = dat.readUInt32BE(o), b = dat.readUInt16BE(o + 4), c = dat.readUInt16BE(o + 6);
    const nm = dat.toString('ascii', 820 + i * 16, 820 + i * 16 + 15).replace(/\0.*$/, '');
    const h = tagH[tag] ? tagH[tag][i] : null;
    const text = (h && blockText[h]) || textOf(tag, nm) || null;
    lines.push({ i, a, b, c, nm, text });
  }
  const missing = lines.filter(l => !l.text);
  if (missing.length) { console.log(tag, 'MISSING TEXTS:', missing.map(l => l.nm).join(',')); }

  // render (two passes: estimate size, then shrink over-wide lines)
  const bmps = renderLines(tag, lines, lines.map(l => l.c));
  for (const l of lines) {
    const bb = bbox(bmps[l.i], 16);
    l.ink = bb[2] >= bb[0] ? [bb[0], bb[1], bb[2] - bb[0] + 1, bb[3] - bb[1] + 1] : [0, 0, 0, 0];
  }
  const shrink = lines.filter(l => l.ink[2] > MAXW);
  if (shrink.length) {
    const sizes = lines.map(l => l.ink[2] > MAXW ? Math.max(8, Math.floor(l.c * MAXW / l.ink[2])) : l.c);
    const b2 = renderLines(tag, lines, sizes);
    for (const l of shrink) { bmps[l.i] = b2[l.i]; const bb = bbox(b2[l.i], 16); l.ink = [bb[0], bb[1], bb[2] - bb[0] + 1, bb[3] - bb[1] + 1]; }
  }

  // composite into the atlas: clear each band, paste ink at x=0 vertically centred
  for (const l of lines) {
    for (let y = l.a; y < l.a + l.c; y++) for (let x = 0; x < Wd; x++) { const o = (y * Wd + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = 0; rgba[o + 3] = 255; }
  }
  for (const l of lines) {
    if (!l.ink[2]) continue;
    const bmp = bmps[l.i];
    const pasteY = l.a + Math.max(0, Math.round((l.c - l.ink[3]) / 2));
    for (let k = 0; k < l.ink[3]; k++) for (let j = 0; j < l.ink[2]; j++) {
      const v = lumAt(bmp, l.ink[0] + j, l.ink[1] + k);
      const tx = j, ty = pasteY + k;
      if (tx >= Wd || ty >= Hd) continue;
      const o = (ty * Wd + tx) * 4;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255;
    }
    dat.writeUInt16BE(Math.min(l.ink[2], 0xFFFF), 16 + l.i * 12 + 4);   // update width b
  }

  const px = encodeAtlas(rgba, Wd, Hd);
  const ndds = Buffer.concat([dds.subarray(0, 128), px]);
  if (ndds.length !== dds.length) throw new Error(tag + ' dds size drift ' + ndds.length + '/' + dds.length);

  fs.writeFileSync(MSN + tag + '_mission.dat', dat);
  fs.writeFileSync(MSN + tag + '_mission.dds', ndds);
  // preview
  const rp = decodeDXT1(ndds, Wd, Hd, 128);
  const prev = Buffer.alloc(Wd * 400 * 4, 255);
  for (let y = 0; y < 400; y++) for (let x = 0; x < Wd; x++) { const si = (y * Wd + x) * 4, di = (y * Wd + x) * 4; const l = Math.round(0.299 * rp[si] + 0.587 * rp[si + 1] + 0.114 * rp[si + 2]); prev[di] = prev[di + 1] = prev[di + 2] = 255 - l; }
  writePNG(MSN + tag + '_zh.png', Wd, 400, prev);

  if (deploy) {
    // Write into every target, dist/ first (see __P.DATA_TARGETS).  The mission
    // sheet is only one entry of the archive, so a non-HDD target must already
    // hold the complete archive before we patch it.  Keep the target's existing
    // bytes when present (so chapter/FONTDATA patches applied by an earlier
    // deploy tool survive and the tools compose regardless of order); otherwise
    // seed from the base.  Replacing the file with a private copy also breaks any
    // hard link back to the read-only disc.
    for (const T of __P.DATA_TARGETS) {
      fs.mkdirSync(T, { recursive: true });
      const f = T + '/' + tag + '.dat';
      if (T !== __P.HDD) {
        if (fs.existsSync(f)) {
          const keep = fs.readFileSync(f);
          fs.unlinkSync(f);
          fs.writeFileSync(f, keep);
        } else {
          fs.copyFileSync(BASE + tag + '.dat', f);
        }
      }
      const fd = fs.openSync(f, 'r+');
      try { fs.writeSync(fd, dat, 0, dat.length, datE.off); fs.writeSync(fd, ndds, 0, ndds.length, ddsE.off); } finally { fs.closeSync(fd); }
    }
  }
  console.log(`${tag}: lines=${count} overWide=${shrink.length} -> ${MSN}${tag}_mission.{dat,dds}${deploy ? '  DEPLOYED' : ''}`);
  ok++;
}
console.log(`\ndone: ok ${ok}, failed ${failed}${deploy ? ' (deployed)' : ''}`);

function renderLines(tag, lines, sizes) {
  const job = { font: FONT, size: 17, bold: 1, width: 1024, height: 48, lines: [] };
  const outs = [];
  lines.forEach((l, k) => {
    const o = path.join(TMP, `${tag}_${l.i}.bmp`);
    outs.push(o);
    job.lines.push({ text: l.text || '', out: o, size: sizes[k] });
  });
  const jp = path.join(TMP, tag + '_job.json');
  fs.writeFileSync(jp, '\uFEFF' + JSON.stringify(job), 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jp], { stdio: 'ignore' });
  return outs.map(readBMP);
}