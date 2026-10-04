// List all glyph indices used across a FONTDATA file, to find which blank cells are truly unreferenced.
// usage: node fdgrep.js <msg.dat>
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
const { readGlyphs } = require('./msgdecode.js');
const count = buf.readUInt32BE(12);
const used = new Map(); // idx -> Set(recordId)
const ctrl = new Map();
for (let i = 0; i < count; i++) {
  const abs = buf.readUInt32BE(16 + i * 8 + 4) + 16;
  const g = readGlyphs(buf, abs);
  for (const v of g) { if (!used.has(v)) used.set(v, []); used.get(v).push(i); }
}
const ks = [...used.keys()].sort((a, b) => a - b);
console.log(`records=${count}; distinct glyph indices=${ks.length}; max=${ks[ks.length - 1]}`);
const hi = ks.filter(k => k >= 243);
console.log(`indices >= 243 used: ${hi.length ? hi.join(',') : '(none)'}`);
for (const k of hi) console.log(`  idx ${k} used by records: ${used.get(k).join(',')}`);
// also print any index not in 0..251 to see the spread
const over = ks.filter(k => k > 251);
console.log(`indices > 251: ${over.length ? over.join(',') : '(none)'}`);
const maxUsed = ks[ks.length - 1];
console.log(`highest referenced index = ${maxUsed}`);