// Print FONTDATA header + record names for a .dat (no glyph map needed).
'use strict';
const fs = require('fs');
const { parseFontdata } = require('./msgdecode.js');
function readCStr(b, off) { let e = off; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', off, e); }
for (const p of process.argv.slice(2)) {
  const b = fs.readFileSync(p);
  const magic = b.toString('ascii', 0, 8);
  console.log('=== ' + p + '  magic=' + JSON.stringify(magic) + '  size=' + b.length);
  if (magic !== 'FONTDATA') { console.log('  (not FONTDATA)'); continue; }
  const fd = parseFontdata(b);
  console.log('  count=' + fd.count);
  for (let i = 0; i < fd.count; i++) {
    const e = fd.entries[i];
    console.log('  [' + i + '] ' + readCStr(b, e.nameOff + 16) + '  @' + (e.dataOff + 16));
  }
}