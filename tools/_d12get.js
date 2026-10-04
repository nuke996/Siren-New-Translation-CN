const __P = require('./_config.js');
// Extract D12 (menu/jp/main_status|main_map) entries matching a regex into work/d12/ext/.
// usage: node _d12get.js <regex>   (writes files + prints one path per line)
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');

const BASE = `${__P.DISC}/`;
const OUT = `${__P.WORK}/d12/ext/`;
fs.mkdirSync(OUT, { recursive: true });
const re = new RegExp(process.argv[2]);
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const dat = fs.readFileSync(BASE + 'common.dat');
const files = [];
for (const e of idx.entries) {
  if (!re.test(e.name)) continue;
  const flat = e.name.replace(/[^A-Za-z0-9_.]+/g, '_') + '.dds';
  const p = path.join(OUT, flat);
  fs.writeFileSync(p, dat.subarray(e.off, e.off + e.size));
  files.push(p);
}
fs.writeFileSync(OUT + '_last_list.txt', files.join('\n'));
console.log(files.join('\n'));
console.error('extracted ' + files.length);
