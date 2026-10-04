#!/usr/bin/env node
const __P = require('./_config.js');
// List every draft line that still carries an undecoded marker.
//   src has ◇  -> the decoder could not read the source glyph (blocks translating)
//   text has ◇/※ -> the translation itself still holds a placeholder
// usage: node _unklist.js [--json]
'use strict';
const fs = require('fs');
const W = `${__P.WORK}/`;
const out = [];
function push(file, kind, name, src, text) {
  if (!/[\u25c7]/.test(src || '') && !/[\u25c7\u203b]/.test(text || '')) return;
  out.push({ file, kind, name, src, text, srcUnk: /[\u25c7]/.test(src || ''), txtUnk: /[\u25c7\u203b]/.test(text || '') });
}
for (const f of fs.readdirSync(W)) {
  const p = W + f;
  if (/^zh_draft_(ep\d+|chapter_s\d+|archive)\.json$/.test(f)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const l of j.lines || []) push(f, 'flat', l.name, l.src, l.text);
  }
}
{ // sxx1 nested
  const j = JSON.parse(fs.readFileSync(W + 'zh_draft_sxx1.json', 'utf8'));
  const walk = (o, tag) => { for (const [k, v] of Object.entries(o || {})) {
    if (Array.isArray(v)) { const srcTxt = JSON.stringify(v); push('zh_draft_sxx1.json', 'sxx1', tag + '/' + k, srcTxt, srcTxt); }
    else if (typeof v === 'object') walk(v, tag + '/' + k);
  } };
  walk(j.shared, 'shared');
  for (const k of Object.keys(j)) if (k !== 'shared' && k !== '_note') walk(j[k], k);
}
console.log('total marker lines: ' + out.length);
const byFile = {};
for (const o of out) byFile[o.file] = (byFile[o.file] || 0) + 1;
console.log('by file:');
Object.entries(byFile).sort().forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + k));
console.log('\nsrc-unknown (decoder gap) lines: ' + out.filter(o => o.srcUnk).length);
console.log('text placeholder (◇/※) lines: ' + out.filter(o => o.txtUnk).length);
if (process.argv.includes('--json')) fs.writeFileSync(W + '_unklist.json', JSON.stringify(out, null, 1));
console.log('\n--- detail ---');
for (const o of out) console.log(`[${o.file}] ${o.name}\n    src : ${o.src}\n    text: ${o.text}`);