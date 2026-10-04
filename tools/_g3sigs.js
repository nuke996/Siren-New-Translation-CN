#!/usr/bin/env node
const __P = require('./_config.js');
// G3: pinpoint the sigs behind systematic archive-name mislabels.
// Decodes every ARCHIVE### message of the ep02_cp1 movie sheet, compares against the
// authoritative wiki name list, and prints (position, decoded, expected, cell, sig)
// for each mismatch so the sig can be corrected in chap_templates.json.
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const WORK = `${__P.WORK}`;

// wiki: https://siren.kakurezato.com/siren_nt/story-archive001-025.htm / 026-050.htm
const WIKI = {
  1:'天地救之伝',2:'ビデオカメラ',3:'ハワードライトの学生証',4:'嶋田習次の警察手帳',5:'テレビ番組企画書',
  6:'メリッサ･ゲイルの携帯電話',7:'サム・モンローの職員証',8:'デジタルビデオテープ',9:'奇妙な図形の文字盤',
  10:'鉱山職員の日誌',11:'ベラ・モンローの日記',12:'入院患者の手紙',13:'メリッサ･ゲイルのロケットペンダント',
  14:'ソル･ジャクソンの社員証',15:'羽生蛇村郷土誌',16:'アマナの日記',17:'犀賀省悟の免許証',18:'はにゅうめん',
  19:'祭壇の偶像',20:'犀賀省悟の手帳',21:'河辺幸江の手帳',22:'マナ字架のブローチ',23:'奇妙な図形の木片',
  24:'聖画 -尊体拝領-',25:'十尺ノ異人ノ事',26:'サム･モンローの手帳',27:'美耶古祭文',28:'８ミリフィルム',
  29:'うらないのカンヅメ',30:'聖画 -虚母ろ主-',31:'アトランティス創刊号',32:'JOYLｉＮＫ -ウルトラネットワーキング-',
  33:'犀賀省悟の絵日記',34:'ハワード･ライトの携帯電話',35:'オイルライター',36:'三田村家のアルバム',
  37:'合石岳異記',38:'バミューダ３のレコード',39:'リリアン',40:'虫取りセット',41:'ハニュウダカブト',
  42:'世界ＵＭＡ大百科事典',43:'合石岳壁画',44:'サム･モンローのボイスレコーダー',45:'カセットテープ',
  46:'サム・モンローからのメッセージ',47:'羽生蛇村民話集',48:'焔薙秘録',49:'サム・モンローの日記',
  50:'ポータブルオーディオプレーヤー'
};

function load(f) { return JSON.parse(fs.readFileSync(WORK + '/' + f, 'utf8')); }
const tpl = load('chap_templates.json');
const db = {};
for (const k in tpl) db[k] = tpl[k];
for (const [vf, cf] of [['vocab.json', 'vocab_chars.json'], ['subvocab.json', 'subvocab_chars.json']]) {
  const vb = load(vf), vc = load(cf);
  for (const v of vb) { const ch = vc[String(v.id)]; if (ch && !db[v.sig]) db[v.sig] = ch; }
}

const dds = fs.readFileSync(WORK + '/import/hud_movie_ep02_cp1.orig.dds');
const dat = fs.readFileSync(WORK + '/import/hud_movie_ep02_cp1.orig.dat');
const hdr = parseDDS(dds);
const CW = 24, CH = 28, BLKW = 6, BLKH = 7;
const cols = Math.floor(hdr.width / CW), rows = Math.floor(hdr.height / CH);
const bpr = (hdr.width / 4) * 8;
function cellSig(col, row) {
  const b0 = hdr.dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(dds.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
const sigOf = new Array(cols * rows);
const glyphs = new Array(cols * rows).fill('');
for (let c = 0; c < cols * rows; c++) {
  const col = c % cols, row = Math.floor(c / cols);
  const s = cellSig(col, row); sigOf[c] = s;
  glyphs[c] = db[s] || '';
}
const fd = parseFontdata(Buffer.from(dat));
function cstr(o) { let e = o; while (e < dat.length && dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
const STYLE = { 0: '【', 2: '〈长按〉' };

const sigFix = new Map();   // sig -> {from, to, where[]}
let nMsg = 0, nBad = 0;
for (let i = 0; i < fd.count; i++) {
  const nm = cstr(fd.entries[i].nameOff + 16);
  const mm = /^ARCHIVE(\d+)$/.exec(nm);
  if (!mm) continue;
  const idx = +mm[1];
  const wiki = WIKI[idx];
  if (!wiki) continue;
  nMsg++;
  const { style, glyphs: gi } = readPayload(Buffer.from(dat), fd.entries[i].dataOff + 16);
  let txt = (STYLE[style] !== undefined ? STYLE[style] : '');
  const cells = [];
  for (const g of gi) { txt += (glyphs[g] || '◇'); cells.push(g); }
  // strip 【】 and any wrapper
  const inner = txt.replace(/^【/, '').replace(/】がアーカイブに追加された。$/, '').trim();
  if (inner === wiki) continue;
  nBad++;
  const a = [...inner], b = [...wiki];
  const diffs = [];
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (a[k] !== b[k]) diffs.push(`@${k} ${a[k] || '_'}->${b[k] || '_'} cell=${cells[k]} sig=${(sigOf[cells[k]] || '').slice(0, 12)}`);
  }
  console.log(`ARCHIVE${String(idx).padStart(3, '0')}  decoded="${inner}"  wiki="${wiki}"`);
  console.log('   ' + diffs.join('  '));
  // record sig fix candidates when lengths match
  if (a.length === b.length) {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) {
      const s = sigOf[cells[k]], key = s + '|' + a[k] + '>' + b[k];
      if (!sigFix.has(key)) sigFix.set(key, { sig: s, from: a[k], to: b[k], where: [] });
      sigFix.get(key).where.push(`A${idx}@${k}`);
    }
  }
}
console.log(`\nARCHIVE messages: ${nMsg}, mismatched: ${nBad}`);
console.log('\n--- candidate sig fixes (length-matched only) ---');
for (const v of sigFix.values()) console.log(`${(v.sig || '').slice(0, 16)}…  ${v.from} -> ${v.to}   [${v.where.join(' ')}]`);
