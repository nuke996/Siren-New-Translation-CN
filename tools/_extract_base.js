'use strict';
// Prepare the build workspace and optionally extract game-derived base assets.
//
//   node _extract_base.js            # "prepare": stage locales/<locale>/source -> work
//   node _extract_base.js --assets   # also extract base assets from the game's common.dat
//
// Why this exists: the build pipeline (tools/_pipeline.js) expects its inputs in
// the WORK directory, but a clean repository only version-controls the
// translation/authoring data (locales/<locale>/source).  This step copies that
// data into WORK and, for the assets that cannot be committed (font bases,
// original plain text, label), pulls them out of the user's original game.
//
// The original game directory MUST be clean/unmodified: if it has already been
// overwritten by a localized build, the extracted font/label would be localized,
// not original.

const fs = require('fs');
const path = require('path');
const cfg = require('./_config.js');
const { extractOne } = require('./sntp.js');

const withAssets = process.argv.includes('--assets');
const SRC = path.join(cfg.REPO, 'locales', cfg.locale, 'source');
const WORK = cfg.WORK;
const DISC = cfg.DISC;
const log = (...a) => console.log(...a);
const ensure = (d) => fs.mkdirSync(d, { recursive: true });

// Run a repo tool as a child process (tools resolve roots from _config.js).
function runTool(script, okMsg) {
  try {
    const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: __dirname, env: process.env, stdio: 'inherit' });
    if (r.status === 0) log('  ' + okMsg);
    else log('  ! ' + script + ' exited with ' + r.status);
  } catch (e) { log('  ! ' + script + ' failed: ' + e.message); }
}

// ---------------------------------------------------------------------------
// 1. stage canonical sources into WORK
// ---------------------------------------------------------------------------
if (cfg.legacyMode) {
  log('legacy mode: WORK is the original workspace (' + WORK + '); skipping source staging.');
} else if (fs.existsSync(SRC)) {
  ensure(WORK);
  fs.cpSync(SRC, WORK, { recursive: true, force: true });
  log('staged sources: ' + SRC + '  ->  ' + WORK);
} else {
  log('! source directory not found: ' + SRC);
}

// Deploy targets are written directly by _deploy/_chapterdeploy/_mirrorsync, which
// do not create their parent directories; create them up front in portable mode.
if (!cfg.legacyMode) { ensure(cfg.MIRROR); ensure(cfg.DIST); }

// ---------------------------------------------------------------------------
// 2. extract base assets from the game's common.dat
// ---------------------------------------------------------------------------
const ASSETS = [
  ['font01.dds', 'font01.dds'],
  ['fontidexu8.tbl', 'fontidexu8.tbl'],
  ['hud/launcher/label.dat', 'label.dat'],
  ['hud/launcher/label.dds', 'label.dds'],
  ['setting/render_setting.txt', path.join('txt_e', 'render_setting.txt')],
  ['text/system.dat', 'system_jp.dat'],
  ['installarchive/header_music.txt', 'header_music.txt'],
  ['installarchive/header_photo.txt', 'header_photo.txt'],
];

if (withAssets) {
  if (cfg.legacyMode) {
    log('! --assets is disabled in legacy mode: it needs -GameDir pointing at a CLEAN game');
    log('  (the legacy PS3_GAME may already be patched, so extraction would capture localized data).');
  } else {
    const HED = path.join(DISC, 'common.hed');
    if (!fs.existsSync(HED)) {
      log('! disc index not found: ' + HED + '  (cannot extract base assets)');
    } else {
      let ok = 0; const miss = [];
      for (const [name, rel] of ASSETS) {
        const out = path.join(WORK, rel);
        ensure(path.dirname(out));
        try {
          const e = extractOne(HED, name, out);
          log('  extracted ' + name + ' -> ' + rel + ' (' + e.size + ' B)');
          ok++;
        } catch (err) { miss.push(name); log('  ! missing entry: ' + name); }
      }
      log('base assets extracted: ' + ok + '/' + ASSETS.length + (miss.length ? '  (missing: ' + miss.join(', ') + ')' : ''));

      // Archive document page originals (work/archdds/*.dds) + archlayout.json are
      // derived from the disc by _archlayout.js; run it so archive documents can be
      // rebuilt without the saved cache.
      runTool('_archlayout.js', 'regenerated archive layouts (archdds/*.dds + archlayout.json)');

      // In-game manual page originals (work/manualpng/*.dds + rd_index.json /
      // rr_index.json) are derived from the disc by _manual_extract.js.
      runTool('_manual_extract.js', 'regenerated manual pages (manualpng/*.dds + rd_index.json/rr_index.json)');

      const s09 = path.join(DISC, 's09.dat');
      if (fs.existsSync(s09)) log('s09.dat present in game source -> chapter 9 can be rebuilt from source.');
      else log('! s09.dat NOT present in game source -> chapter 9 needs a complete disc (see BUILDING.md).');
    }
  }
}

// ---------------------------------------------------------------------------
// 4. readiness summary
// ---------------------------------------------------------------------------
if (!cfg.legacyMode) {
  const need = ['font01.dds', 'fontidexu8.tbl'];
  const missing = need.filter((f) => !fs.existsSync(path.join(WORK, f)));
  if (withAssets && missing.length) log('! still missing: ' + missing.join(', '));
  if (!withAssets) log('hint: run with --assets (or build.ps1 -Task extract) to extract base assets.');
}
log('workspace: ' + WORK);
