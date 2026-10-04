const __P = require('./_config.js');
// Survey D12 (menu/jp/main_status + main_map) A8 masks: dims, ink stats, dup detection.
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const OUT = `${__P.WORK}/d12/`;
fs.mkdirSync(OUT, { recursive: true });

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');

const groups = new Map();
const rows = [];
for (const e of idx.entries) {
  if (!/^menu\/jp\/main_(status|map)\//.test(e.name)) continue;
  if (!/\.dds$/i.test(e.name)) continue;
  const buf = dat.subarray(e.off, e.off + e.size);
  let hdr;
  try { hdr = parseDDS(Buffer.from(buf.subarray(0, 148))); } catch (err) { continue; }
  const { width: W, height: H, dataOffset: off, rgbBitCount: bpp } = hdr;
  // alpha plane: A8 -> after header (very likely 128). sample alpha stats.
  const need = W * H * (bpp / 8 || 1);
  const avail = buf.length - off;
  let nz = 0, total = Math.min(need, avail);
  for (let i = 0; i < total; i++) if (buf[off + i]) nz++;
  // ink bbox on the alpha plane (assume 1 byte/px)
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  if ((bpp || 8) === 8 && avail >= W * H) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (buf[off + y * W + x] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const h = crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
  const gkey = e.name.replace(/\/[^/]+$/, '');
  const g = groups.get(gkey) || { n: 0, texts: 0 };
  g.n++; if (nz > 0) g.texts++;
  groups.set(gkey, g);
  rows.push({ name: e.name, W, H, bpp, size: e.size, nz, nzFrac: +(nz / (W * H)).toFixed(3), bbox: x1 >= 0 ? [x0, y0, x1, y1] : null, md5: h });
}
fs.writeFileSync(OUT + 'survey.json', JSON.stringify(rows, null, 1));
for (const [k, v] of [...groups.entries()].sort()) console.log(`${String(v.n).padStart(4)}  text=${String(v.texts).padStart(4)}  ${k}`);
// md5 dup groups
const byMd5 = new Map();
for (const r of rows) { const a = byMd5.get(r.md5) || []; a.push(r.name); byMd5.set(r.md5, a); }
const dups = [...byMd5.values()].filter(a => a.length > 1);
fs.writeFileSync(OUT + 'dups.json', JSON.stringify(dups, null, 1));
console.log(`\nentries=${rows.length}  dupGroups=${dups.length}`);
for (const d of dups.slice(0, 30)) console.log('  dup: ' + d.join('  =  '));
