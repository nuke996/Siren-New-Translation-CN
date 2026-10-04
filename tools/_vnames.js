#!/usr/bin/env node
'use strict';
const fs = require('fs');
const f = process.argv[2];
const buf = fs.readFileSync(f);
const count = buf.readUInt32BE(12);
const names = [];
for (let i = 0; i < count; i++) {
  const p = 16 + i * 8, no = buf.readUInt32BE(p) + 16;
  let e = no; while (e < buf.length && buf[e] !== 0) e++;
  names.push(buf.toString('utf8', no, e));
}
console.log('count', count);
console.log('first', names.slice(0, 3).join(' | '));
console.log('last', names.slice(-3).join(' | '));
const bad = names.filter(n => /[\uFFFD]/.test(n) || n.length === 0 || !/^[\x20-\x7e]+$/.test(n));
console.log('badNames', bad.length, bad.slice(0, 5).join(', '));