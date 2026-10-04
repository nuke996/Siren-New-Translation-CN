#!/usr/bin/env node
// Analyze the HUD mission atlas (hud/mission/sNN_mission.dds): find the vertical
// bands of non-black rows (one band per baked text line) and cross-check with the
// MSN_DATA record fields. usage: node _msnanalyze.js <dat> <dds>
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');

const [datPath, ddsPath] = process.argv.slice(2);
const dat = fs.readFileSync(datPath);
const count = dat.readUInt32BE(12);
console.log('MSN_DATA count=' + count);
console.log('--- records (12B each) @16 ---');
for (let i = 0; i < count; i++) {
  const o = 16 + i * 12;
  const a = dat.readUInt32BE(o), b = dat.readUInt16BE(o + 4), c = dat.readUInt16BE(o + 6), d = dat.readUInt32BE(o + 8);
  if (i < 25) console.log(`  [${i}] a=${a} b=${b} c=${c} d=${d}  name=${dat.toString('ascii', 820 + i * 16, 820 + i * 16 + 15)}`);
}
console.log('--- names region start ---');
console.log(JSON.stringify(dat.toString('ascii', 820, 820 + 16 * 5)));

const buf = fs.readFileSync(ddsPath);
const hdr = parseDDS(buf);
const rgba = decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset);
// row ink profile
const rows = [];
for (let y = 0; y < hdr.height; y++) {
  let ink = 0;
  for (let x = 0; x < hdr.width; x++) {
    const i = (y * hdr.width + x) * 4;
    const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (l > 40) ink++;
  }
  rows.push(ink);
}
// bands
const bands = [];
let start = -1;
for (let y = 0; y < hdr.height; y++) {
  if (rows[y] > 0 && start < 0) start = y;
  else if (rows[y] === 0 && start >= 0) { bands.push([start, y - 1]); start = -1; }
}
if (start >= 0) bands.push([start, hdr.height - 1]);
console.log(`--- ${bands.length} ink bands (non-black row runs) ---`);
bands.forEach((b, i) => console.log(`  band[${i}] y=${b[0]}..${b[1]} h=${b[1] - b[0] + 1}`));