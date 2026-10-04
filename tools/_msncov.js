#!/usr/bin/env node
const __P = require('./_config.js');
// Coverage of the 247 unique MSN blocks by existing D12/D1 translations.
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/d12/`;
const W = `${__P.WORK}/`;

const items = {};
for (const f of ['trans.json', 'part_smallaim_1.json', 'part_smallaim_2.json', 'part_status.json', 'part_landmark.json']) {
  if (!fs.existsSync(D + f)) continue;
  const j = JSON.parse(fs.readFileSync(D + f, 'utf8'));
  for (const [k, v] of Object.entries(j.items || j)) {
    if (v && typeof v === 'object' && typeof v.text === 'string') items[k] = v.text;
    else if (typeof v === 'string') items[k] = v;
  }
}
const byObj = {}, byMission = {};
for (const [k, t] of Object.entries(items)) {
  let m = k.match(/text_(?:small)?aim\/s(\d\d)_(object\d\d_\d\d)\.dds$/i);
  if (m) { byObj['s' + m[1] + '_' + m[2].toLowerCase()] = t; continue; }
  m = k.match(/text_mission\/s(\d\d)_object_main\.dds$/i);
  if (m) byMission['s' + m[1]] = t;
}
console.log('byObj=' + Object.keys(byObj).length + ' byMission=' + Object.keys(byMission).length);

const blocks = JSON.parse(fs.readFileSync(W + 'msn/_blocks.json', 'utf8'));
let covered = 0, uncovered = 0;
const un = [];
for (const u of blocks) {
  const texts = new Set();
  for (const s of u.sites) {
    let t = null;
    if (/_OBJECT_MAIN$/i.test(s.name)) t = byMission[s.tag];
    else { const m = s.name.match(/^(S\d\d)_(OBJECT\d\d_\d\d)$/i); if (m) t = byObj[m[1].toLowerCase() + '_' + m[2].toLowerCase()]; }
    if (t) texts.add(t);
  }
  if (texts.size === 1) { covered++; u.text = [...texts][0]; }
  else if (texts.size > 1) { covered++; un.push({ k: u.k, note: 'CONFLICT', texts: [...texts], ex: u.sites[0] }); }
  else { uncovered++; un.push({ k: u.k, w: u.w, c: u.c, sites: u.sites.length, ex: u.sites[0].tag + ':' + u.sites[0].name, allnames: [...new Set(u.sites.map(s => s.name.replace(/^S\d\d/, 'SXX')))].join(',') }); }
}
console.log(`blocks=${blocks.length} covered=${covered} uncovered=${uncovered}`);
fs.writeFileSync(W + 'msn/_uncovered.json', JSON.stringify(un, null, 1));
console.log('wrote work/msn/_uncovered.json');
console.log('--- uncovered detail ---');
for (const x of un) console.log(JSON.stringify(x));