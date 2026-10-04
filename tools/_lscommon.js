#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const idx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const want = process.argv[2] || 'hud/movie';
const hits = idx.entries.filter(e => e.name.includes(want));
console.log('total entries:', idx.entries.length, ' matched:', hits.length);
for (const e of hits) console.log('  ' + e.name.padEnd(40) + 'off=' + String(e.off).padStart(11) + ' size=' + e.size);