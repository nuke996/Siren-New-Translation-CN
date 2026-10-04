const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/`;
const b = fs.readFileSync(D + 'label.dds');
console.log('file len', b.length);
for (let i = 0; i < 32; i++) {
  const o = i * 4;
  console.log(String(o).padStart(4), '0x' + b.readUInt32LE(o).toString(16).padStart(8, '0'), b.readUInt32LE(o));
}
console.log('magic', b.toString('ascii', 0, 4));
// PNG dims
const p = fs.readFileSync(D + 'label.png');
console.log('PNG W=' + p.readUInt32BE(16) + ' H=' + p.readUInt32BE(20));
const p2 = fs.readFileSync(D + 'label.gray.png');
console.log('gray PNG W=' + p2.readUInt32BE(16) + ' H=' + p2.readUInt32BE(20));
// FONTDATA big-endian
const dat = fs.readFileSync(D + 'label.dat');
console.log('\nDAT magic=' + dat.toString('ascii', 0, 8) + ' ver=' + dat.readUInt32BE(8) + ' count=' + dat.readUInt32BE(12));