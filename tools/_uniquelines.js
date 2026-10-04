#!/usr/bin/env node
const __P = require('./_config.js');
// List the draft lines that contain at least one char appearing in no other line,
// i.e. the lines whose rewording would actually reduce the atlas demand.
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const tag = process.argv[2];
const maxShow = Number(process.argv[3] || 999);
const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_chapter_' + tag + '.json'), 'utf8'));
const clean = s => (s || '').replace(/[\u25c7\u203b]/g, '').replace(/[\s\u3000\u3010\u3011\u3008\u3009]/g, '');
const occ = new Map();
for (const ln of d.lines) for (const c of new Set(clean(ln.text))) occ.set(c, (occ.get(c) || 0) + 1);
let shown = 0, uniq = 0;
for (const ln of d.lines) {
  const t = clean(ln.text);
  const u = [...new Set(t)].filter(c => occ.get(c) === 1);
  uniq += u.length;
  if (!u.length) continue;
  if (shown++ >= maxShow) continue;
  console.log(`${ln.name}  [+${u.length}] ${t}`);
  console.log(`    uniq: ${u.join(' ')}`);
}
console.log(`\ntotal unique-char occurrences across lines: ${uniq}`);