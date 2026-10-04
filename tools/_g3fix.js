#!/usr/bin/env node
const __P = require('./_config.js');
// G3 (corrected): align every ARCHIVE### message of ep02_cp1 with the authoritative
// JP wiki name list BY CHARACTER (extract the name between 【 and 】 and compare
// cell-by-cell), then record sig-level label corrections and render the actual
// bitmaps so they can be visually confirmed.
//
// Outputs:
//   work/_g3cands.json   [{sig, from, to, where[]}]
//   tools/_g3cands.png   tiled bitmaps (index order = printed order)
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const WORK = `${__P.WORK}`;
const OUT = `${__P.TOOLS}/_g3cands.png`;

// wiki numbers where the name is ambiguous / non-standard; skip strict compare
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
// characters whose difference is only full/half-width or an ASCII width variant;
// these are NOT bitmap mislabels -> never emit a fix for them.
const WIDTHISH = new Set([...( '｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' )].concat(
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'],
  [...'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９'],
  [...'・－—‐ ']));

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
const sigOf = new Array(cols * rows), chr = new Array(cols * rows).fill('◇');
for (let c = 0; c < cols * rows; c++) {
  const col = c % cols, row = Math.floor(c / cols);
  const s = cellSig(col, row); sigOf[c] = s;
  if (db[s]) chr[c] = db[s];
}
const firstCellOfSig = new Map();
for (let c = 0; c < cols * rows; c++) if (!firstCellOfSig.has(sigOf[c])) firstCellOfSig.set(sigOf[c], c);

const fd = parseFontdata(Buffer.from(dat));
function cstr(o) { let e = o; while (e < dat.length && dat[e] !== 0) e++; return dat.toString('utf8', o, e); }

const cands = new Map();   // sig -> {sig, from, to, where[]}
const cascading = [];
let nMsg = 0, nBad = 0, nSkippedWidth = 0;
for (let i = 0; i < fd.count; i++) {
  const nm = cstr(fd.entries[i].nameOff + 16);
  const mm = /^ARCHIVE(\d+)$/.exec(nm);
  if (!mm) continue;
  const idx = +mm[1], wiki = WIKI[idx];
  if (!wiki) continue;
  nMsg++;
  const { glyphs: gi } = readPayload(Buffer.from(dat), fd.entries[i].dataOff + 16);
  const s = gi.map(g => chr[g]).join('');
  const a = s.indexOf('\u3010'), b = s.indexOf('\u3011');     // 【 】
  if (a < 0 || b < 0) { cascading.push(`A${idx} (no 【】): "${s}"`); continue; }
  const name = s.slice(a + 1, b);
  const nameCells = gi.slice(a + 1, b);
  if (name === wiki) continue;
  nBad++;
  const A = [...name], B = [...wiki];
  if (A.length !== B.length) { cascading.push(`A${idx} len ${A.length}!=${B.length}: "${name}" vs "${wiki}"`); continue; }
  const parts = [];
  for (let k = 0; k < A.length; k++) {
    if (A[k] === B[k]) continue;
    if (WIDTHISH.has(A[k]) || WIDTHISH.has(B[k])) { nSkippedWidth++; continue; }
    const sig = sigOf[nameCells[k]];
    const key = sig + '|' + A[k] + '>' + B[k];
    if (!cands.has(key)) cands.set(key, { sig, from: A[k], to: B[k], cell: nameCells[k], where: [] });
    cands.get(key).where.push(`A${idx}@${k}`);
    parts.push(`${A[k]}->${B[k]}(cell${nameCells[k]})`);
  }
  if (parts.length) console.log(`A${String(idx).padStart(3, '0')} "${name}" => "${wiki}"\n     ${parts.join(' ')}`);
}

// conflict check: same sig with two different targets
const bySig = new Map();
for (const v of cands.values()) {
  if (!bySig.has(v.sig)) bySig.set(v.sig, new Set());
  bySig.get(v.sig).add(v.to);
}
const list = [...cands.values()];
console.log(`\nARCHIVE messages: ${nMsg}, mismatched(by name): ${nBad}, width-only diffs skipped: ${nSkippedWidth}`);
console.log(`unique sig fixes: ${list.length}`);
for (const v of list) {
  const conf = bySig.get(v.sig).size > 1 ? '  <<CONFLICT ' + [...bySig.get(v.sig)].join('/') + '>>' : '';
  console.log(`  ${v.sig.slice(0, 20)}…  ${v.from} -> ${v.to}  cell${v.cell}  [${v.where.join(' ')}]${conf}`);
}
console.log('\n--- cascading / length-mismatch (manual) ---');
cascading.forEach(x => console.log('  ' + x));

fs.writeFileSync(WORK + '/_g3cands.json', JSON.stringify(list, null, 1) + '\n');

// ---- render tiles ----
const SC = 6, TW = CW * SC, TH = CH * SC, PERROW = 10;
const rgba = decodeDXT1(dds, hdr.width, hdr.height, hdr.dataOffset);
const rowsN = Math.ceil(list.length / PERROW);
const W = PERROW * TW, H = rowsN * TH;
const img = Buffer.alloc(W * H * 4, 255);
for (let i = 0; i < list.length; i++) {
  const cell = firstCellOfSig.get(list[i].sig); if (cell === undefined) continue;
  const col = cell % cols, row = Math.floor(cell / cols);
  const ox = (i % PERROW) * TW, oy = Math.floor(i / PERROW) * TH;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const px = col * CW + Math.floor(x / SC), py = row * CH + Math.floor(y / SC);
    const k = (py * hdr.width + px) * 4;
    const v = Math.round((rgba[k] + rgba[k + 1] + rgba[k + 2]) / 3);
    const di = ((oy + y) * W + (ox + x)) * 4;
    img[di] = img[di + 1] = img[di + 2] = 255 - v; img[di + 3] = 255;
  }
}
writePNG(OUT, W, H, img);
console.log(`\nwrote ${OUT}  ${W}x${H}  (${PERROW}/row; index = order above)`);
