#!/usr/bin/env node
const __P = require('./_config.js');
// Decode arbitrary FONTDATA text+sheet pairs stored inside common.dat
// (movie subtitles hud/movie/epXX_cpX, archive subtitles hud/launcher/jimaku/archive_XX, ...).
// Cell -> char lookup reuses the same sig DB as chapters (chap_templates + hand-transcribed vocab).
//
// usage: node subdecode.js <stem> [stem...]      # stem = archive path without extension
//        writes work/<sanitized>_jp.txt
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const { decodeDXT1 } = require('./dds2png.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
const STYLE_PREFIX = { 0: '\u3010', 2: '\u3008长按\u3009' };

function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
  try {
    const vocab = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab.json'), 'utf8'));
    const vc = JSON.parse(fs.readFileSync(path.join(WORK, 'vocab_chars.json'), 'utf8'));
    for (const v of vocab) { const ch = vc[String(v.id)]; if (ch && !db[v.sig]) db[v.sig] = ch; }
  } catch (e) { }
  try {
    const sv = JSON.parse(fs.readFileSync(path.join(WORK, 'subvocab.json'), 'utf8'));
    const sc = JSON.parse(fs.readFileSync(path.join(WORK, 'subvocab_chars.json'), 'utf8'));
    for (const it of sv) { const ch = sc[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; }
  } catch (e) { }
  return db;
}

const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));

function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }

// Auto-detect cell geometry: try 24x28 first; if coverage is poor, report.
function decodePair(stem, db) {
  const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
  const datE = cidx.entries.find(e => e.name === stem + '.dat');
  if (!ddsE || !datE) return { err: 'missing ' + (!ddsE ? '.dds ' : '') + (!datE ? '.dat' : '') };
  const sheet = cdat.subarray(ddsE.off, ddsE.off + ddsE.size);
  const hdr = parseDDS(sheet);
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const glyphs = new Array(cols * rows).fill('');
  const blank = new Array(cols * rows).fill(false);
  // decode pixels once so we can tell an unknown cell apart from an empty one
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  const isBlank = (col, row) => {
    let mx = 0;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const i = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
      const l = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      if (l > mx) mx = l;
      if (mx >= 40) return false;
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
  const mbuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
  const fd = parseFontdata(mbuf);
  const lines = [];
  let unknown = 0, blanks = 0, chars = 0;
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(mbuf, fd.entries[i].nameOff + 16);
    let text = '';
    try {
      const { style, glyphs: idxs } = readPayload(mbuf, fd.entries[i].dataOff + 16);
      text = (STYLE_PREFIX[style] !== undefined ? STYLE_PREFIX[style] : '');
      for (const g of idxs) {
        const c = glyphs[g];
        if (c) { text += c; chars++; }
        else if (blank[g]) { text += ' '; blanks++; }
        else { text += '\u25c7'; unknown++; }
      }
    } catch (e) { text = '<ERR ' + e.message + '>'; }
    lines.push('[' + i + '] ' + name + '\n' + text + '\n');
  }
  return { stem, w: hdr.width, h: hdr.height, cols, rows, known, total: cols * rows, count: fd.count, lines, unknown, blanks, chars };
}

function main() {
  const stems = process.argv.slice(2);
  if (!stems.length) { console.log('usage: node subdecode.js <stem> [stem...]'); process.exit(1); }
  const db = loadDb();
  console.log('db entries:', Object.keys(db).length);
  for (const stem of stems) {
    const r = decodePair(stem, db);
    const safe = stem.replace(/[^A-Za-z0-9_]+/g, '_');
    if (r.err) { console.log(stem, 'ERR', r.err); continue; }
    const out = ['# ' + stem + '  (auto-decoded from sig DB)', '',
      '## ' + r.cols + 'x' + r.rows + ' (' + r.w + 'x' + r.h + ')  cellsKnown ' + r.known + '/' + r.total +
      '  messages ' + r.count + '  chars ' + r.chars + '  spaces ' + r.blanks + '  unknownGlyphs ' + r.unknown, ''];
    out.push(...r.lines);
    fs.writeFileSync(path.join(WORK, safe + '_jp.txt'), out.join('\n'));
    console.log(stem, 'grid', r.cols + 'x' + r.rows, r.known + '/' + r.total, 'msgs', r.count, 'chars', r.chars, 'spaces', r.blanks, 'unknownRefs', r.unknown, '-> work/' + safe + '_jp.txt');
  }
}
if (require.main === module) { try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); } }
module.exports = { loadDb, decodePair };