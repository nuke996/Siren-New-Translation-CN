#!/usr/bin/env node
const __P = require('./_config.js');
// G3: rewrite archive-name references inside zh_draft_* drafts so they use the
// authoritative Chinese names from zh_draft_common.json -> archive_names.
//
// Strategy: for every draft entry, parse the innermost 【..】 groups of `src`
// (decoded Japanese) and of `text` (Chinese). When a src group equals an
// archive_names key, overwrite the text group at the same index with the
// authoritative Chinese value (trailing ※ stripped).
//
// usage: node _g3nameref.js            # dry run, print diffs
//        node _g3nameref.js --apply    # write files
'use strict';
const fs = require('fs');
const path = require('path');

const WORK = `${__P.WORK}`;
const apply = process.argv.includes('--apply');

function inners(s) {
  const out = [];
  let i = 0;
  while (true) {
    const b = s.indexOf('\u3011', i);            // 】
    if (b < 0) break;
    const a = s.lastIndexOf('\u3010', b - 1);    // 【
    if (a >= 0) out.push({ a, b, inner: s.slice(a + 1, b) });
    i = b + 1;
  }
  return out;
}

const common = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_common.json'), 'utf8'));
const names = common.archive_names;               // jp -> zh

const files = fs.readdirSync(WORK).filter(f => /^zh_draft_(chapter_s\d+|ep\d+)\.json$/.test(f));
let totalEntries = 0, totalFixed = 0, ambiguous = 0;
const touched = [];

for (const f of files) {
  const p = path.join(WORK, f);
  const txt = fs.readFileSync(p, 'utf8');
  const json = JSON.parse(txt);
  let changed = 0;
  for (const e of json.lines || []) {
    if (typeof e.src !== 'string' || typeof e.text !== 'string') continue;
    totalEntries++;
    const sg = inners(e.src);
    const tg = inners(e.text);
    const todo = [];
    sg.forEach((g, i) => {
      const zh = names[g.inner];
      if (!zh) return;
      if (!tg[i]) { ambiguous++; console.log('  [AMBIG] ' + f + ' ' + e.name + ' no text group #' + i + ' for "' + g.inner + '"'); return; }
      const want = zh;
      if (tg[i].inner !== want) todo.push({ g: tg[i], want, from: tg[i].inner, jp: g.inner });
    });
    if (!todo.length) continue;
    // apply right-to-left so indices stay valid
    todo.sort((x, y) => y.g.a - x.g.a);
    let s = e.text;
    for (const t of todo) {
      s = s.slice(0, t.g.a + 1) + t.want + s.slice(t.g.b);
      touched.push({ f, name: e.name, from: t.from, to: t.want, jp: t.jp });
      changed++;
    }
    e.text = s;
  }
  if (changed) {
    totalFixed += changed;
    if (apply) fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }
}

console.log('\nentries scanned: ' + totalEntries + '  names known: ' + Object.keys(names).length);
console.log('reference fixes: ' + totalFixed + '  ambiguous(skipped): ' + ambiguous + '  mode: ' + (apply ? 'APPLY' : 'dry'));
for (const t of touched) console.log('  ' + t.f + '  ' + t.name + '  [' + t.jp + ']  "' + t.from + '" -> "' + t.to + '"');
