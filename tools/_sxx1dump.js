#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
// Extract one embedded chapter sheet (.dds) and render it to PNG for visual inspection.
// usage: node _sxx1dump.js <tag> <n>   e.g. node _sxx1dump.js s01 1
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const tag = process.argv[2], n = process.argv[3];
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ch = cidx.entries.find(e => e.name === tag + '.hed');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const ddsE = idx.entries.find(e => e.name.endsWith(tag + n + '.dds'));
const dbuf = fs.readFileSync(BASE + tag + '.dat');
const sheet = Buffer.from(dbuf.subarray(ddsE.off, ddsE.off + ddsE.size));
const hdr = parseDDS(sheet);
console.log('name=' + ddsE.name + '  ' + hdr.width + 'x' + hdr.height + '  fourCC=' + hdr.fourCC + '  bpp=' + hdr.rgbBitCount + '  dataOff=' + hdr.dataOffset + '  size=' + sheet.length);
fs.writeFileSync(WORK + '/_' + tag + n + '.dds', sheet);
try {
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  writePNG(WORK + '/_' + tag + n + '.png', hdr.width, hdr.height, rgba);
  console.log('wrote work/_' + tag + n + '.png');
} catch (e) { console.log('decode fail: ' + e.message); }