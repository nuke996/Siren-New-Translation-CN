#!/usr/bin/env node
const __P = require('./_config.js');
// Build a DISTRIBUTABLE, localized disc source (PS3_GAME) and report gaps.
//
// The game installs its data from the source media to dev_hdd0 on first run and
// then reads the HDD, so a localized release must patch the SOURCE files, not the
// HDD.  This tool compares the original disc tree against the patched HDD install
// and (with --apply) copies the differing data files into a dist tree that can be
// dropped over the original PS3_GAME to produce the final image.
//
// usage: node _repack_disc.js [--apply]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DISC = `${__P.gameRoot}/PS3_GAME`;
// Source of the patched files: the live HDD install when present, otherwise the
// in-repo mirror (the deploy tools write there too), so dist can still be built
// on a machine without an RPCS3 profile.
const HDD = `${__P.HDD_PRESENT ? __P.HDD_GAME : (__P.MIRROR_ROOT + '/PS3_GAME')}`;
const DIST = `${__P.DIST}`;
const apply = process.argv.includes('--apply');

const REL = 'USRDIR/sirenx/data';
const discDir = path.join(DISC, REL).replace(/\\/g, '/');
const hddDir = path.join(HDD, REL).replace(/\\/g, '/');

const md5 = p => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
function list(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => fs.statSync(dir + '/' + f).isFile() && !/^_trae/i.test(f)) : []; }

const disc = new Set(list(discDir));
const hdd = new Set(list(hddDir));
const all = [...new Set([...disc, ...hdd])].sort();

let replaced = [], onlyHdd = [], onlyDisc = [], same = [];
for (const f of all) {
  const d = discDir + '/' + f, h = hddDir + '/' + f;
  if (!fs.existsSync(d)) { onlyHdd.push(f); continue; }
  if (!fs.existsSync(h)) { onlyDisc.push(f); continue; }
  const ds = fs.statSync(d).size, hs = fs.statSync(h).size;
  if (ds !== hs) { replaced.push({ f, disc: ds, hdd: hs, why: 'size' }); continue; }
  if (f === 'common.hed' || f === 'common.siz' || /\.dat$/i.test(f)) {
    if (md5(d) !== md5(h)) replaced.push({ f, disc: ds, hdd: hs, why: 'content' });
    else same.push(f);
  } else same.push(f);
}

console.log('=== files changed by localisation (need to be in the disc repack) ===');
for (const r of replaced) console.log(`  ${r.f}  (${r.why})  disc=${r.disc} hdd=${r.hdd}`);
console.log(`  total changed: ${replaced.length}`);
console.log('\n=== present in HDD install but MISSING from the disc source ===');
for (const f of onlyHdd) console.log('  ' + f + '  (' + fs.statSync(hddDir + '/' + f).size + 'B)  <-- source is INCOMPLETE');
if (!onlyHdd.length) console.log('  (none)');
console.log('\n=== present on disc but not in HDD (should be none) ===');
for (const f of onlyDisc) console.log('  ' + f);
if (!onlyDisc.length) console.log('  (none)');

if (apply) {
  for (const r of replaced) {
    const dst = path.join(DIST, REL, r.f).replace(/\\/g, '/');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(hddDir + '/' + r.f, dst);
    console.log('copied -> dist/' + REL + '/' + r.f);
  }
  for (const f of onlyHdd) {
    const dst = path.join(DIST, REL, f).replace(/\\/g, '/');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(hddDir + '/' + f, dst);
    console.log('copied (missing-source fill) -> dist/' + REL + '/' + f);
  }
  console.log('\ndist tree: ' + DIST);
  console.log('NOTE: movie/ stream/ voice/ zzdat/ and EBOOT.BIN are unchanged; copy them from the original disc.');
} else {
  console.log('\n(dry run; pass --apply to copy the changed files into ' + DIST + ')');
}