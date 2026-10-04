const __P = require('./_config.js');
'use strict';
// Print the segment/run skeleton of every sXX1 record for the given tags, reading
// common.hed/common.dat once.  Usage: node _sxx1skel.js s03 s04 ...
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const BASE = `${__P.DISC}/`;
const tags = process.argv.slice(2);
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));

function parse(dat, start) {
  const flag = dat.readUInt16BE(start), N = flag >> 8;
  let p = start + 2 + 2 * N;
  if (dat.readUInt16BE(p) !== 0xfffd) throw new Error('no FFFD @' + p);
  p += 4;
  if (dat.readUInt16BE(p) !== 0xfffc) throw new Error('no FFFC');
  p += 2;
  const segs = [];
  for (let k = 0; k < N; k++) {
    if (k > 0) { if (dat.readUInt16BE(p) !== 0xfffe || dat.readUInt16BE(p + 2) !== 0xfffc) throw new Error('no sep @' + p); p += 4; }
    p += 2; // width
    const runs = [];
    while (p + 1 < dat.length) {
      const v = dat.readUInt16BE(p);
      if (v === 0xffff || v === 0xfffe) break;
      if (v === 0xfffd || v === 0xfffb || v === 0xfffc) { p += (v === 0xfffc) ? 2 : 4; continue; }
      let n = 0; while (p + 1 < dat.length) { const u = dat.readUInt16BE(p); if (u >= 0xff00) break; n++; p += 2; }
      runs.push(n);
    }
    segs.push(runs);
  }
  return { flag, N, segs };
}

for (const tag of tags) {
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  if (!ch) { console.log('== ' + tag + ' NO HED'); continue; }
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  const dbuf = fs.readFileSync(BASE + tag + '.dat');
  const datE = idx.entries.find(e => e.name.endsWith(tag + '1.dat'));
  const dat = Buffer.from(dbuf.subarray(datE.off, datE.off + datE.size));
  const count = dat.readUInt32BE(12);
  const recs = [];
  for (let i = 0; i < count; i++) recs.push({ nameOff: dat.readUInt32BE(16 + i * 8) + 16, dataOff: dat.readUInt32BE(16 + i * 8 + 4) + 16 });
  recs.sort((a, b) => a.dataOff - b.dataOff);
  function nameOf(o) { let e = o; while (dat[e] !== 0) e++; return dat.toString('utf8', o, e); }
  recs.forEach(r => r.name = nameOf(r.nameOff));
  console.log('== ' + tag + ' (' + recs.length + ')');
  for (const r of recs) {
    let s; try { s = parse(dat, r.dataOff); } catch (e) { console.log('  ' + r.name + ' ERR ' + e.message); continue; }
    console.log('  ' + r.name.padEnd(18) + ' flag=0x' + s.flag.toString(16) + ' segs=' + s.N + ' segRuns=' + JSON.stringify(s.segs));
  }
}