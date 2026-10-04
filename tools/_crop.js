#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const CW = 24, CH = 28;
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const stem = process.argv[2];
const cells = process.argv.slice(3).map(Number);
const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
const sheet = cdat.subarray(ddsE.off, ddsE.off + ddsE.size);
const hdr = parseDDS(sheet);
const cols = Math.floor(hdr.width / CW);
const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
const S = 4, pad = 4;
const W = cells.length * (CW * S + pad) + pad, H = CH * S + pad * 2;
const out = Buffer.alloc(W * H * 4, 255);
cells.forEach((cell, k) => {
  const col = cell % cols, row = Math.floor(cell / cols);
  for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) {
    const sx = col * CW + Math.floor(x / S), sy = row * CH + Math.floor(y / S);
    const i = (sy * hdr.width + sx) * 4;
    const l = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    const dx = pad + k * (CW * S + pad) + x, dy = pad + y;
    const o = (dy * W + dx) * 4;
    out[o] = out[o + 1] = out[o + 2] = 255 - l; // invert: dark ink on white
    out[o + 3] = 255;
  }
});
const p = `${__P.WORK}/_cells.png`;
writePNG(p, W, H, out);
console.log('wrote', p, 'cells=', cells.join(','));