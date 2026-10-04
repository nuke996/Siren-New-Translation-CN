#!/usr/bin/env node
// EXPORT every translatable string (Japanese original + current Chinese) into the
// translator-facing JSON files under _hanhua/i18n/.
//
//   - font-atlas text (FONTDATA): jp=orig, zh=current
//   - baked image text (A8/DXT):  jp where known, otherwise a reference PNG of the
//     original texture is written to _hanhua/i18n/refs/
//   - plaintext containers
//
// Run this, hand _hanhua/i18n/ to the translator, then run import_text.js.
// usage: node export_text.js
'use strict';
const fs = require('fs');
const path = require('path');
const { WORK, I18N, DISC, RD, WR, safeName, UNITS } = require('./_i18n_lib.js');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

fs.mkdirSync(I18N, { recursive: true });
fs.mkdirSync(path.join(I18N, 'refs'), { recursive: true });

// ---- ensure the Japanese side of the plaintext containers exists --------------
const commonHed = parseHed(fs.readFileSync(DISC + '/common.hed'));
const commonDat = fs.readFileSync(DISC + '/common.dat');
function extract(entryName, outFile) {
  const e = commonHed.entries.find(x => x.name === entryName);
  if (!e) return false;
  fs.writeFileSync(outFile, commonDat.subarray(e.off, e.off + e.size));
  return true;
}
if (!fs.existsSync(WORK + '/system_jp.dat')) {
  if (extract('text/system.dat', WORK + '/system_jp.dat')) console.log('extracted original text/system.dat -> work/system_jp.dat');
}

// ---- reference PNG renderer (original texture, grayscale) --------------------
function decodeDXT5Alpha(buf, W, H, off) {
  const alpha = Buffer.alloc(W * H); const bw = Math.ceil(W / 4), bh = Math.ceil(H / 4); const a = new Array(8);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    a[0] = buf[off]; a[1] = buf[off + 1];
    if (a[0] > a[1]) { for (let i = 2; i < 8; i++) a[i] = Math.round(((8 - i) * a[0] + (i - 1) * a[1]) / 7); }
    else { for (let i = 2; i < 6; i++) a[i] = Math.round(((6 - i) * a[0] + (i - 1) * a[1]) / 5); a[6] = 0; a[7] = 255; }
    const abits = BigInt(buf.readUInt32LE(off + 2)) | (BigInt(buf.readUInt32LE(off + 6)) << 32n); off += 16;
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const x = bx * 4 + px, y = by * 4 + py; if (x >= W || y >= H) continue; alpha[y * W + x] = a[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)]; }
  }
  return alpha;
}
const refCache = new Set();
function makeRef(name) {
  const safe = safeName(name) + '.png';
  const rel = 'refs/' + safe;
  const out = path.join(I18N, rel);
  if (refCache.has(safe)) return rel;
  refCache.add(safe);
  if (fs.existsSync(out)) return rel;
  const e = commonHed.entries.find(x => x.name === name);
  if (!e) return undefined;
  const b = commonDat.subarray(e.off, e.off + e.size);
  if (b.toString('ascii', 0, 4) !== 'DDS ') return undefined;
  const hdr = parseDDS(b); const W = hdr.width, H = hdr.height;
  const cc = hdr.fourCC.replace(/\0/g, '').trim(); const gray = Buffer.alloc(W * H);
  if (cc === 'DXT1') { const rgba = decodeDXT1(b, W, H, hdr.dataOffset); for (let i = 0; i < W * H; i++) gray[i] = Math.round(.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]); }
  else if (cc === 'DXT5') { const a = decodeDXT5Alpha(b, W, H, hdr.dataOffset); for (let i = 0; i < W * H; i++) gray[i] = 255 - a[i]; }
  else if (hdr.rgbBitCount === 8) { for (let i = 0; i < W * H; i++) gray[i] = 255 - b[hdr.dataOffset + i]; }
  else if (hdr.rgbBitCount === 32) { for (let i = 0; i < W * H; i++) { const p = hdr.dataOffset + i * 4; gray[i] = Math.round(.299 * b[p] + .587 * b[p + 1] + .114 * b[p + 2]); } }
  else return undefined;
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i]; rgba[i * 4 + 3] = 255; }
  writePNG(out, W, H, rgba);
  return rel;
}

// ---- run every unit ----------------------------------------------------------
let total = 0, refs = 0;
for (const u of UNITS) {
  const rows = u.read();
  const entries = rows.map(r => {
    const o = { id: r.id, jp: r.jp, zh: r.zh };
    if (u.kind === 'texture' && r.refName) {
      const ref = makeRef(r.refName);
      if (ref) { o.ref = ref; refs++; }
    }
    if (r.meta && Object.keys(r.meta).length) o.meta = r.meta;
    return o;
  });
  const doc = {
    _kind: u.kind,
    _note: u.note,
    _how_to_edit: '只修改每条记录的 "zh" 字段（jp/ref/meta 请勿改）。保存后运行 导入汉化.bat 即可重新生成并部署；运行 导出汉化.bat 可再次导出覆盖本文件。',
    _count: entries.length,
    entries,
  };
  WR(path.join(I18N, u.file), doc);
  console.log(`${u.file.padEnd(26)} ${String(entries.length).padStart(5)} entries  [${u.kind}]`);
  total += entries.length;
}
console.log(`\nexported ${total} entries (+${refs} ref images) -> _hanhua/i18n/`);
console.log('translate / polish the "zh" fields, then run: node _i18n_import.js');
