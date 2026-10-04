// Given a UTF-8 string, look up its glyph indices in fontidexu8.tbl (table B)
// and search a target binary for that glyph sequence (u8 / u16BE / u16LE).
//
// usage: node glyphseq.js <fontidexu8.tbl> <target.bin> "<text>"
'use strict';
const fs = require('fs');

const [, , tblPath, binPath, text] = process.argv;
if (!tblPath || !binPath || !text) {
  console.log('usage: node glyphseq.js <fontidexu8.tbl> <target.bin> "<text>"');
  process.exit(1);
}

// table B starts at byte 2000, 8-byte records: char[4] (utf8 reversed) + u32BE glyph
const tbl = fs.readFileSync(tblPath);
const byChar = new Map();
for (let p = 2000; p + 8 <= tbl.length; p += 8) {
  const ch = Buffer.from([tbl[p], tbl[p + 1], tbl[p + 2], tbl[p + 3]]).reverse().toString('utf8').replace(/\0+$/, '');
  const g = tbl.readUInt32BE(p + 4);
  if (ch && !byChar.has(ch)) byChar.set(ch, g);
}

const chars = [...text];
const ids = chars.map(c => byChar.has(c) ? byChar.get(c) : -1);
console.log('text   : ' + text);
console.log('glyphId: ' + ids.join(','));
if (ids.includes(-1)) console.log('WARNING: some chars not in table ->', chars.filter(c => !byChar.has(c)).join(''));

const bin = fs.readFileSync(binPath);
function searchU8(seq) {
  const nb = Buffer.from(seq.map(v => v & 0xff));
  let from = 0, hits = [];
  for (;;) { const at = bin.indexOf(nb, from); if (at < 0) break; hits.push(at); from = at + 1; }
  return hits;
}
function searchU16(seq, le) {
  const nb = Buffer.alloc(seq.length * 2);
  seq.forEach((v, i) => le ? nb.writeUInt16LE(v, i * 2) : nb.writeUInt16BE(v, i * 2));
  let from = 0, hits = [];
  for (;;) { const at = bin.indexOf(nb, from); if (at < 0) break; hits.push(at); from = at + 1; }
  return hits;
}
if (!ids.includes(-1)) {
  console.log('u8    hits:', searchU8(ids).join(',') || 'none');
  console.log('u16BE hits:', searchU16(ids, false).join(',') || 'none');
  console.log('u16LE hits:', searchU16(ids, true).join(',') || 'none');
}
// also try short 2-char probes for robustness
for (let i = 0; i + 1 < ids.length; i += 3) {
  const sub = ids.slice(i, i + 2);
  if (sub.includes(-1)) continue;
  const h = searchU16(sub, false).concat(searchU16(sub, true));
  console.log(`  probe [${chars.slice(i, i + 2).join('')}] ids=${sub} u16 hits=${h.length ? h.join(',') : 'none'}`);
}