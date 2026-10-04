#!/usr/bin/env node
const __P = require('./_config.js');
// Build the MSN record -> Chinese text map from existing D12/D1 translation data.
// Sources: work/d12/trans.json, work/d12/part_smallaim_1.json, part_smallaim_2.json
//   text_smallaim/sNN_objectMM_PP.dds  <-> MSN name SNN_OBJECTMM_PP
//   text_aim/sNN_objectMM_00.dds       <-> MSN name SNN_OBJECTMM_00
//   text_mission/sNN_object_main.dds   <-> MSN name SNN_OBJECT_MAIN
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/d12/`;
const W = `${__P.WORK}/`;

const items = {};
for (const f of ['trans.json', 'part_smallaim_1.json', 'part_smallaim_2.json', 'part_status.json', 'part_landmark.json']) {
  if (!fs.existsSync(D + f)) continue;
  const j = JSON.parse(fs.readFileSync(D + f, 'utf8'));
  const src = j.items || j;
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'object' && v && typeof v.text === 'string') items[k] = v.text;
    else if (typeof v === 'string') items[k] = v;
  }
}
console.log('translation keys loaded: ' + Object.keys(items).length);

// index by sNN_objectMM_PP  (lowercase)
const byObj = {};   // "s01_object01_01" -> text
const byMission = {}; // "s01" -> text
for (const [k, t] of Object.entries(items)) {
  let m = k.match(/text_smallaim\/s(\d\d)_(object\d\d_\d\d)\.dds$/i);
  if (m) { byObj['s' + m[1] + '_' + m[2].toLowerCase()] = t; continue; }
  m = k.match(/text_aim\/s(\d\d)_(object\d\d_\d\d)\.dds$/i);
  if (m) { byObj['s' + m[1] + '_' + m[2].toLowerCase()] = t; continue; }
  m = k.match(/text_mission\/s(\d\d)_object_main\.dds$/i);
  if (m) { byMission['s' + m[1]] = t; continue; }
}
console.log('byObj=' + Object.keys(byObj).length + ' byMission=' + Object.keys(byMission).length);

// MSN chapters
const chapters = JSON.parse(fs.readFileSync(W + 'msn/_chapters.json', 'utf8'));
const map = {};   // tag -> { name -> {text, a,b,c} }
let miss = 0, hit = 0;
const missingNames = new Set();
for (const [tag, recs] of Object.entries(chapters)) {
  map[tag] = {};
  for (const r of recs) {
    const nm = r.name;
    let t = null;
    if (/_OBJECT_MAIN$/i.test(nm)) t = byMission[tag];
    else {
      const m = nm.match(/^(S\d\d)_(OBJECT\d\d_\d\d)$/i);
      if (m) t = byObj[m[1].toLowerCase() + '_' + m[2].toLowerCase()];
    }
    if (t) { hit++; map[tag][nm] = { text: t, a: r.a, b: r.b, c: r.c }; }
    else { miss++; missingNames.add(nm.replace(/^S\d\d/, 'SXX')); }
  }
}
console.log(`records hit=${hit} miss=${miss}`);
console.log('missing name patterns: ' + [...missingNames].sort().join(' '));

fs.writeFileSync(W + 'msn/_map.json', JSON.stringify(map, null, 1));
console.log('wrote work/msn/_map.json');