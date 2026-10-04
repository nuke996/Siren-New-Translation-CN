#!/usr/bin/env node
const __P = require('./_config.js');
// For every sig in work/import/_idlist.json, print up to 5 messages that
// reference it, with the TARGET position marked as [n] so the unknown char can
// be reconstructed from the Japanese word. Cross-ref index with _idsheet.png.
//
// usage: node _idctx.js [maxCtx]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseFontdata } = require('./msgdecode.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const DIR = `${__P.WORK}/import`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const MAXCTX = +(process.argv[2] || 5);

function cellSig(buf, dof, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dof + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }
function readMsg(buf, abs) {
  const mi = buf.indexOf(MARK, abs);
  if (mi < 0) return { glyphs: [] };
  let p = mi + MARK.length + 2; const out = [];
  while (p + 1 < buf.length) {
    const v = buf.readUInt16BE(p); p += 2;
    if (v === 0xffff) break;
    if (v === 0xfffb) { p += 2; continue; }
    if (v >= 0xff00) continue;
    out.push(v);
  }
  return { glyphs: out };
}

const list = JSON.parse(fs.readFileSync(path.join(DIR, '_idlist.json'), 'utf8'));
const want = new Map();               // sig -> {i, ctx:[]}
for (const r of list) want.set(r.sig, { i: r.i, ctx: [] });

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.orig.dat'))) {
  const stem = f.replace('.orig.dat', '');
  const ddsPath = path.join(DIR, stem + '.orig.dds');
  const mapPath = path.join(DIR, stem + '.map.json');
  if (!fs.existsSync(ddsPath) || !fs.existsSync(mapPath)) continue;
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const glyphs = map.glyphs || [];
  const buf = fs.readFileSync(path.join(DIR, f));
  const fd = parseFontdata(buf);
  const sheet = fs.readFileSync(ddsPath);
  const hdr = parseDDS(sheet);
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const sigArr = new Array(cols * rows);
  for (let c = 0; c < cols * rows; c++) sigArr[c] = cellSig(sheet, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(buf, fd.entries[i].nameOff + 16);
    const { glyphs: idx } = readMsg(buf, fd.entries[i].dataOff + 16);
    let hit = new Set();
    for (const g of idx) { const s = (g >= 0 && g < sigArr.length) ? sigArr[g] : null; if (s && want.has(s)) hit.add(s); }
    if (!hit.size) continue;
    for (const s of hit) {
      const t = want.get(s);
      if (t.ctx.length >= MAXCTX) continue;
      let text = '';
      for (const g of idx) {
        const sg = (g >= 0 && g < sigArr.length) ? sigArr[g] : null;
        if (sg === s) text += '[?]';
        else if (g >= 0 && g < glyphs.length && glyphs[g]) text += glyphs[g];
        else text += '\u25c7';
      }
      t.ctx.push(stem + ' ' + name + ' :: ' + text);
    }
  }
}

for (const r of list) {
  const t = want.get(r.sig);
  console.log('\n[' + r.i + '] cell ' + r.cell + ' n=' + r.n + ' tables=' + r.tables);
  for (const c of t.ctx) console.log('    ' + c);
}