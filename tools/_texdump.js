const __P = require('./_config.js');
'use strict';
// Dump any common.dat DDS entries matching a substring to visible grayscale PNGs.
// Handles A8 (raw8), raw32 RGBA/BGRA, DXT1 (lum), DXT5 (alpha).
// usage: node _texdump.js <substr> [outdir]
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const HDD = `${__P.HDD}/`;
const BASE = process.env.SNT_BASE || HDD;
const WORK = `${__P.WORK}/`;
const sub = process.argv[2];
const OUT = WORK + (process.argv[3] || 'uiprobe') + '/';
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
fs.mkdirSync(OUT, { recursive: true });

function decodeDXT5Alpha(buf, W, H, off) {
  const alpha = Buffer.alloc(W * H);
  const bw = Math.ceil(W / 4), bh = Math.ceil(H / 4);
  const a = new Array(8);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    a[0] = buf[off]; a[1] = buf[off + 1];
    if (a[0] > a[1]) { for (let i = 2; i < 8; i++) a[i] = Math.round(((8 - i) * a[0] + (i - 1) * a[1]) / 7); }
    else { for (let i = 2; i < 6; i++) a[i] = Math.round(((6 - i) * a[0] + (i - 1) * a[1]) / 5); a[6] = 0; a[7] = 255; }
    const abits = BigInt(buf.readUInt32LE(off + 2)) | (BigInt(buf.readUInt32LE(off + 6)) << 32n);
    off += 16;
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const x = bx * 4 + px, y = by * 4 + py;
      if (x >= W || y >= H) continue;
      alpha[y * W + x] = a[Number((abits >> BigInt(3 * (py * 4 + px))) & 7n)];
    }
  }
  return alpha;
}

let n = 0;
for (const e of idx.entries) {
  if (!e.name.includes(sub) || !e.name.endsWith('.dds')) continue;
  const b = Buffer.from(dat.subarray(e.off, e.off + e.size));
  if (b.toString('ascii', 0, 4) !== 'DDS ') continue;
  const hdr = parseDDS(b);
  const cc = hdr.fourCC.replace(/\0/g, '').trim();
  const W = hdr.width, H = hdr.height;
  const gray = Buffer.alloc(W * H);
  if (cc === 'DXT1' || cc === '1TXD') {
    const rgba = decodeDXT1(b, W, H, hdr.dataOffset);
    for (let i = 0; i < W * H; i++) gray[i] = Math.round(.299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]);
  } else if (cc === 'DXT5') {
    const a = decodeDXT5Alpha(b, W, H, hdr.dataOffset);
    for (let i = 0; i < W * H; i++) gray[i] = 255 - a[i];
  } else if (hdr.rgbBitCount === 8) {
    for (let i = 0; i < W * H; i++) gray[i] = 255 - b[hdr.dataOffset + i];
  } else if (hdr.rgbBitCount === 32) {
    for (let i = 0; i < W * H; i++) { const p = hdr.dataOffset + i * 4; gray[i] = Math.round(.299 * b[p] + .587 * b[p + 1] + .114 * b[p + 2]); }
  } else { console.log('skip fmt', hdr.rgbBitCount, cc, e.name); continue; }
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gray[i]; out[i * 4 + 3] = 255; }
  const safe = e.name.replace(/[^A-Za-z0-9_]+/g, '_');
  writePNG(OUT + safe + '.png', W, H, out);
  console.log(`${cc || 'raw' + hdr.rgbBitCount} ${W}x${H}  ${e.name}`);
  n++;
}
console.log('dumped', n, 'to', OUT);
