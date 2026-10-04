#!/usr/bin/env node
const __P = require('./_config.js');
// Apply shortened translations to the movie drafts so the remaining fit-fail
// messages fit their records. Rewrites only the "text" value of the named line.
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;

const M = {
  ep02: {
    'EP02_CP3_10': '我没事',
    'EP02_CP5_06': '我才不要死……绝对不要！',
    'EP02_CP7_04': '不要啊啊——！',
    'EP02_CP7_07': '我刚才不是解释过——',
    'EP02_CP7_14': '我一定会找到你，约定了！'
  },
  ep03: {
    'EP03_CP1_03': '我刚才不是解释过——',
    'EP03_CP1_08': '我一定会找到你，约定了！',
    'EP03_CP3_04': '你没事吧',
    'EP03_CP3_11': '是诅咒之源。',
    'EP03_CP5_01': '什么',
    'EP03_CP5_04': '没想到……竟到了这种地步。'
  },
  ep04: {
    'EP04_CP3_02': '保险起见，得确认一下。',
    'EP04_CP3_03': '要是救的其实是怪物，那可一点都笑不出来。',
    'EP04_CP3_06': '毕竟是性命攸关的问题。',
    'EP04_CP3_10': '……对不起。'
  },
  ep08: {
    'EP08_CP5_07': '果然还是来了',
    'EP08_CP5_08': '那是什么',
    'EP08_CP5_14': '拜托，快动啊！',
    'EP08_CP5_17': '这村子到底怎么回事。',
    'EP08_CP5_20': '那孩子……'
  },
  ep09: {
    'EP09_CP3_08': '感觉真怪啊。'
  },
  ep10: {
    'EP10_CP3_01': '想起来了。',
    'EP10_CP3_05': '举行真正的仪式。'
  },
  ep11: {
    'EP11_CP1_02': '你……是谁？在这里？',
    'EP11_CP1_04': '嗨，救世主',
    'EP11_CP5_11': '别过来——！'
  },
  ep12: {
    'EP12_CP1_05': '只拿了一小片。',
    'EP12_CP1_15': '说什么？',
    'EP12_CP3_06': '我会一直陪着你。',
    'EP12_CP3_08': '求你了，把一切全抹掉。',
    'EP12_CP3_09': '村子，还有那些人……',
    'EP12_CP5_04': '要反复重演。',
    'EP12_CP5_06': '霍华德，你说过吧。',
    'EP12_CP5_07': '与美耶古的约定。'
  }
};

let total = 0;
for (const tag of Object.keys(M)) {
  const file = path.join(WORK, 'zh_draft_' + tag + '.json');
  let raw = fs.readFileSync(file, 'utf8');
  let n = 0;
  for (const name of Object.keys(M[tag])) {
    const nt = M[tag][name];
    const re = new RegExp('("name":\\s*"' + name + '",\\s*"src":\\s*"[^"]*",\\s*"text":\\s*")[^"]*(")');
    if (!re.test(raw)) { console.log('  MISS ' + tag + ' ' + name); continue; }
    raw = raw.replace(re, (m, p1, p2) => p1 + nt + p2);
    n++;
  }
  fs.writeFileSync(file, raw);
  console.log(tag + ': ' + n + ' lines rewritten');
  total += n;
}
console.log('total rewritten: ' + total);
