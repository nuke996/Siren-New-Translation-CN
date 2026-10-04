#!/usr/bin/env node
const __P = require('./_config.js');
// Check which simplified/traditional variants exist in fontidexu8.tbl, and how many
// free record slots exist. usage: node _tblcov.js
'use strict';
const fs = require('fs');
const W = `${__P.WORK}/`;
const tb = fs.readFileSync(W + 'fontidexu8.tbl');
const byChar = {};
for (let o = 2000; o + 8 <= tb.length; o += 8) {
  const raw = Buffer.from([tb[o], tb[o + 1], tb[o + 2], tb[o + 3]]).reverse();
  const s = raw.toString('utf8');
  if (s.includes('\uFFFD')) continue;
  const t = s.replace(/\0+$/g, '');
  if (!t) continue;
  if (byChar[t] === undefined) byChar[t] = tb.readUInt32BE(o + 4);
}
const groups = [
  ['载', '載'], ['请', '請'], ['戏', '戲'], ['关', '關'], ['闭', '閉'], ['电', '電'], ['盘', '盤'],
  ['档', '檔'], ['载', '載'], ['志', '誌'], ['册', '冊'], ['络', '絡'],
  ['汉', '漢'], ['简', '簡'], ['译', '譯'], ['为', '為'], ['这', '這'], ['个', '個'],
  ['们', '們'], ['说', '說'], ['时', '時'], ['间', '間'], ['无', '無'], ['线', '線'],
  ['数', '數'], ['据', '據'], ['删', '刪'], ['除', '除'], ['写', '寫'],
];
console.log('char  simpGlyph  tradGlyph');
for (const [s, t] of groups) {
  const gs = byChar[s], gt = byChar[t];
  console.log(s + '     ' + (gs === undefined ? '--' : gs) + '        ' + t + ' ' + (gt === undefined ? '--' : gt));
}
console.log('unique chars in tbl:', Object.keys(byChar).length);