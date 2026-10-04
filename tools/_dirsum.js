// Summarize an sntp "list" dump by directory prefix: count + total bytes.
// usage: node _dirsum.js <listfile> [depth]
'use strict';
const fs = require('fs');
const file = process.argv[2];
const depth = parseInt(process.argv[3] || '2', 10);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const agg = new Map();
for (const ln of lines) {
  const m = ln.match(/^\d+\t(\d+)\t(.+)$/);
  if (!m) continue;
  const size = parseInt(m[1], 10);
  const parts = m[2].split('/');
  const key = parts.slice(0, depth).join('/') + (parts.length > depth ? '/' : '');
  const a = agg.get(key) || { n: 0, b: 0 };
  a.n++; a.b += size; agg.set(key, a);
}
const rows = [...agg.entries()].sort((x, y) => y[1].b - x[1].b);
for (const [k, v] of rows) console.log(`${String(v.n).padStart(5)}  ${(v.b / 1048576).toFixed(1).padStart(9)} MB  ${k}`);