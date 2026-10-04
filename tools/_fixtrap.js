#!/usr/bin/env node
const __P = require('./_config.js');
// Slot-fit trim for the recurring trap commands: the FONTDATA record only has room
// for 3 glyphs, but "解除陷阱"/"设置陷阱" are 4. Rewrite as raw text (keeps formatting).
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const files = fs.readdirSync(WORK).filter(f => /^zh_draft_chapter_s\d+\.json$/.test(f));
let n = 0;
for (const f of files) {
  const p = path.join(WORK, f);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  s = s.replace(/"text": "解除陷阱"/g, '"text": "拆陷阱"');
  s = s.replace(/"text": "设置陷阱"/g, '"text": "设陷阱"');
  if (s !== before) { fs.writeFileSync(p, s); n++; console.log('patched', f); }
}
console.log('files patched:', n);