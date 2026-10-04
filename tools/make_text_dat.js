// Build a CRLF text .dat from a plain UTF-8 lines file.
// Each line in <lines.txt> becomes one output line; lines are joined with CRLF
// and the file ends with a trailing CRLF (matching the original SIREN data).
//
// usage: node make_text_dat.js <lines.txt> <out.dat>
'use strict';
const fs = require('fs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.log('usage: node make_text_dat.js <lines.txt> <out.dat>'); process.exit(1); }

let txt = fs.readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const lines = txt.split('\n');
const out = Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
fs.writeFileSync(outPath, out);
console.log(`lines=${lines.length} bytes=${out.length} -> ${outPath}`);
for (let i = 0; i < lines.length; i++) console.log(`  [${i}] ${lines[i]}`);