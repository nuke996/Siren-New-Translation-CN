#!/usr/bin/env node
const __P = require('./_config.js');
// Validate the hand-transcribed vocabulary against the game font table.
// Any transcribed char that is NOT present in fontidexu8.tbl is certainly wrong.
// usage: node vocabvalidate.js
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;

const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
const chars = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));
const fm = JSON.parse(fs.readFileSync(path.join(WORK, 'fontmap.json'), 'utf8'));
const byChar = fm.byChar;

let missingTbl = [], missingAns = [], dup = {};
const seen = {};
for (const v of vocab) {
  const ch = chars[String(v.id)];
  if (!ch) { missingAns.push(v.id); continue; }
  if (byChar[ch] === undefined) missingTbl.push([v.id, ch]);
  if (seen[ch] !== undefined) { (dup[ch] = dup[ch] || [seen[ch]]).push(v.id); }
  else seen[ch] = v.id;
}
console.log('vocab entries:', vocab.length, 'answered:', vocab.length - missingAns.length);
console.log('NOT IN FONT TABLE (certainly wrong):', missingTbl.length);
console.log(' ', JSON.stringify(missingTbl));
console.log('duplicate chars (same char, multiple sigs):', Object.keys(dup).length);
console.log(' ', JSON.stringify(dup));