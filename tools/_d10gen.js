#!/usr/bin/env node
const __P = require('./_config.js');
// D10: main_option/big_choice/*.dds (32 A8 masks, 256x32, right-aligned option values).
// usage: node _d10gen.js [onlyIndex]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;

// filename -> Chinese value (externalised to work/i18n_src/d10.json)
const T = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d10.json', 'utf8')).T;

let items = Object.keys(T).map(k => ({
  name: `menu/jp/main_option/big_choice/menu_option_${k}.dds`,
  size: 19, bold: 1, align: 'right',
  lines: [{ text: T[k], y: 2 }],
}));

if (process.argv[2] !== undefined) {
  const i = Number(process.argv[2]);
  items = [items[i]];
  const spec = { font: 'SimHei', size: items[0].size, bold: items[0].bold, align: 'right', lines: items[0].lines };
  const SP = path.join(WORK, 'mask'); fs.mkdirSync(SP, { recursive: true });
  fs.writeFileSync(path.join(SP, '_test.spec.json'), JSON.stringify(spec, null, 1));
  console.log(items[0].name, items[0].lines[0].text);
  process.exit(0);
}

const job = { arch: 'common', font: 'SimHei', items };
const jobPath = path.join(WORK, '_d10_job.json');
fs.writeFileSync(jobPath, JSON.stringify(job, null, 1), 'utf8');
console.log(`job items=${items.length} -> ${jobPath}`);
execFileSync(process.execPath, [path.join(TOOLS, '_maskimport.js'), jobPath, '--into', path.join(WORK, 'patch_common.json')], { stdio: 'inherit' });