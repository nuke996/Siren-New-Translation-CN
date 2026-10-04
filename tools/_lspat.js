#!/usr/bin/env node
const __P = require('./_config.js');
// List archive entries whose name matches a regex, with sizes.
// usage: node _lspat.js <archPrefix> <regex> [limit]
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const [prefix, re, lim] = process.argv.slice(2);
const rx = new RegExp(re);
const idx = parseHed(fs.readFileSync(BASE + prefix + '.hed'));
const hits = idx.entries.filter(e => rx.test(e.name));
const max = lim ? Number(lim) : 200;
for (const e of hits.slice(0, max)) console.log(String(e.size).padStart(9), e.name);
console.log(`# ${hits.length} entries (shown ${Math.min(max, hits.length)})`);