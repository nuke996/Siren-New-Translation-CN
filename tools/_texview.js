#!/usr/bin/env node
const __P = require('./_config.js');
// Snapshot one SNTP entry from a common.dat archive and render it to a visible PNG.
// Handles A8 (alpha-only mask -> dark-on-white) and DXT1 (colour) DDS.
// usage: node _texview.js <name> <out.png> [--hdd]
//   --hdd : read the deployed RPCS3 dev_hdd0 copy instead of the disc
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1, decodeRaw, writePNG } = require('./dds2png.js');

const DISC = `${__P.DISC}/`;
const HDD = `${__P.HDD}/`;
const base = process.argv.includes('--hdd') ? HDD : DISC;
const name = process.argv[2];
const out = process.argv[3] || (`${__P.WORK}/_tex.png`);

const idx = parseHed(fs.readFileSync(base + 'common.hed'));
const dat = fs.readFileSync(base + 'common.dat');
const e = idx.entries.find(x => x.name === name);
if (!e) { console.error('not found: ' + name); process.exit(1); }
const buf = dat.subarray(e.off, e.off + e.size);
fs.writeFileSync(out.replace(/\.png$/, '.dds'), buf);

const hdr = parseDDS(buf);
const cc = hdr.fourCC.replace(/\0/g, '').trim();
let rgba;
if (cc === 'DXT1' || cc === '1TXD') {
  rgba = decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset);
} else {
  rgba = decodeRaw(buf, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 8, hdr);
  if ((hdr.rgbBitCount || 8) === 8) {
    for (let i = 0; i < hdr.width * hdr.height; i++) {
      const g = 255 - rgba[i * 4 + 3];
      rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255;
    }
  }
}
writePNG(out, hdr.width, hdr.height, rgba);
console.log(`${name}  ${hdr.width}x${hdr.height} ${cc || 'A8'} bpp=${hdr.rgbBitCount} size=${e.size} -> ${out}`);