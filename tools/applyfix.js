#!/usr/bin/env node
const __P = require('./_config.js');
// Apply sig-level label corrections to the decode DB.
//   vocab_chars.json : keyed by vocab id
//   chap_templates.json : keyed by sig (fix by current value)
'use strict';
const fs = require('fs');
const WORK = `${__P.WORK}`;

// vocab id -> corrected char (evidence: sigsites contexts + labelprobe bitmaps)
const VOCAB = {
  '2': 'ハ', '45': 'オ', '120': '信', '136': '帳', '169': '連', '175': '贄',
  '188': '記', '203': '与', '208': '弾', '229': '英', '230': '蛇', '264': '祭',
  '307': '絡', '326': '噂', '334': '日', '340': '続', '347': '飢', '374': 'エ',
  '386': 'エ', '398': '晴', '472': '携', '475': '祈', '516': 'ぼ'
};
// tpl current value -> corrected char
const TPL = { '工': 'エ' };

const vcPath = WORK + '/vocab_chars.json';
const vc = JSON.parse(fs.readFileSync(vcPath, 'utf8'));
let vn = 0;
for (const id in VOCAB) {
  const old = vc[id];
  if (vc[id] === undefined) { console.log('  vocab miss id=' + id); continue; }
  if (vc[id] === VOCAB[id]) { console.log('  vocab id=' + id + ' already ' + VOCAB[id]); continue; }
  console.log('  vocab id=' + id + ': ' + old + ' -> ' + VOCAB[id]);
  vc[id] = VOCAB[id]; vn++;
}
fs.writeFileSync(vcPath, JSON.stringify(vc, null, 1) + '\n');
console.log('vocab_chars edits:', vn);

const tplPath = WORK + '/chap_templates.json';
const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
let tn = 0;
for (const k in tpl) {
  if (TPL[tpl[k]] !== undefined) { console.log('  tpl sig=' + k.slice(0, 16) + '...: ' + tpl[k] + ' -> ' + TPL[tpl[k]]); tpl[k] = TPL[tpl[k]]; tn++; }
}
fs.writeFileSync(tplPath, JSON.stringify(tpl));
console.log('chap_templates edits:', tn);