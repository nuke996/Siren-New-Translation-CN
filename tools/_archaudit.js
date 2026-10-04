const __P = require('./_config.js');
'use strict';
// Audit archive pages: title-vs-content overview + duplicate/boundary anomalies.
const fs = require('fs');
const W = `${__P.WORK}/`;
const layouts = JSON.parse(fs.readFileSync(W + 'archlayout.json', 'utf8'));
const zh = JSON.parse(fs.readFileSync(W + 'archive_zh.json', 'utf8'));
const common = JSON.parse(fs.readFileSync(W + 'zh_draft_common.json', 'utf8'));
const titles = Object.values(common.archive_names);   // index 0 = archive 1

const byArch = new Map();
for (const p of layouts) {
  const m = /archives\/(\d+)\//.exec(p.entry);
  if (!m) continue;
  const nn = Number(m[1]);
  if (!byArch.has(nn)) byArch.set(nn, []);
  byArch.get(nn).push(p);
}
const nums = [...byArch.keys()].sort((a, b) => a - b);
const cut = s => { s = String(s || '').replace(/\s+/g, ''); return s.length > 26 ? s.slice(0, 26) + '…' : s; };

// duplicate jp lines across pages
const seen = new Map();
for (const nn of nums) for (const p of byArch.get(nn)) {
  const L = zh[p.entry]; if (!L) continue;
  for (const ln of L) { const k = ln.jp.trim(); if (k.length < 6) continue; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(`a${nn}`); }
}
const dups = [...seen.entries()].filter(([k, v]) => new Set(v).size > 1);

console.log('=== duplicate jp lines across pages ===');
for (const [k, v] of dups) console.log(`  [${[...new Set(v)].join(',')}] ${k}`);
if (!dups.length) console.log('  (none)');

// consecutive-page boundary overlap
console.log('\n=== consecutive page boundary (last line of N == first line of N+1) ===');
const flat = [];
for (const nn of nums) for (const p of byArch.get(nn)) flat.push({ nn, entry: p.entry, key: `a${nn}_${p.entry.replace(/^.*\//, '')}` });
let bound = 0;
for (let i = 0; i + 1 < flat.length; i++) {
  const A = zh[flat[i].entry], B = zh[flat[i + 1].entry];
  if (!A || !B) continue;
  const aLast = A[A.length - 1].jp.trim(), bFirst = B[0].jp.trim();
  if (aLast === bFirst) { console.log(`  ${flat[i].key}  ->  ${flat[i + 1].key}  : "${aLast}"`); bound++; }
}
if (!bound) console.log('  (none)');

console.log('\n=== archive overview (NN | title | pages | first zh | last zh) ===');
for (const nn of nums) {
  const pages = byArch.get(nn);
  let first = '', last = '', nl = 0;
  for (const p of pages) { const L = zh[p.entry]; if (L) { if (!first) first = L[0].zh; last = L[L.length - 1].zh; nl += L.length; } }
  console.log(`${String(nn).padStart(2)} | ${(titles[nn - 1] || '??').padEnd(14)} | p${pages.length} L${String(nl).padStart(3)} | ${cut(first)} … ${cut(last)}`);
}
