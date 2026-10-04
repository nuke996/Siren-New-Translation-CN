'use strict';
// Extract the in-game manual page originals from the game's common.dat so
// _manualbuild.js can rebuild them from a clean disc.
//
//   node _manual_extract.js
//
// _manualbuild.js reads:
//   work/manualpng/<id>.dds                original A8 mask pages
//   work/manualpng/rd_index.json           [{name, entry, file, W, H, size}]
//   work/manualpng/rr_index.json
// and has no tool that regenerates these from the game.  This tool fills that
// gap: it pulls every
//   menu/jp/main_manual/manual_text/{rdown,rright}/menu_manual_text_NN.dds
// out of common.dat and writes the two index files.

const fs = require('fs');
const path = require('path');
const cfg = require('./_config.js');
const { parseHed, extractOne } = require('./sntp.js');

const RE = /^menu\/jp\/main_manual\/manual_text\/(rdown|rright)\/menu_manual_text_(\d+)\.dds$/;
const PREFIX = { rdown: 'rd', rright: 'rr' };
const log = (...a) => console.log(...a);

function dims(buf) {
  try {
    const { parseDDS } = require('./dds2png.js');
    const d = parseDDS(buf);
    return { W: d.width, H: d.height };
  } catch (e) {
    return { W: 512, H: 1024 };
  }
}

function run() {
  const HED = path.join(cfg.DISC, 'common.hed');
  if (!fs.existsSync(HED)) { log('! disc index not found: ' + HED); return 1; }

  const idx = parseHed(HED);
  const want = idx.entries
    .filter((e) => RE.test(e.name))
    .map((e) => {
      const m = RE.exec(e.name);
      return { name: PREFIX[m[1]] + '_' + m[2], entry: e.name, size: e.size };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!want.length) { log('! no manual_text entries found in ' + HED); return 1; }

  const OUTDIR = path.join(cfg.WORK, 'manualpng');
  fs.mkdirSync(OUTDIR, { recursive: true });

  const indexes = { rd: [], rr: [] };
  let ok = 0;
  for (const w of want) {
    const out = path.join(OUTDIR, w.name + '.dds');
    try {
      extractOne(HED, w.entry, out);
      const { W, H } = dims(fs.readFileSync(out));
      indexes[w.name.slice(0, 2)].push({
        name: w.name,
        entry: w.entry,
        file: (OUTDIR + '/' + w.name + '.dds').replace(/\\/g, '/'),
        W, H,
        size: w.size,
      });
      ok++;
    } catch (e) { log('  ! ' + w.entry + ': ' + e.message); }
  }

  for (const k of ['rd', 'rr']) {
    const p = path.join(OUTDIR, k + '_index.json');
    fs.writeFileSync(p, JSON.stringify(indexes[k], null, 1) + '\n', 'utf8');
    log('  wrote ' + k + '_index.json (' + indexes[k].length + ' pages)');
  }
  log('manual pages extracted: ' + ok + '/' + want.length + ' -> ' + OUTDIR);
  return ok === want.length ? 0 : 1;
}

module.exports = { run };

if (require.main === module) process.exit(run());
