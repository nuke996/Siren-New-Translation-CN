#!/usr/bin/env node
const __P = require('./_config.js');
// Append new char->glyph records to fontidexu8.tbl (within its allocated space).
// Record layout: char[4] (UTF-8 bytes REVERSED, zero padded) + u32BE glyphIndex.
'use strict';
const fs = require('fs');
const W = `${__P.WORK}/`;

// cell numbers must match work/font01_zh.glyphspec.json
const pairs = [
  ['载', 7059], ['请', 7060], ['戏', 7061], ['关', 7062], ['闭', 7063], ['电', 7064],
  ['盘', 7065], ['词', 7066], ['编', 7067], ['华', 7068], ['德', 7069], ['\u00b7', 7070],
];

const tbl = fs.readFileSync(W + 'fontidexu8.tbl');
// sanity: existing size must align to 8 and be followed by zero padding
if (tbl.length % 8 !== 0) throw new Error('tbl length not /8');
const add = Buffer.alloc(pairs.length * 8);
pairs.forEach(([ch, g], i) => {
  const u = Buffer.from(ch, 'utf8');
  if (u.length > 4) throw new Error('utf8 too long: ' + ch);
  const rev = Buffer.concat([u, Buffer.alloc(4 - u.length)]).reverse();
  rev.copy(add, i * 8);
  add.writeUInt32BE(g, i * 8 + 4);
});
const out = Buffer.concat([tbl, add]);
fs.writeFileSync(W + 'fontidexu8_new.tbl', out);
console.log('records added: ' + pairs.length);
console.log('tbl ' + tbl.length + ' -> ' + out.length + ' B');
// echo back what a decoder will see
for (const [ch, g] of pairs) console.log('  ' + ch + ' -> glyph ' + g + '  (utf8 ' + Buffer.from(ch, 'utf8').toString('hex') + ')');