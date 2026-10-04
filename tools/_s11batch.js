#!/usr/bin/env node
// Batch driver: for each tag run _s11gen.js (build atlas) then _s11write.js (rewrite dat).
// Prints one concise line per tag/tool. usage: node _s11batch.js s07 s08 ...
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const tags = process.argv.slice(2);
let ok = 0, bad = 0;
for (const t of tags) {
  for (const tool of ['_s11gen.js', '_s11write.js']) {
    try {
      const out = execFileSync('node', [path.join(__dirname, tool), t], { encoding: 'utf8' });
      const hit = out.split(/\r?\n/).find(l => /distinct chars|wrote import/.test(l)) || '';
      console.log(`OK   ${t} ${tool.padEnd(14)} ${hit.trim()}`);
      if (tool === '_s11write.js') ok++;
    } catch (e) {
      bad++;
      const msg = (String(e.stdout || '') + String(e.stderr || '')).split(/\r?\n/).filter(l => /Error|throw|no draft|!==|too big|no cell/.test(l)).slice(0, 3).join(' | ');
      console.log(`FAIL ${t} ${tool.padEnd(14)} ${msg || e.message}`);
    }
  }
}
console.log(`\nbatch done: ok ${ok}, failed ${bad}`);