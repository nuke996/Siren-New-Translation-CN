// Search a UTF-8 needle inside an SNTP archive's .dat, and report which
// archive entry contains it plus a readable excerpt.
//
// usage: node findtext.js <arch.hed> <arch.dat> <needle> [window]
//   needle  : plain text (will be encoded as UTF-8); can be CJK
//   window  : how many bytes of context to print (default 160)
'use strict';
const fs = require('fs');

function parseHed(buf) {
  const nameBase = buf.readUInt32BE(0x10);
  const entryOff = buf.readUInt32BE(0x14);
  let count = buf.readUInt32BE(0x1c);
  if (count === 0 || entryOff + count * 16 !== buf.length) {
    const d = (buf.length - entryOff) / 16;
    if (Number.isInteger(d) && d > 0) count = d;
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const eo = entryOff + i * 16;
    const no = buf.readUInt32BE(eo);
    const off = buf.readUInt32BE(eo + 4);
    const size = buf.readUInt32BE(eo + 8);
    let s = nameBase + no, e = s;
    while (e < buf.length && buf[e] !== 0) e++;
    out.push({ name: buf.toString('ascii', s, e), off, size });
  }
  return out;
}

const [, , hedPath, datPath, needle, winArg] = process.argv;
if (!hedPath || !datPath || !needle) {
  console.log('usage: node findtext.js <arch.hed> <arch.dat> <needle> [window]');
  process.exit(1);
}
const win = parseInt(winArg || '160', 10);
const hed = fs.readFileSync(hedPath);
const entries = parseHed(hed);
const dat = fs.readFileSync(datPath);
const nb = Buffer.from(needle, 'utf8');

let from = 0, hits = 0;
for (;;) {
  const at = dat.indexOf(nb, from);
  if (at < 0) break;
  hits++;
  const en = entries.find(e => at >= e.off && at < e.off + e.size);
  console.log(`\n=== hit #${hits} @abs ${at} (entry rel ${en ? at - en.off : '?'})`);
  console.log(`entry: ${en ? en.name : '(no entry / padding)'}  [off=${en ? en.off : '?'} size=${en ? en.size : '?'}]`);
  const s = Math.max(en ? en.off : at - win, at - win);
  const e = Math.min(en ? en.off + en.size : at + win, at + nb.length + win);
  const slice = dat.subarray(s, e);
  // print as escaped UTF-8 with replacements for non-text
  console.log('context: ' + JSON.stringify(slice.toString('utf8')));
  from = at + nb.length;
}
console.log(`\ntotal hits: ${hits}`);