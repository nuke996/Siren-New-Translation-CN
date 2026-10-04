#!/usr/bin/env node
const __P = require('./_config.js');
// High-scale render of selected _unkarch entries (k indices) for close reading.
// usage: node _zoomarch.js <k,k...> [scale]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const OUT = `${__P.WORK}/import`;
const CELL_W = 24, CELL_H = 28;
const all = JSON.parse(fs.readFileSync(path.join(OUT, '_unk_all.json'), 'utf8'));
const list = all.filter(r => r.stem.startsWith('hud_launcher_jimaku'));
const pick = (process.argv[2] || '').split(',').filter(x => x !== '').map(Number);
const S = +(process.argv[3] || 8), LAB = 28, GAP = 6;
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const tw = CELL_W * S, th = CELL_H * S + LAB, ow = pick.length * (tw + GAP), oh = th;
const cv = Buffer.alloc(ow * oh * 4, 255);
const DIG = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'] };
function px(x, y, v) { if (x < 0 || y < 0 || x >= ow || y >= oh) return; const i = (y * ow + x) * 4; cv[i] = cv[i + 1] = cv[i + 2] = v; cv[i + 3] = 255; }
function dnum(n, x0, y0, sc) { const s = String(n); for (let d = 0; d < s.length; d++) { const f = DIG[s[d]]; for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (f[yy][xx] === '1') for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) px(x0 + d * 4 * sc + xx * sc + dx, y0 + yy * sc + dy, 0); } }
const cache = {};
pick.forEach((k, slot) => {
  const r = list[k]; if (!r) return;
  if (!cache[r.stem]) { const real = 'hud/launcher/jimaku/' + r.stem.slice('hud_launcher_jimaku_'.length); const e = cidx.entries.find(x => x.name === real + '.dds'); cache[r.stem] = e ? cdat.subarray(e.off, e.off + e.size) : null; }
  const sheet = cache[r.stem]; if (!sheet) { console.log('no sheet for', r.stem); return; }
  const hdr = parseDDS(sheet), cols = Math.floor(hdr.width / CELL_W);
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  const col = r.cell % cols, row = Math.floor(r.cell / cols), gx = slot * (tw + GAP);
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const si = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
    const g = 255 - Math.round((rgba[si] + rgba[si + 1] + rgba[si + 2]) / 3);
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) px(gx + x * S + dx, LAB + y * S + dy, g);
  }
  dnum(k, gx + 4, 4, 5);
});
writePNG(path.join(OUT, '_zoomarch.png'), ow, oh, cv);
console.log('wrote _zoomarch.png', ow + 'x' + oh);