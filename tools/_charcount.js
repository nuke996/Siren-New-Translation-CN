#!/usr/bin/env node
const __P = require('./_config.js');
// Report distinct Chinese glyph demand per chapter draft vs the 378-cell atlas.
// D = union of distinct chars across all lines' text (minus annotations/spaces handled later).
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const files = fs.readdirSync(WORK).filter(f => /^zh_draft_chapter_s\d+\.json$/.test(f)).sort();
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(WORK, f), 'utf8'));
  const set = new Set();
  let nlines = 0, empty = 0;
  for (const ln of d.lines) {
    let t = (ln.text || '').replace(/[\u25c7\u203b]/g, '');
    t = t.replace(/[\s\u3000\u3010\u3011\u3008\u3009]/g, '');
    if (!t.length) { empty++; continue; }
    nlines++;
    for (const c of t) set.add(c);
  }
  const D = set.size;
  const flag = D > 378 ? '  <<< OVER' : '';
  console.log(`${f.replace('zh_draft_chapter_', '').replace('.json', '')}  lines ${nlines} (empty ${empty})  distinct ${D}/378${flag}`);
}