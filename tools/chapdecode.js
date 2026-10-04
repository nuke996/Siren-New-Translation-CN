#!/usr/bin/env node
const __P = require('./_config.js');
// Decode every message of a chapter (both sheets sXX0 + sXX1) into Japanese text.
// Cell -> char lookup uses the sig DB: chap_templates.json + hand-transcribed vocab.
//
// usage: node chapdecode.js <tag> [tag...]      -> writes work/<tag>_jp.txt
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');

const BASE = process.env.SNT_BASE || `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
const STYLE_PREFIX = { 0: '【', 2: '\u3008长按\u3009' };

function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
  const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
  const vc = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));
  for (const v of vocab) { const ch = vc[String(v.id)]; if (ch && !db[v.sig]) db[v.sig] = ch; }
  return db;
}

const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));

function chapterIndex(tag) {
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  if (!ch) throw new Error('no chapter ' + tag);
  return parseHed(cdat.subarray(ch.off, ch.off + ch.size));
}
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }
function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}

function decodeSheet(tag, stem, db) {
  const idx = chapterIndex(tag);
  const ddsE = idx.entries.find(x => x.name.endsWith(stem + '.dds'));
  const datE = idx.entries.find(x => x.name.endsWith(stem + '.dat'));
  if (!ddsE || !datE) return null;
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  const sheet = dbuf.subarray(ddsE.off, ddsE.off + ddsE.size);
  const hdr = parseDDS(sheet);
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const glyphs = new Array(cols * rows).fill('');
  const blank = new Array(cols * rows).fill(false);
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  const isBlank = (col, row) => {
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const i = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
      if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) return false;
    }
    return true;
  };
  let known = 0;
  for (let c = 0; c < cols * rows; c++) {
    const col = c % cols, row = Math.floor(c / cols);
    const sig = cellSig(sheet, hdr.dataOffset, hdr.width, col, row);
    if (db[sig]) { glyphs[c] = db[sig]; known++; }
    else if (isBlank(col, row)) blank[c] = true;
  }
  const mbuf = dbuf.subarray(datE.off, datE.off + datE.size);
  const fd = parseFontdata(Buffer.from(mbuf));
  const lines = [];
  let unknown = 0, blanks = 0;
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(Buffer.from(mbuf), fd.entries[i].nameOff + 16);
    let text = '';
    try {
      const { style, glyphs: idxs } = readPayload(Buffer.from(mbuf), fd.entries[i].dataOff + 16);
      text = (STYLE_PREFIX[style] !== undefined ? STYLE_PREFIX[style] : '');
      for (const g of idxs) {
        const c = glyphs[g];
        if (c) text += c;
        else if (blank[g]) { text += ' '; blanks++; }
        else { text += '\u25c7'; unknown++; }
      }
    } catch (e) { text = '<ERR ' + e.message + '>'; }
    lines.push('[' + i + '] ' + name + '\n' + text + '\n');
  }
  return { stem, cols, rows, known, total: cols * rows, count: fd.count, lines, unknown, blanks };
}

function main() {
  const tags = process.argv.slice(2);
  if (!tags.length) { console.log('usage: node chapdecode.js <tag> [tag...]'); process.exit(1); }
  const db = loadDb();
  console.log('db entries:', Object.keys(db).length);
  for (const tag of tags) {
    const out = ['# ' + tag + '  (auto-decoded from sig DB)', ''];
    let totU = 0;
    for (const stem of [tag + '0', tag + '1']) {
      let r;
      try { r = decodeSheet(tag, stem, db); } catch (e) { out.push('## ' + stem + ' ERROR ' + e.message, ''); continue; }
      if (!r) continue;
      out.push('## ' + r.stem + '  grid ' + r.cols + 'x' + r.rows + '  cellsKnown ' + r.known + '/' + r.total + '  messages ' + r.count + '  spaces ' + r.blanks + '  unknownGlyphs ' + r.unknown, '');
      out.push(...r.lines);
      totU += r.unknown;
      console.log(tag, r.stem, 'cells', r.known + '/' + r.total, 'msgs', r.count, 'spaces', r.blanks, 'unknownRefs', r.unknown);
    }
    fs.writeFileSync(path.join(WORK, tag + '_jp.txt'), out.join('\n'));
    console.log(' -> work/' + tag + '_jp.txt  (total unknown glyph refs ' + totU + ')');
  }
}
if (require.main === module) { try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); } }
module.exports = { loadDb, decodeSheet };