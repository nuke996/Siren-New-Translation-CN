// FONTDATA layout inspector: prints per-record absolute offsets and byte ranges.
// usage: node fd_layout.js <msg.dat> [limit]
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
const limit = process.argv[3] ? parseInt(process.argv[3]) : 1e9;
if (buf.toString('ascii', 0, 8) !== 'FONTDATA') { console.log('not FONTDATA'); process.exit(1); }
const count = buf.readUInt32BE(12);
console.log(`file size = ${buf.length}, count = ${count}`);

const recs = [];
for (let i = 0; i < count; i++) {
  const p = 16 + i * 8;
  recs.push({ i, nameOff: buf.readUInt32BE(p), dataOff: buf.readUInt32BE(p + 4) });
}
function readCStr(off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }

// name table region: from end of index table to first data offset
const idxEnd = 16 + count * 8;
const firstData = Math.min(...recs.map(r => r.dataOff + 16));
console.log(`index table ends @${idxEnd}, first data @${firstData} (name-table region ${firstData - idxEnd} B)`);

// build absolute data offsets sorted to compute record sizes
const absData = recs.map(r => ({ i: r.i, abs: r.dataOff + 16 }));
const sorted = [...absData].sort((a, b) => a.abs - b.abs);
const sizeOf = new Map();
for (let k = 0; k < sorted.length; k++) {
  const cur = sorted[k];
  let end;
  if (k + 1 < sorted.length) end = sorted[k + 1].abs;
  else end = buf.length;
  sizeOf.set(cur.i, end - cur.abs);
}

// detect unused gaps
let gaps = [];
for (let k = 1; k < sorted.length; k++) { /* nothing, sizes derived */ }

for (const r of recs) {
  if (r.i >= limit) break;
  const abs = r.dataOff + 16;
  const name = readCStr(r.nameOff + 16);
  const sz = sizeOf.get(r.i);
  // find terminator: scan u16 stream from abs+12
  let term = -1;
  for (let p = abs + 12; p + 1 < buf.length; p += 2) {
    if (buf.readUInt16BE(p) === 0xffff) { term = p + 2; break; }
  }
  console.log(`[${r.i}] name@${r.nameOff + 16} data@${abs} size=${sz} termEnd=${term === -1 ? '-' : term} tail=${term === -1 ? '-' : sz - (term - abs)} ${name}`);
}

// overall bounds
const minAbs = sorted[0].abs;
const maxAbs = sorted[sorted.length - 1].abs;
console.log(`\nnameTableStart=${idxEnd} minData=${minAbs} maxData=${maxAbs} fileSize=${buf.length}`);
console.log(`tail slack after last record body (to EOF) = ${buf.length - maxAbs}`);