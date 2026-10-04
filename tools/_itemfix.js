const __P = require('./_config.js');
'use strict';
// Align AC_CHANGENAME_* (item/weapon switch) prompts to the canonical item name
// (main_status weapon_name/item_name from work/d12/trans.json).
// usage: node _itemfix.js [--apply]
const fs = require('fs');
const W = `${__P.WORK}/`;
const apply = process.argv.includes('--apply');

const tr = JSON.parse(fs.readFileSync(W + 'd12/trans.json', 'utf8'));
const canon = {};
function walk(o) {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    let m = /main_status\/weapon_name\/name_i_(w_[a-z]+_\d+|w_gun)\.dds$/.exec(k);
    if (m && v && v.text !== undefined) { canon['I_' + m[1].toUpperCase()] = String(v.text).trim(); continue; }
    m = /main_status\/item_name\/name_i_([a-z]+_\d+)\.dds$/.exec(k);
    if (m && v && v.text !== undefined) { canon['I_' + m[1].toUpperCase()] = String(v.text).trim(); continue; }
    walk(v);
  }
}
walk(tr);
console.log('canonical names:', Object.keys(canon).length);

const files = fs.readdirSync(W).filter(f => /^zh_draft_chapter_s\d+\.json$/.test(f)).sort();
let changes = 0, missing = new Set();
for (const f of files) {
  const path = W + f;
  const d = JSON.parse(fs.readFileSync(path, 'utf8'));
  let touched = false;
  for (const ln of d.lines) {
    let key = null, re = null, rep = null;
    const FORMS = [
      ['AC_CHANGENAME_', /^(【切换为【)(.+)(】)$/, c => '【切换为【' + c + '】'],
      ['AC_PICK_UPNAME_', /^(【拾取【)(.+)(】)$/, c => '【拾取【' + c + '】'],
      ['GET_ITEMNAME_', /^(【)(.+)(】已入手。)$/, c => '【' + c + '】已入手。'],
    ];
    for (const [pre, r, fn] of FORMS) {
      const m = new RegExp('^' + pre + '(.+?)(@0x[0-9a-f]+)?$').exec(ln.name);
      if (m) { key = m[1]; re = r; rep = fn; break; }
    }
    if (!key) continue;
    if (/^I_EV_/.test(key)) continue;   // item_name EV indices are inconsistent with the record ids
    const c = canon[key];
    if (c === undefined) { missing.add(key); continue; }
    const mm = re.exec(ln.text);
    if (!mm) continue;
    const want = rep(c);
    if (ln.text !== want) {
      console.log(`${f.replace('zh_draft_chapter_', '').replace('.json', '')}  ${ln.name.padEnd(24)} ${String(ln.text).padEnd(24)} -> ${want}`);
      changes++;
      if (apply) { ln.text = want; touched = true; }
    }
  }
  if (apply && touched) fs.writeFileSync(path, JSON.stringify(d, null, 2) + '\n', 'utf8');
}
console.log('total changes:', changes, apply ? '(APPLIED)' : '(dry-run)');
if (missing.size) console.log('no canonical name for:', [...missing].join(', '));
