const __P = require('./_config.js');
// Append two verified cell sigs (数 @cell217, 米 @cell225 of hud/movie/ep01_cp1)
// to the subvocab decode DB.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;

const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const ddsE = cidx.entries.find(e => e.name === 'hud/movie/ep01_cp1.dds');
const sheet = cdat.subarray(ddsE.off, ddsE.off + ddsE.size);
const hdr = parseDDS(sheet);
const cols = Math.floor(hdr.width / CELL_W);
const bpr = (hdr.width / 4) * 8;
function sig(cell) {
  const col = cell % cols, row = Math.floor(cell / cols);
  const b0 = hdr.dataOffset + row * BLKH * bpr + col * BLKW * 8; const p = [];
  for (let by = 0; by < BLKH; by++) { const b = b0 + by * bpr; p.push(sheet.subarray(b, b + BLKW * 8)); }
  return Buffer.concat(p).toString('hex');
}

const subPath = path.join(WORK, 'subvocab.json');
const charsPath = path.join(WORK, 'subvocab_chars.json');
const sub = JSON.parse(fs.readFileSync(subPath, 'utf8'));
const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8'));
const bySig = new Map(sub.map(s => [s.sig, s]));
const add = [['数', 217], ['米', 225]];
let nextId = Math.max(...sub.map(s => s.id)) + 1;
for (const [ch, cell] of add) {
  const s = sig(cell);
  const hit = bySig.get(s);
  if (hit) { chars[String(hit.id)] = ch; console.log(`set id=${hit.id} -> ${ch} (cell ${cell})`); continue; }
  sub.push({ id: nextId, sig: s, stem: 'hud/movie/ep01_cp1', cell });
  chars[String(nextId)] = ch;
  console.log(`added id=${nextId} ${ch} cell=${cell}`);
  nextId++;
}
fs.writeFileSync(subPath, JSON.stringify(sub));
fs.writeFileSync(charsPath, JSON.stringify(chars, null, 1));
console.log('subvocab entries', sub.length);