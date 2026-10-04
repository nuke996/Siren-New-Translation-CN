#!/usr/bin/env node
const __P = require('./_config.js');
// Build/merge D12 translation map, batch A: text_mission (reuse D1) + place_* / time_*.
'use strict';
const fs = require('fs');
const P = `${__P.WORK}/d12/trans.json`;
const SP = '\u3000';
const trans = fs.existsSync(P) ? JSON.parse(fs.readFileSync(P, 'utf8')) : { defaults: {}, items: {} };
trans.defaults = trans.defaults || {}; trans.items = trans.items || {};
const p2 = n => String(n).padStart(2, '0');

// ---- text_mission : identical to etc_mission (D1) ----
const mission = [
  '逃离驻守警官。', '搜索同行者。', '与阿玛娜一同逃往「刈割」方向。', '逃离「犀贺医院」。',
  '与美耶古一同逃往「田堀」方向。', '与山姆·门罗一同逃往「比良境」方向。', '与美耶古一同逃往「刈割」方向。',
  '获得贝拉·门罗的线索。', '击退「追随者」。', '抵达「不入谷圣堂」。', '抵达「尸人之巢」中枢。',
  '击退「头脑尸人」。', '两人会合。', '与贝拉·门罗一同逃往「刈割」方向。', '解开四道封印。',
  '贝拉·门罗逃脱。', '贝拉·门罗逃脱、获取「古文书」。', '取回记忆。', '逃离「田堀」。',
  '获取「宇理焰」。', '与贝拉·门罗潜入「尸人之巢」中枢。', '抵达真相。', '打倒「蛭子」。',
  '消灭所有尸人。', '与梅丽莎·盖尔一同逃往「比良境」方向。',
];
trans.defaults['menu/jp/main_map/text_mission'] = { size: 22, bold: 1, align: 'left', x: 0, y: 0 };
mission.forEach((t, i) => {
  trans.items[`menu/jp/main_map/text_mission/s${p2(i + 1)}_object_main.dds`] = { text: t };
});

// ---- place (same as D6 etc_timecount) ----
const place = {
  1: '下粗户', 2: '合石岳' + SP + '羽生蛇矿山', 3: '波罗宿村落', 4: '比良境' + SP + '犀贺医院',
  5: '刈割', 6: '波罗宿村落', 7: '田堀' + SP + '伊东家', 8: '比良境' + SP + '犀贺医院',
  9: '合石岳' + SP + '羽生蛇矿山', 10: '刈割', 11: '上粗户' + SP + '尸人之巢', 12: '尸人之巢' + SP + '中枢',
  13: '合石岳' + SP + '羽生蛇矿山', 14: '比良境' + SP + '犀贺医院', 15: '刈割', 16: '刈割',
  17: '波罗宿村落', 18: '波罗宿村落', 19: '田堀' + SP + '伊东家', 20: '合石岳' + SP + '羽生蛇矿山',
  21: '上粗户' + SP + '尸人之巢', 22: '尸人之巢' + SP + '中枢', 23: '炼狱', 24: '数据缺失',
  25: '合石岳' + SP + '羽生蛇矿山',
};
trans.defaults['menu/jp/main_map/place_jp'] = { size: 22, bold: 1, align: 'left', x: 0, y: 0 };
trans.defaults['menu/jp/main_map/place_other'] = { size: 22, bold: 1, align: 'left', x: 0, y: 0 };
for (let i = 1; i <= 25; i++) {
  trans.items[`menu/jp/main_map/place_jp/menu_timecount_s${p2(i)}_spot1.dds`] = { text: place[i] };
  trans.items[`menu/jp/main_map/place_other/menu_timecount_s${p2(i)}_spot2.dds`] = { text: place[i] };
}

// ---- time : timestamps per chapter ----
const time = {
  1: '8月2日 23:33:33', 2: '8月3日 01:18:04', 3: '8月3日 02:00:36', 4: '8月3日 03:09:39',
  5: '8月3日 05:13:56', 6: '8月3日 12:22:58', 7: '8月4日 00:09:33', 8: '8月4日 00:10:41',
  9: '8月4日 08:08:08', 10: '8月4日 17:04:44', 11: '8月4日 19:11:01', 12: '8月4日 23:24:24',
  13: '8月3日 01:28:04', 14: '8月3日 03:09:39', 15: '8月4日 10:00:02', 16: '8月3日 05:29:43',
  17: '8月3日 12:22:58', 18: '8月4日 06:06:06', 19: '8月4日 00:23:03', 20: '8月4日 18:07:19',
  21: '8月4日 19:01:07', 22: '8月5日 02:14:02', 23: '8月5日 03:33:33', 24: '？月？日 ？？:？？:？？',
  25: '8月3日 02:03:11',
};
trans.defaults['menu/jp/main_map/time_jp'] = { size: 17, bold: 1, align: 'left', x: 0, y: 0 };
trans.defaults['menu/jp/main_map/time_other'] = { size: 18, bold: 1, align: 'left', x: 0, y: 0 };
for (let i = 1; i <= 25; i++) {
  trans.items[`menu/jp/main_map/time_jp/menu_map_s${p2(i)}_time.dds`] = { text: time[i] };
  trans.items[`menu/jp/main_map/time_other/menu_map_s${p2(i)}_date.dds`] = { text: time[i] };
}

fs.writeFileSync(P, JSON.stringify(trans, null, 1));
console.log(`trans.json items=${Object.keys(trans.items).length}`);
