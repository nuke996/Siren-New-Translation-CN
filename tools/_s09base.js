const __P = require('./_config.js');
'use strict';
// Build a temp BASE dir whose s09.dat carries the ORIGINAL s090 atlas/messages
// (saved as work/import/s090.orig.*), so `SNT_BASE=<dir> importsheet --chapter s09`
// can re-import chapter 9 from clean source.
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const GAME = `${__P.DISC}/`;
const HDD = `${__P.HDD}/`;
const WORK = `${__P.WORK}/`;
const OUT = WORK + 'base_s09_orig/';
fs.mkdirSync(OUT, { recursive: true });
for (const f of ['common.hed', 'common.dat']) {
  const dst = OUT + f;
  if (fs.existsSync(dst)) fs.unlinkSync(dst);
  try { fs.linkSync(GAME + f, dst); } catch (e) { fs.copyFileSync(GAME + f, dst); }
}
const cidx = parseHed(fs.readFileSync(GAME + 'common.hed'));
const ch = cidx.entries.find(e => e.name === 's09.hed');
const cdat = fs.readFileSync(GAME + 'common.dat');
const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
const datE = idx.entries.find(e => e.name.endsWith('s090.dat'));
const ddsE = idx.entries.find(e => e.name.endsWith('s090.dds'));
const buf = fs.readFileSync(HDD + 's09.dat');
const origDat = fs.readFileSync(WORK + 'import/s090.orig.dat');
const origDds = fs.readFileSync(WORK + 'import/s090.orig.dds');
if (origDat.length !== datE.size || origDds.length !== ddsE.size) throw new Error(`size mismatch dat ${origDat.length}/${datE.size} dds ${origDds.length}/${ddsE.size}`);
origDat.copy(buf, datE.off);
origDds.copy(buf, ddsE.off);
fs.writeFileSync(OUT + 's09.dat', buf);
console.log('wrote', OUT + 's09.dat', buf.length, 'B ; s090.orig restored at dat@' + datE.off + ' dds@' + ddsE.off);
