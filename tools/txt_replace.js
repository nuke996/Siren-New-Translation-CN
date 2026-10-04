// Apply an ordered list of string replacements to a UTF-8 text file.
// Bytes that are not part of a replaced substring are preserved exactly
// (CRLF, full-width spaces U+3000, etc.).
//
// usage: node txt_replace.js <inFile> <map.json> <outFile>
// map.json = [ ["旧","新"], ... ]  applied in order.
'use strict';
const fs = require('fs');

const [, , inPath, mapPath, outPath] = process.argv;
if (!inPath || !mapPath || !outPath) {
  console.log('usage: node txt_replace.js <inFile> <map.json> <outFile>');
  process.exit(1);
}
let txt = fs.readFileSync(inPath, 'utf8');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
for (const [from, to] of map) {
  txt = txt.split(from).join(to);
}
const out = Buffer.from(txt, 'utf8');
fs.writeFileSync(outPath, out);
console.log(`${inPath} -> ${outPath} (${out.length} bytes)`);
console.log(JSON.stringify(txt));