#!/usr/bin/env node
// hex+ascii dump. usage: node _hdump.js <file> [start] [len]
'use strict';
const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
const start = +(process.argv[3] || 0);
const len = +(process.argv[4] || 512);
for (let i = start; i < Math.min(start + len, b.length); i += 16) {
  const h = b.subarray(i, i + 16);
  const hex = [...h].map(c => c.toString(16).padStart(2, '0')).join(' ');
  const asc = [...h].map(c => (c >= 32 && c < 127) ? String.fromCharCode(c) : '.').join('');
  console.log(String(i).padStart(5) + '  ' + hex.padEnd(47) + '  ' + asc);
}