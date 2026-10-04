#!/usr/bin/env node
const __P = require('./_config.js');
// D12 ext: main_option remaining UI text masks.
//   small_choice 37 (reuse D10 big_choice values; brightness_a..e are digits -> skip)
//   index        3 (head_brightness 2 lines, head_difficulty 14 lines, title_system 4 lines)
//   detail_text 18 (option description text, 1024x128, up to 3 lines lh=26)
// usage: node _d12e.js
'use strict';
const fs = require('fs');
const path = require('path');

const WORK = `${__P.WORK}`;
const tf = path.join(WORK, 'd12/trans.json');
const t = JSON.parse(fs.readFileSync(tf, 'utf8'));

// --- small_choice: same values as D10 big_choice ---
const SC = {
  aim_a: '最快', aim_b: '快', aim_c: '普通', aim_d: '慢', aim_e: '最慢',
  alerteffect_off: '关闭', alerteffect_on: '开启',
  caption_off: '关闭', caption_on: '开启',
  difc_easy: '简单', difc_hard: '困难', difc_normal: '普通',
  fphorizontal_nor: '普通', fphorizontal_rev: '反转',
  fpvertical_nor: '普通', fpvertical_rev: '反转',
  mapdirection_hup: '玩家', mapdirection_nup: '北',
  midnight_off: '关闭', midnight_on: '开启',
  reset_no: '否', reset_yes: '是',
  screensepa_off: '关闭', screensepa_on: '开启',
  subcom_off: '关闭', subcom_on: '开启',
  tphorizontal_nor: '普通', tphorizontal_rev: '反转',
  tpvertical_nor: '普通', tpvertical_rev: '反转',
  viewpoint_a: 'A型', viewpoint_b: 'B型',
};
t.defaults['menu/jp/main_option/small_choice'] = { size: 19, bold: 1, align: 'left', x: 0, y: 2 };
for (const [k, v] of Object.entries(SC)) {
  t.items[`menu/jp/main_option/small_choice/menu_option_${k}.dds`] = { text: v };
}

// --- index: section headers / option labels ---
t.defaults['menu/jp/main_option/index'] = { size: 20, bold: 1, align: 'left', x: 0, y: 2, lh: 32 };
t.items['menu/jp/main_option/index/menu_option_head_brightness.dds'] =
  { lines: ['亮度', '恢复默认'] };
t.items['menu/jp/main_option/index/menu_option_head_difficulty.dds'] = {
  lines: [
    '难度：',
    '副指令指南：',
    '第一人称纵向操作：',
    '第一人称横向操作：',
    '第三人称纵向操作：',
    '第三人称横向操作：',
    '摄像机视角：',
    '亮度：',
    '字幕：',
    '地图朝向：',
    '警戒效果：',
    '画面分割：',
    '深夜模式：',
    '瞄准速度：',
  ],
};
t.items['menu/jp/main_option/index/menu_option_title_system.dds'] = {
  size: 25, lines: ['系统', '摄像机', '画面', '音效'],
};

// --- detail_text: option descriptions (1024x128, lines at y=0/26/52) ---
t.defaults['menu/jp/main_option/detail_text'] = { size: 20, bold: 1, align: 'left', x: 0, y: 0, lh: 26 };
const DT = {
  aim_exp: ['设置狙击模式下的准星移动速度。'],
  alerteffect_exp: [
    '设置警戒效果（敌人接近、警戒时的画面效果、音效、振动）。',
    '开启: 有警戒效果',
    '关闭: 无警戒效果',
  ],
  brightness_exp1: ['设置画面的亮度。'],
  brightness_exp2: ['请选择您喜欢的亮度设置。'],
  caption_exp: ['设置语音字幕的显示。', '开启: 显示字幕', '关闭: 不显示字幕'],
  difc_exp: [
    '更改游戏难度。',
    '简单: 推荐给不习惯游戏的人',
    '普通: 推荐给想享受动作与刺激的人',
  ],
  difc_exp2: ['无法在章节中途更改难度。', '请从顶部菜单的OPTIONS中更改。'],
  fphorizontal_exp: [
    '设置主观视角时摄像机的水平操作。',
    '普通: 朝右摇杆推动的方向看',
    '反转: 朝右摇杆推动的反方向看',
  ],
  fpvertical_exp: [
    '设置主观视角时摄像机的垂直操作。',
    '普通: 朝右摇杆推动的方向看',
    '反转: 朝右摇杆推动的反方向看',
  ],
  mapdirection_exp: [
    '设置打开地图画面时地图的朝向。',
    '北: 以北为上显示',
    '玩家: 以玩家面朝的方向为上显示',
  ],
  midnight_exp: [
    '设置深夜模式。开启后在音量较小时也易于听清。',
    '开启: 缩小大音量与小音量之间的差距',
    '关闭: 使用标准平衡',
  ],
  midnight_exp2: [
    '开启深夜模式后，在音量较小时也易于听清。',
    '※在立体声环境下无法选择深夜模式。',
    '请从「主页菜单」的「声音设置」中更改。',
  ],
  reset_exp: ['将所有设置恢复为初始状态。'],
  screensepa_exp: [
    '设置被敌人发现时的强制视野切换。',
    '开启: 分割画面自动显示敌人视野',
    '关闭: 即使被敌人发现也不自动显示敌人视野',
  ],
  subcom_exp: [
    '设置副指令的指南显示。',
    '开启: 用方向键显示指南，显示中再按一次方向键执行指令',
    '关闭: 不显示指南，一次输入即执行指令',
  ],
  tphorizontal_exp: [
    '设置通常时摄像机的水平操作。',
    '普通: 朝右摇杆推动的方向看',
    '反转: 朝右摇杆推动的反方向看',
  ],
  tpvertical_exp: [
    '设置通常时摄像机的垂直操作。',
    '普通: 朝右摇杆推动的方向看',
    '反转: 朝右摇杆推动的反方向看',
  ],
  viewpoint_exp: [
    '设置通常时的摄像机位置。',
    'A型: 摄像机位于角色后方并略微侧移',
    'B型: 摄像机固定在角色后方',
  ],
};
for (const [k, lines] of Object.entries(DT)) {
  t.items[`menu/jp/main_option/detail_text/menu_option_${k}.dds`] = { lines };
}

// --- validate each new key exists in common.hed ---
const { parseHed } = require('./sntp_pack.js');
const idx = parseHed(fs.readFileSync(`${__P.DISC}/common.hed`));
const names = new Set(idx.entries.map(e => e.name));
const groups = ['menu/jp/main_option/small_choice', 'menu/jp/main_option/index', 'menu/jp/main_option/detail_text'];
let bad = 0;
for (const g of groups) {
  const keys = Object.keys(t.items).filter(k => k.startsWith(g + '/'));
  const miss = keys.filter(k => !names.has(k));
  console.log(`${g}: ${keys.length} items, missing=${miss.length}`);
  for (const m of miss) { console.log('  MISSING ' + m); bad++; }
}
fs.writeFileSync(tf, JSON.stringify(t, null, 1));
console.log(`total items now ${Object.keys(t.items).length}; bad=${bad}`);
