#!/usr/bin/env node
const __P = require('./_config.js');
// For each duplicate-char group, measure how much the member cells differ (in DXT1 blocks).
// Small diffs => same glyph, different rendering/offset (both reads fine).
// Large diffs => genuinely different glyphs (one read is wrong).
// usage: node dupdiff.js
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;
const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
const chars = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));
const byId = {}; for (const v of vocab) byId[v.id] = v;
const groups = {};
for (const v of vocab) { const ch = chars[String(v.id)]; if (ch) (groups[ch] = groups[ch] || []).push(v.id); }
for (const ch of Object.keys(groups)) {
  const g = groups[ch]; if (g.length < 2) continue;
  const out = [];
  for (let i = 1; i < g.length; i++) {
    const a = byId[g[i - 1]].sig, b = byId[g[i]].sig;
    let diff = 0;
    for (let k = 0; k < a.length; k += 16) if (a.slice(k, k + 16) !== b.slice(k, k + 16)) diff++;
    out.push(g[i - 1] + '~' + g[i] + ':' + diff + '/42blk');
  }
  console.log(ch.padEnd(2), JSON.stringify(g), out.join(' '));
}