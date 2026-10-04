const __P = require('./_config.js');
'use strict';
// Collect all AC_CHANGENAME_* (item/weapon switch) draft lines across chapters, deduped by name.
const fs = require('fs');
const W = `${__P.WORK}/`;
const files = fs.readdirSync(W).filter(f => /^zh_draft_chapter_s\d+\.json$/.test(f)).sort();
const byName = new Map();
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(W + f, 'utf8'));
  for (const ln of d.lines) {
    if (!/^AC_CHANGENAME/.test(ln.name)) continue;
    const key = ln.name.replace(/@0x[0-9a-f]+/, '');
    if (!byName.has(key)) byName.set(key, { src: ln.src, zh: ln.text, where: [] });
    const e = byName.get(key);
    if (e.zh !== ln.text) e.zh += ' | ' + ln.text;
    e.where.push(f.replace('zh_draft_chapter_', '').replace('.json', ''));
  }
}
const keys = [...byName.keys()].sort();
for (const k of keys) {
  const e = byName.get(k);
  console.log(`${k.padEnd(30)} src=${String(e.src).padEnd(24)} zh=${String(e.zh).padEnd(24)} [${e.where.join(',')}]`);
}
console.log('distinct item-switch records:', keys.length);
