#!/usr/bin/env node
const __P = require('./_config.js');
// D12 batch D: main_status/profile element/sex/work (age is unchanged -> skipped).
'use strict';
const fs = require('fs');
const P = `${__P.WORK}/d12/trans.json`;
const trans = JSON.parse(fs.readFileSync(P, 'utf8'));
const B = 'menu/jp/main_status/profile/';
trans.defaults[B + 'element'] = { size: 19, bold: 1, align: 'left', x: 0, y: 1 };
trans.defaults[B + 'sex'] = { size: 19, bold: 1, align: 'left', x: 0, y: 1 };
trans.defaults[B + 'work'] = { size: 19, bold: 1, align: 'left', x: 0, y: 1 };

const element = {
  head_age: '年龄：', head_item: '物品', head_job: '职业：', head_sex: '性别：', head_weapon: '武器',
};
for (const [k, v] of Object.entries(element)) trans.items[B + `element/menu_status_${k}.dds`] = { text: v };

const sex = { amana: '女', bella: '女', howard: '男', kobe: '女', melissa: '女', miyako: '女', saiga: '男', sam: '男', shimada: '男', sol: '男' };
for (const [k, v] of Object.entries(sex)) trans.items[B + `sex/menu_status_sex_${k}.dds`] = { text: v };

const work = {
  amana: '修女', bella: '小学生', howard: '高中生', kobe: '护士', melissa: '电视记者',
  miyako: '不明', saiga: '医生', sam: '文化人类学者', shimada: '驻守警官', sol: '电视导演',
};
for (const [k, v] of Object.entries(work)) trans.items[B + `work/menu_status_job_${k}.dds`] = { text: v };

fs.writeFileSync(P, JSON.stringify(trans, null, 1));
console.log(`trans.json items=${Object.keys(trans.items).length}`);
