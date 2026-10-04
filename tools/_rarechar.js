#!/usr/bin/env node
const __P = require('./_config.js');
// For a chapter draft, list how many messages each distinct char appears in
// (ascending), so rare chars can be rewritten to shrink the atlas demand.
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const tag = process.argv[2];
const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_chapter_' + tag + '.json'), 'utf8'));
const clean = s => (s || '').replace(/[\u25c7\u203b]/g, '').replace(/[\s\u3000\u3010\u3011\u3008\u3009]/g, '');
const occ = new Map();
for (const ln of d.lines) {
  const t = clean(ln.text);
  for (const c of new Set(t)) {
    if (!occ.has(c)) occ.set(c, []);
    occ.get(c).push(ln.name);
  }
}
const arr = [...occ.entries()].map(([c, names]) => ({ c, n: names.length, names }));
arr.sort((a, b) => a.n - b.n);
console.log(tag, 'distinct', arr.length);
for (const e of arr) {
  if (e.n > 3) break;
  console.log(`  ${e.c}  x${e.n}  ${e.names.slice(0, 6).join(', ')}`);
}