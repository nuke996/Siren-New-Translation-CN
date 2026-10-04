#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
// Estimate the cell pitch of a sheet by ink projection (find separator minima spacing).
// usage: node _pitch.js <tag> <n>
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const tag = process.argv[2], n = process.argv[3];
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const ddsE = idx.entries.find(e => e.name.endsWith(tag + n + '.dds'));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const sheet = Buffer.from(dbuf.subarray(ddsE.off, ddsE.off + ddsE.size));
const hdr = parseDDS(sheet); const W = hdr.width, H = hdr.height;
const rgba = decodeDXT1(sheet, W, H, hdr.dataOffset);
const ink = (x, y) => 255 - Math.round((rgba[(y * W + x) * 4] + rgba[(y * W + x) * 4 + 1] + rgba[(y * W + x) * 4 + 2]) / 3);
const colInk = new Array(W).fill(0), rowInk = new Array(H).fill(0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = ink(x, y); colInk[x] += v; rowInk[y] += v; }
function seps(arr, win) {
  const th = Math.max(...arr) * 0.12;
  const out = []; let x = 0;
  while (x < arr.length) {
    if (arr[x] <= th) { let s = x; while (x < arr.length && arr[x] <= th) x++; out.push(Math.round((s + x - 1) / 2)); }
    else x++;
  }
  return out.filter((v, i, a) => i === 0 || v - a[i - 1] >= 3);
}
function diffs(pos) { const d = []; for (let i = 1; i < pos.length; i++) d.push(pos[i] - pos[i - 1]); return d; }
console.log(tag + n, W + 'x' + H, 'dataOff=' + hdr.dataOffset);
console.log('col separators:', seps(colInk).join(','));
console.log('col spacing   :', diffs(seps(colInk)).join(','));
console.log('row separators:', seps(rowInk).join(','));
console.log('row spacing   :', diffs(seps(rowInk)).join(','));