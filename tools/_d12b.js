#!/usr/bin/env node
const __P = require('./_config.js');
// D12 batch B: main_map/text_aim (75 = 25 chapters x 3 sub-objectives).
'use strict';
const fs = require('fs');
const P = `${__P.WORK}/d12/trans.json`;
const trans = JSON.parse(fs.readFileSync(P, 'utf8'));
const p2 = n => String(n).padStart(2, '0');
const N = '无目标';
// [s01..s25] x [object01, object02, object03]
const A = {
  1: ['逃离驻守警官。', '逃离驻守警官。', N],
  2: ['潜入「矿山事务所」。', N, N],
  3: ['遵从阿玛娜的指示。', '与阿玛娜一同逃往「刈割」方向。', '遵从阿玛娜的指示。'],
  4: ['在「接待处」求助。', '穿过地下，从「职员用楼梯」逃脱。', N],
  5: ['抵达「刈割西地区」。', '与美耶古会合。', '与美耶古一同逃往「田堀」方向。'],
  6: ['救出山姆。', '与山姆一同抵达通往「比良境」方向的道路。', N],
  7: ['探索逃脱路线。', '从二楼「阳台」登上屋顶。', '与美耶古一同逃往「刈割」方向。'],
  8: ['从屋顶环视四周。', '向山姆传达危机。', N],
  9: ['获取枪械。', '击退「追随者」。', N],
  10: ['抵达「不入谷圣堂」。', N, N],
  11: ['抵达「尸人之巢」中枢。', N, N],
  12: ['抵达「尸人之巢」最深处。', '发现「头脑尸人」。', N],
  13: ['抵达「合石5号东坑」。', '用控制面板启动电梯。', '与山姆会合。'],
  14: ['带贝拉抵达一楼「候诊室」。', '逃离「犀贺医院」。', N],
  15: ['解开四道古代石碑的封印。', N, N],
  16: ['抵达「刈割西地区」。', '逃往通往「田堀」方向的道路。', '救出贝拉。'],
  17: ['贝拉逃脱。', '获取「古文书」。', N],
  18: ['获取「胸针」。', '调查过去的记忆。', '前往通往过去之门的深处。'],
  19: ['逃离「伊东家」。', '逃往通往「刈割」方向的道路。', N],
  20: ['用控制面板启动电梯。', '在「合石1号坑」获取宇理焰。', N],
  21: ['与贝拉一同抵达「尸人之巢」中枢。', N, N],
  22: ['抵达「尸人之巢」最深处。', '打倒「怪力尸人」。', '守护贝拉到最后。'],
  23: ['打倒犀贺。', '打倒「蛭子」。', N],
  24: [N, N, N],
  25: ['抵达「通往比良境的道路」。', N, N],
};
trans.defaults['menu/jp/main_map/text_aim'] = { size: 18, bold: 1, align: 'left', x: 1, y: 0 };
for (let i = 1; i <= 25; i++) for (let k = 1; k <= 3; k++) {
  trans.items[`menu/jp/main_map/text_aim/s${p2(i)}_object0${k}_00.dds`] = { text: A[i][k - 1] };
}
fs.writeFileSync(P, JSON.stringify(trans, null, 1));
console.log(`trans.json items=${Object.keys(trans.items).length}`);
