#!/usr/bin/env node
// print DDS dimensions for given files
'use strict';
const fs = require('fs');
for (const p of process.argv.slice(2)) {
  const b = fs.readFileSync(p);
  if (b.toString('ascii', 0, 4) !== 'DDS ') { console.log(p, 'not DDS'); continue; }
  const h = b.readUInt32LE(12), w = b.readUInt32LE(16);
  const fourcc = b.toString('ascii', 84, 88);
  console.log(`${p}  ${w}x${h}  ${fourcc}  size=${b.length}`);
}