const __P = require('./_config.js');
'use strict';
// Montage all menu/jp/main_status/weapon_name/name_i_w_*.dds (A8) vertically, ink-trimmed.
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, writePNG } = require('./dds2png.js');
const HDD = `${__P.HDD}/`;
const BASE = process.env.SNT_BASE || HDD;
const W = `${__P.WORK}/`;
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const names = idx.entries.map(e => e.name).filter(n => /^menu\/jp\/main_status\/weapon_name\/name_i_w_.*\.dds$/.test(n)).sort();
const rows = [], order = [];
let maxW = 0;
for (const n of names) {
  const e = idx.entries.find(x => x.name === n);
  const b = dat.subarray(e.off, e.off + e.size);
  const hdr = parseDDS(b); const w = hdr.width, h = hdr.height, off = hdr.dataOffset;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[off + y * w + x] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { rows.push({ name: n, w: 4, h: 4, img: Buffer.alloc(16, 255) }); order.push(n); continue; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const img = Buffer.alloc(cw * ch * 4, 255);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const g = 255 - b[off + (y0 + y) * w + (x0 + x)]; const i = (y * cw + x) * 4; img[i] = img[i + 1] = img[i + 2] = g; }
  rows.push({ name: n, w: cw, h: ch, img });
  if (cw > maxW) maxW = cw;
  order.push(`${n.replace(/^.*name_i_w_/, '').replace(/\.dds$/, '').padEnd(8)}  ${cw}x${ch}`);
}
const gap = 4, outH = rows.reduce((a, r) => a + r.h + gap, 0) + gap;
const out = Buffer.alloc(maxW * outH * 4, 255);
let yy = gap;
for (const r of rows) { for (let y = 0; y < r.h; y++) r.img.copy(out, ((yy + y) * maxW) * 4, y * r.w * 4, (y + 1) * r.w * 4); yy += r.h + gap; }
writePNG(W + 'nm_montage.png', maxW, outH, out);
console.log('rows:', rows.length, 'montage', maxW + 'x' + outH);
console.log(order.join('\n'));
