#!/usr/bin/env node
const __P = require('./_config.js');
// Deploy imported chapter sheets back into the game's chapter archives.
//
// Each chapter sNN.dat contains up to four entries: sNN0.dat / sNN0.dds (main
// FONTDATA + glyph atlas) and sNN1.dat / sNN1.dds (GUIDE/TUTORIAL sheet).
// Their offsets/sizes come from the sNN.hed index that is itself embedded in
// common.dat. Imported files are the same size as the originals, so we overwrite
// the byte ranges in place - no index/size changes needed.
//
// usage: node _chapterdeploy.js s01 s02 ...      (tags without the trailing digit)
//        node _chapterdeploy.js --sheet1 s01 ... (only the sNN1 sheet)
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');

// Base to read originals from: live HDD install if present, else the disc source.
const BASE = (process.env.SNT_HDD || `${__P.BASE}`).replace(/\/+$/, '') + '/';
const IMPORT = `${__P.WORK}/import`;

const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const cdat = fs.readFileSync(BASE + 'common.dat');

const args = process.argv.slice(2);
const onlySheet1 = args[0] === '--sheet1';
const tags = onlySheet1 ? args.slice(1) : args;
const sheets = onlySheet1 ? ['1'] : ['0', '1'];

let ok = 0, bad = 0;
for (const tag of tags) {
  const ch = cidx.entries.find(e => e.name === tag + '.hed');
  if (!ch) { console.log(tag, 'NO CHAPTER INDEX'); bad++; continue; }
  const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
  for (const sheet of sheets) {
    const datE = idx.entries.find(e => e.name.endsWith(tag + sheet + '.dat'));
    const ddsE = idx.entries.find(e => e.name.endsWith(tag + sheet + '.dds'));
    if (!datE || !ddsE) { console.log(tag + sheet, 'NO SHEET ENTRIES'); bad++; continue; }
    const nd = fs.readFileSync(path.join(IMPORT, tag + sheet + '.dat'));
    const nx = fs.readFileSync(path.join(IMPORT, tag + sheet + '.dds'));
    if (nd.length !== datE.size || nx.length !== ddsE.size) {
      console.log(tag + sheet, `SIZE MISMATCH dat ${nd.length}/${datE.size} dds ${nx.length}/${ddsE.size}`);
      bad++; continue;
    }
    // Write into every target, dist/ first (see __P.DATA_TARGETS).  For targets
    // other than the live HDD the archive must be a complete copy before we patch
    // it.  If the target already holds one we keep its bytes (so patches applied
    // by an earlier deploy tool survive and the tools compose regardless of
    // order); otherwise we seed from the base.  Either way the file is replaced
    // with a private copy first, so a hard-linked mirror copy never writes
    // through to the original disc.
    for (const T of __P.DATA_TARGETS) {
      fs.mkdirSync(T, { recursive: true });
      const f = T + '/' + tag + '.dat';
      if (T !== __P.HDD) {
        if (fs.existsSync(f)) {
          const keep = fs.readFileSync(f);
          fs.unlinkSync(f);
          fs.writeFileSync(f, keep);
        } else {
          fs.copyFileSync(BASE + tag + '.dat', f);
        }
      }
      const fd = fs.openSync(f, 'r+');
      try {
        fs.writeSync(fd, nd, 0, nd.length, datE.off);
        fs.writeSync(fd, nx, 0, nx.length, ddsE.off);
      } finally { fs.closeSync(fd); }
    }
    console.log(`${tag}${sheet}: deployed  dat@${datE.off}(${nd.length}B)  dds@${ddsE.off}(${nx.length}B)`);
    ok++;
  }
}
console.log(`\ndone: ok ${ok}, failed ${bad}`);