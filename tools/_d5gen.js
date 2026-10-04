#!/usr/bin/env node
const __P = require('./_config.js');
// Build the D5 job (archive brief / title / category masks) and run _maskimport.
// usage: node _d5gen.js            -> render all + merge into patch_common.json
//        node _d5gen.js 1          -> single item (index 1) test only
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;

// ---- story_brief: 4 lines [name, datetime, place, action] ----
// Text is externalised to work/i18n_src/d5.json so it can be exported/imported.
const SRCD5 = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d5.json', 'utf8'));
const brief = SRCD5.brief;

// ---- story_title (identical to zh_draft_common.json archive_names values, in order) ----
const title = {};
Object.values(JSON.parse(fs.readFileSync(WORK + '/zh_draft_common.json', 'utf8')).archive_names)
  .forEach((v, i) => { title[i + 1] = v; });

// ---- category ----
const cat = SRCD5.category;

const items = [];
const only = process.argv[2] ? Number(process.argv[2]) : 0;
const p2 = n => String(n).padStart(2, '0');

for (const n of Object.keys(brief).map(Number)) {
  if (only && n !== only) continue;
  const lines = brief[n];
  items.push({
    name: `menu/jp/main_archive/story_brief/archive_${p2(n)}_chr.dds`,
    size: 22, bold: 1, align: 'left',
    lines: lines.map((t, i) => ({ text: t, y: [1, 33, 64, 96][i], x: 0 })),
  });
}
for (const n of Object.keys(title).map(Number)) {
  if (only && n !== only) continue;
  items.push({
    name: `menu/jp/main_archive/story_title/archive_${p2(n)}_name.dds`,
    size: 22, bold: 1, align: 'left',
    lines: [{ text: title[n], y: 1, x: 0 }],
  });
}
for (const k of Object.keys(cat)) {
  if (only) continue;
  items.push({
    name: `menu/jp/main_archive/category/menu_archive_group_${k}.dds`,
    size: 22, bold: 1, align: 'left',
    lines: [{ text: cat[k], y: 1, x: 0 }],
  });
}

const job = { arch: 'common', font: 'SimHei', items };
const jobPath = path.join(WORK, '_d5_job.json');
fs.writeFileSync(jobPath, JSON.stringify(job, null, 1), 'utf8');
console.log(`job items=${items.length} -> ${jobPath}`);
execFileSync(process.execPath, [path.join(TOOLS, '_maskimport.js'), jobPath, '--into', path.join(WORK, 'patch_common.json')], { stdio: 'inherit' });