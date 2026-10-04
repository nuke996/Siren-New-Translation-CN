#!/usr/bin/env node
const __P = require('./_config.js');
// Apply shortened translations to the chapter drafts so the remaining fit-fail
// messages (whose Chinese exceeds the original Japanese slot) fit their records.
// Rewrites only the "text" value of the named line, preserving file formatting.
'use strict';
const fs = require('fs');
const path = require('path');
const WORK = `${__P.WORK}`;

const M = {
  s02: { 'CHA_ST25EVEMT1_REP_0': '贝拉……你要平安无事…' },
  s03: { 'CHA_ESC2_KYU_2': '神啊……为何？' },
  s04: { 'CHA_ST99EVENT1_CAS_0': '来，说茄子～' },
  s05: {
    'CHA_PCGETITEM_MIY': '那个……是啥？',
    'CHA_ST05EVENT2_MIY_0': '这样就能到对面……',
    'CHA_ST05EVENT3_MIY_1': '我最讨厌你们这些家伙！',
    'CHA_THANKS_MIY_1': '上来了……'
  },
  s06: {
    'CHA_CACOMELONG_GAK_0': '啊……真是的！',
    'CHA_CAHURRYUP_GAK_2': '啊……真是的！',
    'CHA_CAMEET_GAK_2': '啊……真是的！',
    'CHA_CAWAITLONG_GAK_0': '啊……真是的！',
    'CHA_CAWAITNEAR_GAK_2': '啊……真是的！',
    'CHA_DYING_GAK_1': '……不行了',
    'CHA_HURRYUP_GAK_1': '你倒是说话啊？',
    'CHA_MEET_GAK_1': '你倒是说话啊？',
    'CHA_SCREAM_DOC_2': '到此为止了吗',
    'CHA_WAITLONG_GAK_1': '这村子到底怎么回事…',
    'CHA_WAITNEAR_GAK_1': '你倒是说话啊？'
  },
  s10: { 'CHA_CAUTION2_CAS_1': '这玩笑太过分了…' },
  s11: {
    'CHA_AFTERDRAT_DOS_0': '没力气了。',
    'CHA_AFTERDRAT_DOS_2': '太嫩了。',
    'CHA_BATTLE_DOS_1': '哼，你好运到头了。',
    'CHA_CAUTION1_DOS_0': '在吗？',
    'CHA_CAUTION2_DOS_2': '愚蠢的家伙'
  },
  s12: {
    'CHA_PATROL_GKK_2': '这可不是闹着玩',
    'CHA_PATROL_GKK_4': '真是凄凉的世界'
  },
  s13: {
    'CHA_ST13EVENT1_GAK_1': '那家伙……到底？',
    'CHA_ST13EVENT1_GAK_2': '这村子到底是什么？',
    'CHA_ST13EVENT2_GAK_1': '可恶！真是个邪门家伙……',
    'CHA_ST13EVENT4_GAK_2': '这种感觉……就是既视感吗？',
    'CHA_ST13EVENT5_GAK_1': '尽是邪门东西',
    'EP08_CP2_1_07': '伤脑筋。'
  },
  s14: {
    'CHA_CAUTION2_CAS_1': '玩笑开过头了……',
    'CHA_SCREAM_REP_2': '不要……不要！求你！',
    'CHA_ST14EVEMT3_REP_1': '有什么东西夹住了……真的！',
    'CHA_ST14EVENT3_MUS_1': '这里感觉好讨厌…',
    'EP08_CP4_5_01': '这是啥钥匙？'
  },
  s16: {
    'CHA_SCREAM_REP_2': '不要……不要！求你！',
    'EP09_CP2_4_01': '在什么地方…',
    'EP09_CP2_5_01': '在什么地方…',
    'EP09_CP2_6_01': '在什么地方…'
  },
  s17: {
    'CHA_CAUTION2_CAS_1': '这玩笑太过分了…',
    'CHA_SCREAM_DOC_2': '到此为止了吗',
    'CHA_STARTST17_DOC_2': '这种感觉……以前有过？'
  },
  s18: {
    'CHA_ST18EVENT1_HNM_1': '玛娜文字铜像被偷走啦～',
    'CHA_ST18EVENT1_KYU': '过去的幻影？可是……为何？',
    'CHA_ST18EVENT5_KYU': '当这扇门开启时，轮回将再次转动',
    'CHA_START_KYU_2': '神啊，请救救我…'
  },
  s19: {
    'AC_PICK_UPNAME_I_KEY_03': '拾取【储藏室钥匙】',
    'CHA_BATTLE_RPS_1': '我们永远一起！',
    'CHA_ST07EVENT1_SM2_0': '呼啊～真是活过来一样～',
    'CHA_ST07EVENT1_SM3_0': '呼啊～真是活过来一样～'
  },
  s20: {
    'CHA_SCREAM_DOC_2': '到此为止了吗',
    'EP11_CP2_5_01': '被夺走的古老之力…吗'
  },
  s21: { 'EP11_CP4_2_01': '那声音，从哪来的？' },
  s23: {
    'CHA_SCREAM_DOC_2': '到此为止了吗',
    'CHA_ST23EVENT2_DOC_0': '来吧，就到最后了',
    'CHA_ST23EVENT2_DOC_1': '战斗',
    'CHA_ST23EVENT2_DOC_2': '战斗',
    'CHA_ST23EVENT7_MIY_0': '就是那个',
    'CHA_ST23EVENT8_MIY_0': '就现在'
  },
  s25: {
    'CHA_HURRYUP_REP_1': '现在是做这事的时候吗？',
    'CHA_ST25EVEMT1_REP_0': '贝拉……你要平安无事…',
    'EP02_CP6_1_03': '是啊，见到你之前都是'
  }
};

let total = 0;
for (const tag of Object.keys(M)) {
  const file = path.join(WORK, 'zh_draft_chapter_' + tag + '.json');
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