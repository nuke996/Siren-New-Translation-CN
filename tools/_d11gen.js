#!/usr/bin/env node
const __P = require('./_config.js');
// D11: common/{rdown,rright}/menu_linehelp_*.dds (34 A8 masks, 1024x32).
// rdown = Western button layout (x=confirm, o=cancel),
// rright = Japanese button layout (o=confirm, x=cancel).
// usage: node _d11gen.js [rdown|rright [onlyIndex]]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const SP = '\u3000';
const O = '○', X = '×', TRI = '△', SQ = '□';

// Final rendered text per key layout is externalised to work/i18n_src/d11.json:
//   { rdown:[[base,text]...], rright:[[base,text]...] }
const SRCD11 = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d11.json', 'utf8'));

function build(dir) {
  return SRCD11[dir].map(([base, text]) => ({
    name: `menu/jp/common/${dir}/menu_linehelp_${base}.dds`,
    size: 18, bold: 1, align: 'left',
    lines: [{ text, y: 0 }],
  }));
}

const dir = process.argv[2];
const items = [];
if (dir) {
  const only = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
  const arr = build(dir);
  if (only !== null) {
    const it = arr[only];
    const SP2 = path.join(WORK, 'mask'); fs.mkdirSync(SP2, { recursive: true });
    const spec = { font: 'SimHei', size: it.size, bold: it.bold, align: it.align, lines: it.lines };
    fs.writeFileSync(path.join(SP2, '_t11.spec.json'), JSON.stringify(spec, null, 1), 'utf8');
    console.log(it.name, '\n ', it.lines[0].text);
    process.exit(0);
  }
  items.push(...arr);
} else {
  items.push(...build('rdown'), ...build('rright'));
}

const job = { arch: 'common', font: 'SimHei', items };
const jobPath = path.join(WORK, '_d11_job.json');
fs.writeFileSync(jobPath, JSON.stringify(job, null, 1), 'utf8');
console.log(`job items=${items.length} -> ${jobPath}`);
execFileSync(process.execPath, [path.join(TOOLS, '_maskimport.js'), jobPath, '--into', path.join(WORK, 'patch_common.json')], { stdio: 'inherit' });