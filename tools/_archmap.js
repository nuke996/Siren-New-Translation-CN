#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const WORK = `${__P.WORK}`;
const idx = JSON.parse(fs.readFileSync(WORK + '/archsheets/index.json', 'utf8'));
const layouts = JSON.parse(fs.readFileSync(WORK + '/archlayout.json', 'utf8'));
const lm = {}; for (const p of layouts) lm[p.entry] = p.lines.length;
fs.mkdirSync(WORK + '/archzh', { recursive: true });
const lines = [];
for (const sheet of idx) {
  const bn = sheet.file.replace(/^.*[\\/]/, '');
  const parts = sheet.rows.map(r => `${r.entry.replace(/^.*archives\//, '')}(${lm[r.entry]})`);
  lines.push(`${bn}: ` + parts.join(' '));
}
fs.writeFileSync(WORK + '/archzh/_map.txt', lines.join('\n'));
console.log(lines.join('\n'));