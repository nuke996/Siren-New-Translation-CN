#!/usr/bin/env node
const __P = require('./_config.js');
// Build the D6 job: etc_timecount place_jp / place_other / name masks.
// usage: node _d6gen.js [onlyIndex]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const SP = '\u3000'; // ideographic space between the two place parts

// Text is externalised to work/i18n_src/d6.json so it can be exported/imported.
const SRCD6 = JSON.parse(fs.readFileSync(WORK + '/i18n_src/d6.json', 'utf8'));
const place = SRCD6.place;

// name masks: [line1, keepRomaji]
const names = SRCD6.names;

const items = [];
const p2 = n => String(n).padStart(2, '0');
for (const n of Object.keys(place).map(Number)) {
  for (const dir of ['place_jp', 'place_other']) {
    items.push({
      name: `menu/jp/etc_timecount/${dir}/menu_timecount_s${p2(n)}_spot${dir === 'place_jp' ? 1 : 2}.dds`,
      size: 22, bold: 1, align: 'right',
      lines: [{ text: place[n], y: 1 }],
    });
  }
}
for (const [base, text, keepRomaji] of names) {
  const one = !keepRomaji;
  const it = {
    name: `menu/jp/etc_timecount/name/${base}.dds`,
    size: 62, bold: 1, align: 'left',
    lines: [{ text, y: one ? 8 : 6, x: 2 }],
  };
  if (keepRomaji) { it.keep = true; it.clear = [{ x: 0, y: 0, w: 420, h: 78 }]; }
  items.push(it);
}

const job = { arch: 'common', font: 'SimHei', items };
const jobPath = path.join(WORK, '_d6_job.json');
fs.writeFileSync(jobPath, JSON.stringify(job, null, 1), 'utf8');
console.log(`job items=${items.length} -> ${jobPath}`);
execFileSync(process.execPath, [path.join(TOOLS, '_maskimport.js'), jobPath, '--into', path.join(WORK, 'patch_common.json')], { stdio: 'inherit' });