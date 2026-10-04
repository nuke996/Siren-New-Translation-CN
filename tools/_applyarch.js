#!/usr/bin/env node
const __P = require('./_config.js');
// Apply the 84 identified archive-subtitle glyph sigs -> chars into chap_templates.json.
// usage: node _applyarch.js
'use strict';
const fs = require('fs');
const path = require('path');
const WK = `${__P.WORK}`;
const all = JSON.parse(fs.readFileSync(path.join(WK, 'import/_unk_all.json'), 'utf8'));
const list = all.filter(r => r.stem.startsWith('hud_launcher_jimaku'));
const CH = [
  '視', '暇', '昔', '<', '>', '送', '興', '奮', '低', '俗',
  '撮', '指', '曜', '深', '夜', '．', '留', '好', 'ヶ', '親',
  '操', '挙', '句', '爪', '噛', '寿', '晩', '例', '繕', '算',
  '博', '士', '港', '初', '及', '争', '宙', '訓', '練', '面',
  '蝶', '嵐', '可', '能', '怒', '募', '専', '論', '情', '詳',
  '謎', '胸', '想', '顔', '冒', '欲', 'D', '預', '乙', '磁',
  '暴', '角', '域', 'S', '摩', '訶', '議', '象', '透', 'h',
  '混', '融', '昨', '普', '崖', '皮', '肉', '蜂', '蟻', '巣',
  '描', '致', '有', '呆',
];
if (list.length !== CH.length) { console.error('MISMATCH list=' + list.length + ' CH=' + CH.length); process.exit(1); }
const tplPath = path.join(WK, 'chap_templates.json');
const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
let added = 0, same = 0, conflict = 0;
list.forEach((r, k) => {
  const ch = CH[k], cur = tpl[r.sig];
  if (cur === ch) { same++; return; }
  if (cur !== undefined) { console.log('CONFLICT k=' + k + ' cell=' + r.cell + ' existing="' + cur + '" new="' + ch + '"'); conflict++; return; }
  tpl[r.sig] = ch; added++;
});
fs.writeFileSync(tplPath, JSON.stringify(tpl) + '\n');
console.log('total sigs:', Object.keys(tpl).length, ' added', added, ' same', same, ' conflicts', conflict);