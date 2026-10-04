'use strict';
// Central path resolver for the localization toolchain.
//
// The original tools were written against absolute paths on one specific
// machine (d:/MYFILE/ps3/BCJS30020 and a fixed RPCS3 profile).  This module
// turns those roots into configuration so that a clean repository checkout
// plus a user-supplied game directory can drive the same tools.
//
// Resolution order:
//   1. $SNT_CONFIG                             (explicit config file)
//   2. <repo>/config.local.json                (per-developer, git-ignored)
//   3. no config at all -> "legacy mode":
//        reproduce the original hard-coded paths exactly, so the migrated
//        toolchain behaves byte-for-byte like it did before the move.
//
// config.example.json is documentation only; it is never auto-loaded (an
// unconfigured checkout must stay in legacy mode).
//
// All returned paths use forward slashes and have no trailing slash.

const fs = require('fs');
const path = require('path');

// REPO must use forward slashes: these paths are injected into JavaScript and
// JSON string literals by tools/_bootstrap.js, where Windows backslashes would
// be swallowed or produce invalid escapes.
const REPO = path.resolve(__dirname, '..').replace(/\\/g, '/');

// Original machine-specific roots.  Used both as legacy defaults and as the
// "needle" set for the compatibility rewrite performed by tools/_bootstrap.js.
const LEGACY = {
  root: 'd:/MYFILE/ps3/BCJS30020',
  hdd: 'D:/MYFILE/ps3/rpcs3-v0.0.17-12558-a06a93d5_win64/dev_hdd0/game/BCJS30020/USRDIR/sirenx/data',
};
const LEGACY_HDD_GAME = LEGACY.hdd.replace(/\/USRDIR\/sirenx\/data$/i, '');

const norm = (p) =>
  (p === undefined || p === null || p === '') ? null
    : String(p).replace(/\\/g, '/').replace(/\/+$/, '');

function readConfig() {
  const candidates = [];
  if (process.env.SNT_CONFIG) candidates.push(process.env.SNT_CONFIG);
  candidates.push(path.join(REPO, 'config.local.json'));
  for (const c of candidates) {
    try {
      const raw = fs.readFileSync(c, 'utf8').replace(/^\uFEFF/, '');
      return { cfg: JSON.parse(raw), from: c };
    } catch (e) {
      if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) {
        // unreadable for another reason; keep trying
      }
    }
  }
  return { cfg: null, from: null };
}

const { cfg, from } = readConfig();
const legacyMode = !cfg || Object.keys(cfg).length === 0;
const locale = (!legacyMode && cfg.locale) || 'zh-CN';

let gameRoot, DISC, HDD, WORK, I18N, MIRROR, DIST;
const TOOLS = REPO + '/tools';

if (legacyMode) {
  gameRoot = LEGACY.root;
  DISC = LEGACY.root + '/PS3_GAME/USRDIR/sirenx/data';
  HDD = LEGACY.hdd;
  WORK = LEGACY.root + '/_hanhua/work';
  I18N = LEGACY.root + '/_hanhua/i18n';
  MIRROR = LEGACY.root + '/_hanhua/mirror/PS3_GAME/USRDIR/sirenx/data';
  DIST = LEGACY.root + '/_hanhua/dist';
} else {
  gameRoot = norm(cfg.gameRoot) || LEGACY.root;
  DISC = norm(cfg.discData) || (gameRoot + '/PS3_GAME/USRDIR/sirenx/data');
  HDD = norm(cfg.hddData) || norm(cfg.hddGameDir && (cfg.hddGameDir + '/USRDIR/sirenx/data')) || LEGACY.hdd;
  // WORK must be the sibling of tools/ (<repo>/work): several tools resolve
  // "../work" relative to __dirname (e.g. glyphgen.js, render_text.ps1).
  WORK = norm(cfg.workDir) || (REPO + '/work');
  I18N = norm(cfg.i18nDir) || (REPO + '/locales/' + locale + '/translator-view');
  MIRROR = norm(cfg.mirrorDir) || (REPO + '/build/mirror/PS3_GAME/USRDIR/sirenx/data');
  DIST = norm(cfg.distDir) || (REPO + '/dist');
}

const HDD_GAME = HDD.replace(/\/USRDIR\/sirenx\/data$/i, '');
// Mirror root is the container that holds PS3_GAME/USRDIR/sirenx/data (matches
// the legacy _hanhua/mirror tree); MIRROR itself is the data directory.
const MIRROR_ROOT = MIRROR.replace(/\/PS3_GAME\/USRDIR\/sirenx\/data$/i, '');

// --- deploy targets -------------------------------------------------------
// The release overlay data directory inside dist/ (overlaid on PS3_GAME).
const DIST_DATA = DIST + '/USRDIR/sirenx/data';
// Is the live RPCS3 HDD install actually present?
const HDD_PRESENT = fs.existsSync(HDD);
// Base directory to read the *original* data from when patching: prefer the
// live HDD install (which may carry manual in-game edits), else the disc source.
const BASE = HDD_PRESENT ? HDD : DISC;
// Where a patched data file is written, in order.  dist/ comes FIRST so that a
// build still produces a usable release overlay even when the RPCS3 HDD path is
// absent; the mirror and the live HDD (when present) are secondary targets.
const DATA_TARGETS = [DIST_DATA, MIRROR, ...(HDD_PRESENT ? [HDD] : [])]
  .filter((d, i, a) => a.indexOf(d) === i);

module.exports = {
  REPO,
  legacyMode,
  configFile: from,
  locale,
  cfg: cfg || {},

  gameRoot,
  DISC,
  HDD,
  HDD_GAME,
  HDD_PRESENT,
  BASE,
  WORK,
  I18N,
  MIRROR,
  MIRROR_ROOT,
  DIST,
  DIST_DATA,
  DATA_TARGETS,
  TOOLS,

  constraints: {
    discDataSuffix: '/PS3_GAME/USRDIR/sirenx/data',
    hddDataSuffix: '/USRDIR/sirenx/data',
  },
};
