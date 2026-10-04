const __P = require('./_config.js');
// Distinct-char frequency for one archive table's draft lines. usage: node _archfreq.js 06
'use strict';
const fs = require('fs');
const n = process.argv[2];
const d = JSON.parse(fs.readFileSync(`${__P.WORK}/zh_draft_archive.json`, 'utf8'));
const f = new Map();
for (const ln of d.lines) {
  if (!ln.name.startsWith('ARCHIVE_' + n + '_')) continue;
  for (const c of ln.text) f.set(c, (f.get(c) || 0) + 1);
}
const arr = [...f.entries()].sort((a, b) => a[1] - b[1]);
console.log('distinct=' + arr.length);
console.log('occ1: ' + arr.filter(x => x[1] === 1).map(x => x[0]).join(''));
console.log('occ2: ' + arr.filter(x => x[1] === 2).map(x => x[0]).join(''));