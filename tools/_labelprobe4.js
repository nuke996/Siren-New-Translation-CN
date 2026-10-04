const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/`;
const dat = fs.readFileSync(D + 'label.dat');
const count = dat.readUInt32BE(12);
const recs = [];
for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
recs.sort((a, b) => a.dataOff - b.dataOff);
const nameStart = Math.min(...recs.map(r => r.nameOff));
recs.forEach((r, i) => { r.name = nameOf(r.nameOff); r.next = i + 1 < recs.length ? recs[i + 1].dataOff : nameStart; });

for (const r of recs) {
  const s = r.dataOff;
  const flag = dat.readUInt16BE(s);
  const N = flag >> 8;
  const widths = [];
  for (let k = 0; k < N; k++) widths.push(dat.readUInt16BE(s + 2 + 2 * k));
  // after widths: expect FFFD op FFFC then tailA
  let p = s + 2 + 2 * N;
  let toks = [];
  // parse body
  const segs = [[]]; const segW = [];
  while (p + 1 < r.next) {
    const v = dat.readUInt16BE(p);
    if (v === 0xffff) { p += 2; break; }
    if (v === 0xfffd) { toks.push('FFFD:' + dat.readUInt16BE(p + 2).toString(16)); p += 4; continue; }
    if (v === 0xfffb) { toks.push('FFFB:' + dat.readUInt16BE(p + 2)); p += 4; continue; }
    if (v === 0xfffc) { toks.push('FFFC'); p += 2; continue; }
    if (v === 0xfffe) { toks.push('FFFE:' + dat.readUInt16BE(p + 2)); segW.push(dat.readUInt16BE(p + 2)); segs.push([]); p += 4; continue; }
    if (v < 0xff00) { segs[segs.length - 1].push(v); p += 2; continue; }
    toks.push('?0x' + v.toString(16)); p += 2;
  }
  console.log(`\n=== ${r.name} @${s}..${r.next} flag=0x${flag.toString(16)} N=${N}`);
  console.log(`  widths=[${widths.join(',')}]  headToks=[${toks.join(' ')}]`);
  console.log(`  segs=[${segs.map(x => x.length).join(',')}] segW(after FFFE)=[${segW.join(',')}]`);
  widths.forEach((w, k) => { const L = segs[k] ? segs[k].length : -1; if (w) console.log(`    widths[${k}]=${w} / segs[${k}]=${L} => ${(w / L).toFixed(2)}`); });
}