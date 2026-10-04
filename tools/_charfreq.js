#!/usr/bin/env node
const __P = require('./_config.js');
// Print the distinct characters of a chapter draft ordered by occurrence (desc),
// so rewrites can reuse already-present characters and avoid new ones.
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const tag = process.argv[2];
const top = Number(process.argv[3] || 400);
const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_chapter_' + tag + '.json'), 'utf8'));
const clean = s => (s || '').replace(/[\u25c7\u203b]/g, '').replace(/[\s\u3000\u3010\u3011\u3008\u3009]/g, '');
const occ = new Map();
for (const ln of d.lines) for (const c of new Set(clean(ln.text))) occ.set(c, (occ.get(c) || 0) + 1);
const arr = [...occ.entries()].sort((a, b) => b[1] - a[1]);
console.log(tag + ' distinct ' + arr.length);
console.log('--- chars with occ>=2 (reuse-safe) ---');
console.log(arr.filter(e => e[1] >= 2).map(e => e[0]).join(''));
console.log('--- chars with occ==1 (each removal = -1 demand) ---');
console.log(arr.filter(e => e[1] === 1).map(e => e[0]).join(''));
console.log('count occ1 =', arr.filter(e => e[1] === 1).length);