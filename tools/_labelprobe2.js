const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/`;
const dat = fs.readFileSync(D + 'label.dat');
const count = dat.readUInt32BE(12);
const ents = [];
for (let i = 0; i < count; i++) {
  const nameOff = dat.readUInt32BE(16 + i * 8);
  const dataOff = dat.readUInt32BE(16 + i * 8 + 4);
  let e = nameOff + 16; let s = e; while (dat[s] !== 0) s++;
  ents.push({ nameOff, dataOff, name: dat.toString('utf8', e, s) });
}
const abs = ents.map(e => e.dataOff + 16);
const order = abs.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
const endOf = new Array(count);
order.forEach((o, k) => endOf[o.i] = (k + 1 < order.length ? order[k + 1].a : dat.length));
const nameStart = Math.min(...ents.map(e => e.nameOff + 16));
console.log('count=' + count + ' nameStart=' + nameStart + ' datLen=' + dat.length);
for (let i = 0; i < count; i++) {
  const a = abs[i];
  const flag = dat.readUInt16BE(a);
  const N = flag >> 8;
  const hdrLen = 2 + 2 * N + 6 + 2;
  const widths = []; for (let k = 0; k < N; k++) widths.push(dat.readUInt16BE(a + 2 + k * 2));
  const ctl = dat.readUInt16BE(a + 2 + N * 2 + 2);
  const tailA = dat.readUInt16BE(a + 2 + N * 2 + 6);
  let p = a + hdrLen, n = 0, style = null; const idx = [], ctrls = [];
  while (p + 1 < Math.min(endOf[i], nameStart)) {
    const v = dat.readUInt16BE(p);
    if (v === 0xffff) break;
    if (v === 0xfffd) { ctrls.push({ kind: 'FFFD', at: n, op: dat.readUInt16BE(p + 2) }); p += 4; continue; }
    if (v === 0xfffb) { style = dat.readUInt16BE(p + 2); ctrls.push({ kind: 'FFFB', op: style }); p += 4; continue; }
    if (v >= 0xff00) { ctrls.push({ kind: '0x' + v.toString(16), at: n }); p += 2; continue; }
    idx.push(v); n++; p += 2;
  }
  console.log(`\n[${i}] ${ents[i].name}  off=${a} end=${endOf[i]} room=${endOf[i] - a} (fit room=${endOf[i] - a - hdrLen})`);
  console.log(`   flag=0x${flag.toString(16)} N=${N} hdrLen=${hdrLen} widths=[${widths.join(',')}] ctl=0x${ctl.toString(16)} tailA=${tailA}`);
  console.log(`   glyphs=${idx.length} max=${Math.max(...idx)} idx=[${idx.join(' ')}]`);
  console.log(`   ctrls=${JSON.stringify(ctrls)}`);
}