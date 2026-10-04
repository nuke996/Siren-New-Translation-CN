#!/usr/bin/env node
const __P = require('./_config.js');
// Build work/zh_draft_chapter_s09.json for the previously-missed chapter 9.
// Reuses translations by SOURCE TEXT (safe), then reports what still needs work.
// usage: node _s09build.js [--apply]
'use strict';
const fs = require('fs');
const W = `${__P.WORK}/`;

// 1) parse the decoded s09 Japanese
const txt = fs.readFileSync(W + 's09_jp.txt', 'utf8');
const sec = txt.split(/^## /m).find(s => s.startsWith('s090'));
if (!sec) throw new Error('no s090 section');
const recs = [];
{
  const lines = sec.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\[(\d+)\]\s+(.+)$/);
    if (!m) continue;
    const name = m[2].trim();
    // text is the following non-empty content up to the next "[i] " or blank-blank
    let t = '';
    for (let k = i + 1; k < lines.length; k++) { if (/^\[\d+\]/.test(lines[k])) break; t += lines[k]; if (k + 1 < lines.length && /^\[\d+\]/.test(lines[k + 1])) break; }
    recs.push({ name, src: t.replace(/\s+$/, '') });
  }
}
console.log('parsed s090 records: ' + recs.length);

// 2) global src -> text
const srcMap = {}, conflicts = new Set();
for (const f of fs.readdirSync(W)) {
  if (!/^zh_draft_chapter_s\d+\.json$/.test(f)) continue;
  const j = JSON.parse(fs.readFileSync(W + f, 'utf8'));
  for (const l of j.lines || []) {
    const s = l.src, t = l.text;
    if (s === undefined || t === undefined) continue;
    if (!(s in srcMap)) srcMap[s] = t; else if (srcMap[s] !== t) conflicts.add(s);
  }
}
console.log('src->text entries=' + Object.keys(srcMap).length + ' conflicting src=' + conflicts.size);

// 3) manual overrides for strings not reusable (filled after first pass)
const OVER = JSON.parse(fs.existsSync(W + 's09_over.json') ? fs.readFileSync(W + 's09_over.json', 'utf8') : '{}');

const out = [], missing = [];
for (const r of recs) {
  let text = OVER[r.name] !== undefined ? OVER[r.name] : srcMap[r.src];
  if (text === undefined || text === '') { missing.push(r); text = r.src; }
  out.push({ name: r.name, src: r.src, text });
}
console.log('\nreused=' + (recs.length - missing.length) + '  NEED=' + missing.length);
for (const m of missing) console.log('--- ' + m.name + '\n    src: ' + JSON.stringify(m.src));

if (process.argv.includes('--apply')) {
  const head = JSON.parse(fs.readFileSync(W + 'zh_draft_chapter_s01.json', 'utf8'));
  fs.writeFileSync(W + 'zh_draft_chapter_s09.json', JSON.stringify({ ...head, lines: out }, null, 2) + '\n');
  console.log('\nwrote zh_draft_chapter_s09.json (' + out.length + ' lines)');
}