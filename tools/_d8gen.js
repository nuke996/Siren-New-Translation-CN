#!/usr/bin/env node
const __P = require('./_config.js');
// D8: launcher_store product titles (512x32) + descriptions (512x128), A8 masks.
// usage: node _d8gen.js [onlyKey]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
// Text is externalised to work/i18n_src/d8.json so it can be exported/imported.
const SRCD8 = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d8.json', 'utf8'));

// key -> [title, [descL1, subtitle, ...]]
const D = SRCD8.D;

const items = [];
for (const k of Object.keys(D)) {
  const [title, desc] = D[k];
  const g = k === 'full' ? 'pjp_full' : 'pjp_' + k;
  items.push({
    name: `menu/jp/launcher_store/products/${g}/${g}_title.dds`,
    size: 18, bold: 1, align: 'left',
    lines: [{ text: title, y: 0, x: 1 }],
  });
  items.push({
    name: `menu/jp/launcher_store/products/${g}/${g}_text.dds`,
    size: 17, bold: 0, align: 'left',
    lines: desc.map((t, i) => ({ text: t, y: i * 21, x: 1 })),
  });
}

if (process.argv[2] !== undefined) {
  const it = items.find(x => x.name.includes('/pjp_' + process.argv[2] + '/'));
  const SP = path.join(WORK, 'mask'); fs.mkdirSync(SP, { recursive: true });
  fs.writeFileSync(path.join(SP, '_t8a.spec.json'), JSON.stringify({ font: 'SimHei', size: it.size, bold: it.bold, align: it.align, lines: it.lines }, null, 1));
  console.log(it.name); it.lines.forEach(l => console.log(' ', l.y, l.text));
  process.exit(0);
}

const job = { arch: 'common', font: 'SimHei', items };
const jobPath = path.join(WORK, '_d8_job.json');
fs.writeFileSync(jobPath, JSON.stringify(job, null, 1), 'utf8');
console.log(`job items=${items.length} -> ${jobPath}`);
execFileSync(process.execPath, [path.join(TOOLS, '_maskimport.js'), jobPath, '--into', path.join(WORK, 'patch_common.json')], { stdio: 'inherit' });