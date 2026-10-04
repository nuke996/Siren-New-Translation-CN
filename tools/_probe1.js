#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const { loadDb } = require('./subdecode.js');
const BASE = `${__P.DISC}/`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const db = loadDb();
function cellSig(buf, dof, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dof + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
const stem = process.argv[2];
const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
const datE = cidx.entries.find(e => e.name === stem + '.dat');
const sheet = cdat.subarray(ddsE.off, ddsE.off + ddsE.size);
const hdr = parseDDS(sheet);
const cols = Math.floor(hdr.width / CELL_W);
const glyphs = new Array(cols * Math.floor(hdr.height / CELL_H)).fill('');
for (let c = 0; c < glyphs.length; c++) { const s = cellSig(sheet, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols)); if (db[s]) glyphs[c] = db[s]; }
const mbuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
const fd = parseFontdata(mbuf);
const want = process.argv.slice(3);
for (let i = 0; i < fd.count; i++) {
  const name = (() => { let e = fd.entries[i].nameOff + 16; let s = e; while (s < mbuf.length && mbuf[s] !== 0) s++; return mbuf.toString('utf8', e, s); })();
  if (want.length && !want.includes(name)) continue;
  const { style, glyphs: idx } = readPayload(mbuf, fd.entries[i].dataOff + 16);
  const head = idx.slice(0, 6).map(g => g + ':' + (glyphs[g] || '?'));
  console.log(name, 'style=' + style, 'n=' + idx.length, '| ' + head.join(' '));
}