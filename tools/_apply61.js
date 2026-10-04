#!/usr/bin/env node
const __P = require('./_config.js');
// Apply the 61 identified unknown glyph sigs -> chars into chap_templates.json.
// usage: node _apply61.js
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const DIR = WORK + '/import';

const list = JSON.parse(fs.readFileSync(path.join(DIR, '_idlist.json'), 'utf8'));
// index -> char, in the order of _idsheet.png / _idlist.json
const CH = [
  '認', '疑', '申', '希', '飽', '狂', '訴', '験', '掘', '難',
  '遭', '遇', '瞬', '揺', '静', '境', '刺', '泣', '眼', '鏡',
  '婚', '妻', '耐', '喧', '嘩', '歩', '災', '根', '谷', '刈',
  '互', '延', '劫', '司', '定', '乾', '燥', '誘', '拐', '慌',
  '花', '和', '買', '触', '料', '買', '換', '八', '罪', '眠',
  '決', 'ゆ', '活', '充', '祝', '福', '園', '逆', '穴', '完',
  '埋',
];

const tplPath = path.join(WORK, 'chap_templates.json');
const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));

if (list.length !== CH.length) {
  console.error('MISMATCH: _idlist has', list.length, 'entries but CH has', CH.length);
  process.exit(1);
}

let added = 0, conflict = 0, same = 0;
list.forEach((r, i) => {
  const ch = CH[i];
  const cur = tpl[r.sig];
  if (cur === ch) { same++; return; }
  if (cur !== undefined) { console.log('CONFLICT i=' + i + ' cell=' + r.cell + ' existing="' + cur + '" new="' + ch + '"'); conflict++; return; }
  tpl[r.sig] = ch; added++;
});

fs.writeFileSync(tplPath, JSON.stringify(tpl) + '\n');
console.log('total sigs in chap_templates:', Object.keys(tpl).length);
console.log('added', added, 'same', same, 'conflicts', conflict);