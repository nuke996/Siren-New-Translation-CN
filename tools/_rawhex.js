// raw hex dump of a file range (u16 words). usage: node _rawhex.js <file> <off> <len>
'use strict';
const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
const off = parseInt(process.argv[3]);
const len = parseInt(process.argv[4]);
for (let p = off; p < off + len && p + 1 < b.length; p += 16) {
  const words = [];
  for (let k = 0; k < 16; k += 2) words.push(p + k + 1 < b.length ? b.readUInt16BE(p + k).toString(16).padStart(4, '0') : '');
  console.log('@' + p + '  ' + words.join(' '));
}