#!/usr/bin/env node
const __P = require('./_config.js');
// Copy the deployed chapter archives (sNN.dat) from the RPCS3 virtual HDD back into
// the _hanhua/mirror disc tree.  The mirror files are hard links to the read-only
// originals, so the link must be broken (unlink) before copying.
// usage: node _mirrorsync.js s01 s02 ...
'use strict';
const fs = require('fs');
const HDD = process.env.SNT_HDD || `${__P.HDD}/`;
const MIR = `${__P.MIRROR}/`;
for (const tag of process.argv.slice(2)) {
  const a = HDD + tag + '.dat', b = MIR + tag + '.dat';
  if (!fs.existsSync(a)) { console.log(tag, 'NO HDD FILE'); continue; }
  if (fs.existsSync(b)) fs.unlinkSync(b);
  fs.copyFileSync(a, b);
  console.log(`${tag}: mirror synced ${fs.statSync(b).size} B`);
}