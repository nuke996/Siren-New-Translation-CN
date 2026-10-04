#!/usr/bin/env node
const __P = require('./_config.js');
// Debug: for each archive table, list remaining unknown cells with sig + DB membership.
'use strict';
const fs = require('fs'), path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const WK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WK, 'chap_templates.json'), 'utf8'));
  for (const [f, idf] of [['vocab.json', 'vocab_chars.json'], ['subvocab.json', 'subvocab_chars.json']]) {
    try { const a = JSON.parse(fs.readFileSync(path.join(WK, f), 'utf8')), c = JSON.parse(fs.readFileSync(path.join(WK, idf), 'utf8')); for (const it of a) { const ch = c[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; } } catch (e) { }
  } return db;
}
function cellSig(b, dof, w, col, row) { const bpr = (w / 4) * 8, b0 = dof + row * BLKH * bpr + col * BLKW * 8, p = []; for (let y = 0; y < BLKH; y++) { const s = b0 + y * bpr; p.push(b.subarray(s, s + BLKW * 8)); } return Buffer.concat(p).toString('hex'); }
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
const db = loadDb();
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
for (const stem of ['hud/launcher/jimaku/archive_06', 'hud/launcher/jimaku/archive_38', 'hud/launcher/jimaku/archive_08']) {
  const ddsE = cidx.entries.find(e => e.name === stem + '.dds'), datE = cidx.entries.find(e => e.name === stem + '.dat');
  const sheet = cdat.subarray(ddsE.off, ddsE.off + ddsE.size), datBuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
  const hdr = parseDDS(sheet), cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  console.log('\n### ' + stem + '  ' + hdr.width + 'x' + hdr.height + ' cols=' + cols + ' rows=' + rows + ' dataOffset=' + hdr.dataOffset);
  const sigArr = new Array(cols * rows);
  for (let c = 0; c < sigArr.length; c++) sigArr[c] = cellSig(sheet, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  const isBlank = (g) => { const col = g % cols, row = Math.floor(g / cols); for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) { const i = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4; if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) return false; } return true; };
  const fd = parseFontdata(datBuf);
  const seen = new Map();
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(datBuf, fd.entries[i].nameOff + 16);
    let idx; try { idx = readPayload(datBuf, fd.entries[i].dataOff + 16).glyphs; } catch (e) { continue; }
    for (const g of idx) {
      if (g < 0 || g >= cols * rows) { seen.set('OOR' + g, (seen.get('OOR' + g) || 0) + 1); continue; }
      if (db[sigArr[g]]) continue;
      if (isBlank(g)) continue;
      const key = g + '|' + sigArr[g].slice(0, 20);
      if (!seen.has(key)) seen.set(key, { g, sig: sigArr[g], name });
    }
  }
  console.log('  remaining unknown cells:', seen.size);
  for (const [k, v] of seen) console.log('   ' + k + '  inDb=' + !!db[v.sig]);
}