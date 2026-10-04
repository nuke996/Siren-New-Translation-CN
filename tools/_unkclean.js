#!/usr/bin/env node
const __P = require('./_config.js');
// Draft hygiene: drop the ◇ (undecoded line-break marker) and ※ (uncertainty note)
// annotations from every Chinese draft TEXT, then tidy the punctuation they leave
// behind.  importsheet already strips these at build time, so this changes no
// in-game output - it just makes the drafts clean and re-importable.
//
// usage: node _unkclean.js [--apply]
'use strict';
const fs = require('fs');
const W = `${__P.WORK}/`;

function tidy(s) {
  let t = s.replace(/[\u25c7\u203b]/g, '');        // ◇ ※
  t = t.replace(/。。+/g, '。').replace(/，，+/g, '，').replace(/、、+/g, '、');
  t = t.replace(/，+/g, '，').replace(/。+/g, '。');
  t = t.replace(/^[，、]+/, '');                     // leading junk punctuation
  t = t.replace(/ +/g, ' ').replace(/ +$/, '').replace(/^ +/, '');
  return t;
}
const markers = /[\u25c7\u203b]/;
const report = [];
const apply = process.argv.includes('--apply');

// Lines where the ◇ stands for a REAL missing character (not a line-break marker):
// fixed by reading the (clean) source.  key = "<file>|<recordName>".
const OVERRIDES = {
  'zh_draft_ep05.json|EP05_CP3_10': '「不入谷圣堂」吗？「你知道？」',
  'zh_draft_ep05.json|EP05_CP3_11': '啊，很像刈割的那座圣堂。',
  'zh_draft_ep05.json|EP05_CP3_19': '果然还是腻了……',
  'zh_draft_ep08.json|EP08_CP1_10': '「混蛋！是被那恶心的和食弄得连脑子都坏了吗？」',
  'zh_draft_ep08.json|EP08_CP3_01': '「我也不知道这会是这样一个疯掉的村子！」',
  'zh_draft_ep09.json|EP09_CP3_03': '「终于该换新了吗？」',
  'zh_draft_ep09.json|EP09_CP5_01': '「这是我的血杯，成为罪之宽恕的永恒契约之血。」',
  'zh_draft_ep11.json|EP11_CP1_08': '「你疯了吧！」',
  'zh_draft_ep11.json|EP11_CP3_04': '「满含邪恶之人啊，一切祝福皆归您所有。」',
  'zh_draft_chapter_s13.json|CHA_EVENT1_CAM_0': '「快点啊山姆……不过看起来不太靠得住就是了……」',
};

let files = 0, changed = 0;
for (const f of fs.readdirSync(W)) {
  if (!/^zh_draft_(ep\d+|chapter_s\d+|archive|label)\.json$/.test(f)) continue;
  const p = W + f;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(j.lines)) continue;
  files++;
  let n = 0;
  for (const l of j.lines) {
    const ov = OVERRIDES[f + '|' + l.name];
    if (ov !== undefined) {
      report.push({ file: f, name: l.name, from: l.text, to: ov });
      l.text = ov; n++; changed++; continue;
    }
    if (typeof l.text === 'string' && markers.test(l.text)) {
      const nt = tidy(l.text);
      report.push({ file: f, name: l.name, from: l.text, to: nt });
      l.text = nt; n++; changed++;
    }
  }
  if (n && apply) fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  if (n) console.log(`${f}: cleaned ${n}`);
}

// zh_draft_common.json: clean every Chinese value except src/note/jp keys
{
  const p = W + 'zh_draft_common.json';
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  let n = 0;
  const walk = o => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string') { if (markers.test(v) && !/^src$/.test(k)) { report.push({ file: 'zh_draft_common.json', name: k, from: v, to: tidy(v) }); o[k] = tidy(v); n++; } }
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(j);
  if (n && apply) fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  if (n) console.log(`zh_draft_common.json: cleaned ${n}`);
}

console.log(`\nmarker lines found: ${report.length} (files scanned ${files})  mode=${apply ? 'APPLY' : 'dry'}`);
const changedOut = report.filter(r => r.from.replace(/[\u25c7\u203b]/g, '') !== r.to);
console.log(`lines whose RENDERED output would change: ${changedOut.length}`);
for (const r of changedOut.slice(0, 12)) console.log(`  ! [${r.file}] ${r.name}\n    - ${r.from}\n    + ${r.to}`);
if (apply) fs.writeFileSync(W + '_unkclean_report.json', JSON.stringify(report, null, 1));