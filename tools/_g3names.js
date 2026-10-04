#!/usr/bin/env node
const __P = require('./_config.js');
// G3: rewrite zh_draft_common.json -> archive_names VALUES (kept in insertion order,
// i.e. the n-th value is what ARCHIVE### shows) from the authoritative list below,
// which is derived from the JP wiki (story-archive001-025 / 026-050) and the
// corrected decode. Keys are left untouched (syncsrc re-keys them from the decode).
// Idempotent; pass --apply to write.
'use strict';
const fs = require('fs');
const WORK = `${__P.WORK}`;
const APPLY = process.argv.includes('--apply');

// index 1..50 -> Simplified Chinese archive name (also used by _d5gen.js)
const NAMES = [
  '天地救之传', '摄像机', '霍华德·莱特的学生证', '岛田习次的警察手册', '电视节目企划书',
  '梅丽莎·盖尔的手机', '山姆·门罗的职员证', '数码录像带', '奇妙图形的文字盘', '矿山职员的日志',
  '贝拉·门罗的日记', '住院患者的信', '梅丽莎·盖尔的吊坠', '索尔·杰克逊的员工证', '羽生蛇村乡土志',
  '阿玛娜的日记', '犀贺省悟的驾照', '羽生面', '祭坛的偶像', '犀贺省悟的手帐',
  '河边幸江的手帐', '玛娜字架的胸针', '奇妙图形的木片', '圣画 -尊体拜领-', '十尺异人之事',
  '山姆·门罗的手帐', '美耶古祭文', '8毫米胶片', '占卜罐头', '圣画 -虚母ろ主-',
  '亚特兰蒂斯创刊号', 'JOYLINK -超级网络-', '犀贺省悟的图画日记', '霍华德·莱特的手机', '煤油打火机',
  '三田村家的相册', '合石岳异记', '百慕大3的唱片', '莉莉安', '捉虫套装',
  '羽生独角仙', '世界UMA大百科事典', '合石岳壁画', '山姆·门罗的录音笔', '盒式磁带',
  '来自山姆·门罗的讯息', '羽生蛇村民间故事集', '焰薙秘录', '山姆·门罗的日记', '便携式音频播放器',
];

const p = WORK + '/zh_draft_common.json';
const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
const keys = Object.keys(doc.archive_names);
console.log('archive_names keys:', keys.length);
if (keys.length !== 50) { console.error('unexpected key count'); process.exit(1); }
let n = 0;
for (let i = 0; i < keys.length; i++) {
  const k = keys[i], cur = doc.archive_names[k];
  const tag = cur === NAMES[i] ? '(same)' : '(was ' + cur + ')';
  console.log(String(i + 1).padStart(2) + ' ' + NAMES[i] + '  ' + tag);
  if (cur !== NAMES[i]) { if (APPLY) { doc.archive_names[k] = NAMES[i]; n++; } }
}
if (APPLY) { fs.writeFileSync(p, JSON.stringify(doc, null, 1) + '\n'); console.log('archive_names edits:', n); }
else console.log('(dry run; pass --apply to write)');
