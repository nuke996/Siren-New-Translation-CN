#!/usr/bin/env node
const __P = require('./_config.js');
// For every archive subtitle table, print each message that contains a still-unknown
// glyph, with unknown cells marked as {k} (k = index in _unkarch list) or <sig> if new.
// usage: node _unkarchctx.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const WK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WK, 'chap_templates.json'), 'utf8'));
  for (const [f, idf] of [['vocab.json', 'vocab_chars.json'], ['subvocab.json', 'subvocab_chars.json']]) {
    try { const a = JSON.parse(fs.readFileSync(path.join(WK, f), 'utf8')), c = JSON.parse(fs.readFileSync(path.join(WK, idf), 'utf8'));
      for (const it of a) { const ch = c[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; } } catch (e) { }
  }
  return db;
}
function cellSig(b, dof, w, col, row) { const bpr = (w / 4) * 8, b0 = dof + row * BLKH * bpr + col * BLKW * 8, p = []; for (let y = 0; y < BLKH; y++) { const s = b0 + y * bpr; p.push(b.subarray(s, s + BLKW * 8)); } return Buffer.concat(p).toString('hex'); }
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
const db = loadDb();
const all = JSON.parse(fs.readFileSync(path.join(WK, 'import/_unk_all.json'), 'utf8'));
const kmap = new Map(); all.filter(r => r.stem.startsWith('hud_launcher_jimaku')).forEach((r, k) => kmap.set(r.stem + '#' + r.sig, k));
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const stems = [...new Set(all.filter(r => r.stem.startsWith('hud_launcher_jimaku')).map(r => r.stem))];
for (const stem of stems) {
  const real = 'hud/launcher/jimaku/' + stem.slice('hud_launcher_jimaku_'.length);
  const ddsE = cidx.entries.find(e => e.name === real + '.dds'), datE = cidx.entries.find(e => e.name === real + '.dat');
  const sheet = cdat.subarray(ddsE.off, ddsE.off + ddsE.size), datBuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
  const hdr = parseDDS(sheet), cols = Math.floor(hdr.width / CELL_W);
  const sigArr = new Array(cols * Math.floor(hdr.height / CELL_H));
  for (let c = 0; c < sigArr.length; c++) sigArr[c] = cellSig(sheet, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
  const fd = parseFontdata(datBuf);
  console.log('\n##### ' + real);
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(datBuf, fd.entries[i].nameOff + 16);
    let idx; try { idx = readPayload(datBuf, fd.entries[i].dataOff + 16).glyphs; } catch (e) { continue; }
    let t = '', hit = false;
    for (const g of idx) {
      const sig = sigArr[g];
      if (db[sig]) { t += db[sig]; continue; }
      const k = kmap.get(stem + '#' + sig);
      if (k !== undefined) { t += '{' + k + '}'; hit = true; } else t += '\u25c7';
    }
    if (hit) console.log('  ' + name + ': ' + t);
  }
}