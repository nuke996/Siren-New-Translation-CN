#!/usr/bin/env node
const __P = require('./_config.js');
// G2: apply confirmed label corrections at the source (vocab id) so the decode DB
// stops mislabeling these sigs. Idempotent; run with --apply to write.
//   vocab_chars.json keyed by vocab id; vocab.json maps id -> sig.
'use strict';
const fs = require('fs');
const WORK = `${__P.WORK}`;
const APPLY = process.argv.includes('--apply');

// vocab id -> corrected char (evidence: rendered cell bitmaps + authoritative JP wiki)
const VOCAB = {
  '158': '戸',   // was 尸 : 納戸の鍵 / 雨戸を外す ; cell bitmap = 戸
  '159': '斧',   // was 并 : 切り斧(キリヨキ) ; cell bitmap = 斧
  '301': '諦',   // was 詆 : 諦めないでよね
  '397': '素',   // was 寨 : 素晴らしい
  '495': '録',   // was 調 : 焔薙秘録 (archive No.048)
  '561': '焔',   // was 燗 : 焔薙 (神剣)
  '562': '薙'    // was 継 : 焔薙
};

const vPath = WORK + '/vocab.json';
const cPath = WORK + '/vocab_chars.json';
const vocab = JSON.parse(fs.readFileSync(vPath, 'utf8'));
const chars = JSON.parse(fs.readFileSync(cPath, 'utf8'));
const byId = new Map(vocab.map(v => [String(v.id), v.sig]));

let n = 0;
for (const id in VOCAB) {
  const sig = byId.get(id);
  const old = chars[id];
  console.log(`id=${id} sig=${sig ? sig.slice(0, 24) + '…' : '(missing)'}  ${old} -> ${VOCAB[id]}`);
  if (old === VOCAB[id]) { console.log('  already correct'); continue; }
  if (APPLY) { chars[id] = VOCAB[id]; n++; }
}
if (APPLY) { fs.writeFileSync(cPath, JSON.stringify(chars, null, 1) + '\n'); console.log('vocab_chars edits:', n); }
else console.log('(dry run; pass --apply to write)');

// also report any sig in chap_templates carrying these labels (must NOT be overridden blindly)
const tpl = JSON.parse(fs.readFileSync(WORK + '/chap_templates.json', 'utf8'));
const want = new Set(Object.values(VOCAB));
const hits = Object.keys(tpl).filter(k => want.has(tpl[k]));
console.log('chap_templates sigs with these labels:', hits.length, hits.map(s => s.slice(0, 16) + '…:' + tpl[s]).join(' '));
