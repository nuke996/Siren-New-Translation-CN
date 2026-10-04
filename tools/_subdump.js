#!/usr/bin/env node
// Print the decoded (merged-map) text of every record in a subtitle .dat.
// usage: node _subdump.js <dat> <dds> <merged.json> [nameFilter]
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const CW = 24, CH = 28;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const [datPath, ddsPath, mergedPath, filt] = process.argv.slice(2);
const buf = fs.readFileSync(datPath);
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
const glyphs = merged.glyphs;
const count = buf.readUInt32BE(12);
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
function readMsg(b, a) { const i = b.indexOf(MARK, a); let p = i + MARK.length + 2; const out = []; while (p + 1 < b.length) { const v = b.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; out.push(v); } return out; }
const bad = /[\u3040-\u30ff]/;
for (let i = 0; i < count; i++) {
  const nameOff = buf.readUInt32BE(16 + i * 8) + 16, dataOff = buf.readUInt32BE(16 + i * 8 + 4) + 16;
  const nm = readCStr(buf, nameOff);
  if (filt && !nm.includes(filt)) continue;
  const idx = readMsg(buf, dataOff);
  const text = idx.map(g => glyphs[g] || '?').join('');
  const flag = idx.filter(g => glyphs[g] === undefined).length ? '  <<< UNMAPPED' : '';
  const kana = bad.test(text) ? '  <<< KANA' : '';
  console.log(`${nm.padEnd(16)} n=${String(idx.length).padStart(2)}  ${text}${flag}${kana}`);
}