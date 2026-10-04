const __P = require('./_config.js');
// Render contact sheets for a set of common.dat entries matching a regex.
// usage: node _d12sheet.js <regex> <outPrefix> [perSheet=20] [scale=3]
// Prints (stdout) one "SHEET k : <png>" header then the entry names in order,
// one per line, so row i of sheet k maps to the i-th name after its header.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');

const BASE = `${__P.DISC}/`;
const OUT = `${__P.WORK}/d12/ext/`;
fs.mkdirSync(OUT, { recursive: true });
const re = new RegExp(process.argv[2]);
let prefix = process.argv[3];
const per = parseInt(process.argv[4] || '20', 10);
const scale = process.argv[5] || '3';

const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const rows = [];
for (const e of idx.entries) {
  if (!re.test(e.name)) continue;
  const flat = e.name.replace(/[^A-Za-z0-9_.]+/g, '_') + '.dds';
  const p = path.join(OUT, flat);
  fs.writeFileSync(p, dat.subarray(e.off, e.off + e.size));
  rows.push({ name: e.name, file: p });
}
let k = 0;
for (let i = 0; i < rows.length; i += per) {
  k++;
  const chunk = rows.slice(i, i + per);
  const png = `${prefix}_${k}.png`;
  execFileSync(process.execPath, [path.join(__dirname, '_dssheet.js'), '--scale=' + scale, png, ...chunk.map(r => r.file)], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`SHEET ${k} : ${png}`);
  for (const r of chunk) console.log(r.name);
}
console.error(`total ${rows.length} entries, ${k} sheets`);
