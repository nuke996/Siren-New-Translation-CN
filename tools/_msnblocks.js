#!/usr/bin/env node
const __P = require('./_config.js');
// Dedupe the baked text lines across ALL chapters' HUD mission atlases.
// Reads sNN.hed (inside common.dat) -> hud/mission/sNN_mission.{dat,dds} from HDD sNN.dat,
// cuts one pixel block per MSN_DATA record (rows [a,a+c) x cols [0,b)),
// hashes them, and writes: work/msn/_blocks.json (unique index) + work/msn/_montage.png.
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');

const HDD = `${__P.HDD}/`;
const OUT = `${__P.WORK}/msn`;
fs.mkdirSync(OUT, { recursive: true });

const cidx = parseHed(fs.readFileSync(HDD + 'common.hed'));
const cdat = fs.readFileSync(HDD + 'common.dat');

function readEnt(tag, name) {
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  if (!ch) return null;
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const e = idx.entries.find(x => x.name === name);
  if (!e) return null;
  const fd = fs.openSync(HDD + tag + '.dat', 'r');
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, e.off);
  fs.closeSync(fd);
  return buf;
}

const tags = [];
for (let i = 1; i <= 25; i++) tags.push('s' + String(i).padStart(2, '0'));

const uniq = new Map();   // hash -> { h, w, c, gray:Buffer(w*c), sites:[{tag,i,name}] }
const chapters = {};
let total = 0, dup = 0;
for (const tag of tags) {
  const d = readEnt(tag, 'hud/mission/' + tag + '_mission.dat');
  const x = readEnt(tag, 'hud/mission/' + tag + '_mission.dds');
  if (!d || !x) { console.log(tag, 'MISSING'); continue; }
  const count = d.readUInt32BE(12);
  const hdr = parseDDS(x);
  const rgba = decodeDXT1(x, hdr.width, hdr.height, hdr.dataOffset);
  const recs = [];
  for (let i = 0; i < count; i++) {
    const o = 16 + i * 12;
    const a = d.readUInt32BE(o), b = d.readUInt16BE(o + 4), c = d.readUInt16BE(o + 6);
    const nm = d.toString('ascii', 820 + i * 16, 820 + i * 16 + 15).replace(/\0.*$/, '');
    // cut the block
    const w = Math.min(b + 2, hdr.width), h = c;
    const gray = Buffer.alloc(w * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const sx = xx, sy = a + y;
      if (sx >= hdr.width || sy >= hdr.height) continue;
      const si = (sy * hdr.width + sx) * 4;
      gray[y * w + xx] = Math.round(0.299 * rgba[si] + 0.587 * rgba[si + 1] + 0.114 * rgba[si + 2]);
    }
    const hh = crypto.createHash('md5').update(gray).update(Buffer.from([w, c])).digest('hex');
    recs.push({ i, a, b, c, name: nm, h: hh });
    total++;
    const u = uniq.get(hh);
    if (u) { u.sites.push({ tag, i, name: nm }); dup++; }
    else uniq.set(hh, { h: hh, w, c, gray, sites: [{ tag, i, name: nm }] });
  }
  chapters[tag] = recs;
}
console.log(`chapters=${Object.keys(chapters).length} total records=${total} unique=${uniq.size} dup=${dup}`);

// index JSON
const list = [...uniq.values()];
const index = list.map((u, k) => ({ k, h: u.h, w: u.w, c: u.c, count: u.sites.length, example: u.sites[0], sites: u.sites }));
fs.writeFileSync(OUT + '/_blocks.json', JSON.stringify(index, null, 1));
fs.writeFileSync(OUT + '/_chapters.json', JSON.stringify(chapters, null, 1));

// montage: one unique block per row, upscaled x3, labelled by row order
const S = 3, pad = 3, W = 256 * S + 2 * pad;
const H = list.length * (21 * S + pad) + pad;
const out = Buffer.alloc(W * H * 4, 255);
list.forEach((u, k) => {
  const oy = pad + k * (21 * S + pad);
  for (let y = 0; y < u.c; y++) for (let xx = 0; xx < u.w; xx++) {
    const g = u.gray[y * u.w + xx];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const dx = pad + xx * S + sx, dy = oy + y * S + sy;
      if (dx >= W || dy >= H) continue;
      const o = (dy * W + dx) * 4;
      out[o] = out[o + 1] = out[o + 2] = 255 - g; out[o + 3] = 255;
    }
  }
});
writePNG(OUT + '/_montage.png', W, H, out);
console.log('wrote ' + OUT + '/_blocks.json  _chapters.json  _montage.png (' + W + 'x' + H + ')');