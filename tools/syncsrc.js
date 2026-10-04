#!/usr/bin/env node
const __P = require('./_config.js');
// Refresh zh_draft_*.json `src` (and common.archive_names keys) from the freshly
// re-decoded work/*_jp.txt, after the sig-level label fixes.
//
//   ep drafts       : src by message name, resolved from hud_movie_epNN_cpX_jp.txt
//   chapter drafts  : src by message name, resolved from the matching sNN_jp.txt
//   common draft    : archive_names keys re-keyed by ARCHIVE index (order 001..050)
//
// Raw string replacement is used for ep/chapter drafts to preserve their compact formatting.
'use strict';
const fs = require('fs');
const WORK = `${__P.WORK}`;

function read(f) { return fs.readFileSync(WORK + '/' + f, 'utf8'); }
function parseJp(txt) {
  const m = {}; const lines = txt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const mm = /^\[(\d+)\] (.+)$/.exec(lines[i]);
    if (mm) m[mm[2].trim()] = lines[i + 1] !== undefined ? lines[i + 1] : '';
  }
  return m;
}
const jsonEsc = s => JSON.stringify(s).slice(1, -1);

const epSrc = {}, chapByTag = {}, archSrc = {}, allFiles = fs.readdirSync(WORK);
for (const f of allFiles) {
  let m;
  if ((m = /^hud_movie_ep(\d+)_cp\d+_jp\.txt$/.exec(f))) Object.assign(epSrc, parseJp(read(f)));
  else if ((m = /^(s\d\d)_jp\.txt$/.exec(f))) chapByTag[m[1]] = parseJp(read(f));
  else if (/^hud_launcher_jimaku_archive_\d+_jp\.txt$/.test(f)) Object.assign(archSrc, parseJp(read(f)));
}
// NOTE: hud/launcher/label.dds uses a different glyph layout and is NOT decoded by
// this sig DB (0/84 cells match); its zh_draft_label.json is left untouched.
console.log('ep names:', Object.keys(epSrc).length, ' chapter tags:', Object.keys(chapByTag).length,
  ' archive names:', Object.keys(archSrc).length);
const anyChap = {};
for (const t in chapByTag) Object.assign(anyChap, chapByTag[t]);

function refreshBySrc(file, srcMap, label, fallback) {
  let content = read(file);
  const obj = JSON.parse(content);
  const lines = obj.lines || [];
  let changed = 0, missing = 0, same = 0;
  for (const ln of lines) {
    let fresh = srcMap[ln.name];
    if (fresh === undefined && fallback) fresh = fallback[ln.name];
    if (fresh === undefined) { missing++; continue; }
    if (fresh === ln.src) { same++; continue; }
    const re = new RegExp('("name"\\s*:\\s*"' + ln.name + '"\\s*,\\s*"src"\\s*:\\s*")([^"]*)(")', 'g');
    const before = content;
    content = content.replace(re, (mm, a, b, c) => a + jsonEsc(fresh) + c);
    if (content === before) { console.log('   ! replace missed', file, ln.name); continue; }
    changed++; ln.src = fresh;
  }
  fs.writeFileSync(WORK + '/' + file, content);
  console.log(' ' + label + ': changed ' + changed + '  same ' + same + '  missing ' + missing + '  (of ' + lines.length + ')');
  return { changed, missing, same };
}

let tot = { changed: 0, missing: 0, same: 0 };
for (const f of allFiles) {
  let m;
  if ((m = /^zh_draft_ep(\d+)\.json$/.exec(f))) {
    const r = refreshBySrc(f, epSrc, f, anyChap); tot.changed += r.changed; tot.missing += r.missing; tot.same += r.same;
  } else if ((m = /^zh_draft_chapter_(s\d\d)\.json$/.exec(f))) {
    const r = refreshBySrc(f, chapByTag[m[1]] || {}, f); tot.changed += r.changed; tot.missing += r.missing; tot.same += r.same;
  } else if (f === 'zh_draft_archive.json') {
    const r = refreshBySrc(f, archSrc, f); tot.changed += r.changed; tot.missing += r.missing; tot.same += r.same;
  }
}
console.log('TOTAL ep+chapter: changed ' + tot.changed + '  same ' + tot.same + '  missing ' + tot.missing);

// ---- common draft: re-key archive_names by ARCHIVE index ----
const ep02 = parseJp(read('hud_movie_ep02_cp1_jp.txt'));
const inner = {};
for (const k in ep02) { const mm = /^ARCHIVE(\d+)$/.exec(k); if (mm) { const im = /【([^】]*)】/.exec(ep02[k]); if (im) inner[+mm[1]] = im[1]; } }
const common = JSON.parse(read('zh_draft_common.json'));
const oldKeys = Object.keys(common.archive_names);
const fixed = {};
let rekeyed = 0;
oldKeys.forEach((k, i) => {
  const nk = inner[i + 1] || k;
  if (nk !== k) { rekeyed++; console.log('   archive[' + (i + 1) + '] ' + k + ' -> ' + nk); }
  fixed[nk] = common.archive_names[k];
});
common.archive_names = fixed;
common.note = common.note.replace('遅綿=通報', '遅綿=連絡').replace('保=僕', '保=ぼ');
fs.writeFileSync(WORK + '/zh_draft_common.json', JSON.stringify(common, null, 2) + '\n');
console.log('common: archive keys ' + oldKeys.length + ' (inner found ' + Object.keys(inner).length + '), re-keyed ' + rekeyed);