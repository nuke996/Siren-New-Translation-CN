'use strict';
// Shared "regenerate everything from the canonical sources, then deploy + repack"
// pipeline.  Used by _i18n_import.js (after writing polished text) and by
// _setfont.js --rebuild (after changing the typeface).
//
// Compared with the old _setfont PIPELINE this also regenerates:
//   - _d12gen (main_status/main_map/option masks)   <- was only a preview
//   - the standalone mask jobs (mission/pause/results/ui2/archhead/_d7)
//   - the label messages (_labelwrite) and the global font atlas (font01 + tbl)
//   - chapter 9 (from its saved original base)
//   - the plaintext containers, and finally refreshes _hanhua/dist
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { WORK, TOOLS, RD } = require('./_i18n_lib.js');

const cfg = require('./_config.js');
const DISC_HAS_S09 = fs.existsSync(path.join(cfg.DISC, 's09.dat'));

const PATCH = path.join(WORK, 'patch_common.json');
const ALL_TAGS = [];
for (let i = 1; i <= 25; i++) if (i !== 24) ALL_TAGS.push('s' + String(i).padStart(2, '0'));
const TAGS_NO_S09 = ALL_TAGS.filter(t => t !== 's09');
const ARCHIVES = ['archive_02', 'archive_06', 'archive_08', 'archive_34', 'archive_38', 'archive_44', 'archive_45'];
const MASK_JOBS = ['mask_job_mission', 'mask_job_pause', 'mask_job_results', 'mask_job_ui2', 'mask_job_archhead', '_d7_job'];

function run(script, args, env, log) {
  const cmd = path.join(TOOLS, script);
  log(`>> ${script} ${(args || []).join(' ')}`);
  try { execFileSync(process.execPath, [cmd, ...(args || [])], { stdio: 'inherit', cwd: TOOLS, env: env || process.env }); return true; }
  catch (e) { log(`!! ${script} failed: ${e.message}`); return false; }
}
function have(p) { return fs.existsSync(p); }

function runPipeline(log = s => process.stdout.write(s + '\n')) {
  let ok = 0, bad = 0;
  const step = (s, a, env) => (run(s, a, env, log) ? ok++ : bad++);

  // ---- global UTF-8 font atlas (only the 12 added glyphs) ----
  if (have(WORK + '/font01_zh.glyphspec.json')) step('glyphgen.js', ['build', WORK + '/font01_zh.glyphspec.json']);
  step('_tbladd.js', []);

  // ---- FONTDATA atlases ----
  step('importsheet.js', ['--all']);
  step('importsheet.js', ['--chapters']);
  for (const a of ARCHIVES) step('importsheet.js', ['hud/launcher/jimaku/' + a]);

  // ---- chapter 9 ----
  // Preferred: a clean disc that contains s09.dat, so chapter 9 rebuilds like any
  // other chapter (importsheet --chapters + _s11batch).  Fallback: the legacy
  // disc-less case, rebuilt from the saved original s090 (work/import/s090.orig.*).
  if (DISC_HAS_S09) {
    log('chapter 9: disc has s09.dat (handled by importsheet --chapters + _s11batch)');
  } else if (have(WORK + '/import/s090.orig.dat') && have(WORK + '/import/s090.orig.dds')) {
    if (run('_s09base.js', [], null, log)) {
      const env9 = { ...process.env, SNT_BASE: WORK + '/base_s09_orig' };
      run('importsheet.js', ['--chapter', 's09'], env9, log);
      run('_s11batch.js', ['s09'], env9, log);
      ok += 2;
    } else bad++;
  } else log('!! chapter 9 base missing (work/import/s090.orig.*) - skipping s09 regeneration');

  // ---- baked image masks ----
  for (const g of ['_d5gen.js', '_d6gen.js', '_d8gen.js', '_d9gen.js', '_d10gen.js', '_d11gen.js', '_d13gen.js']) step(g, []);
  step('_d12gen.js', ['--into', PATCH]);
  step('_s99build.js', []);
  step('_labelgen.js', []); step('_labelwrite.js', []);
  step('_manualbuild.js', []);
  step('_archivebuild.js', []);
  step('_manheadbuild.js', []);
  step('_iconbuild.js', []);
  step('_msnbuild.js', []);
  step('_s11batch.js', DISC_HAS_S09 ? ALL_TAGS : TAGS_NO_S09);
  for (const jb of MASK_JOBS) { const p = path.join(WORK, jb + '.json'); if (have(p)) step('_maskimport.js', [p, '--into', PATCH]); }

  step('_revertpatch.js', ['place_other', 'time_other']);
  step('_e_txt.js', []);
  mergePlaintext(log);

  // ---- deploy ----
  step('_deploy.js', []);
  step('_chapterdeploy.js', ALL_TAGS);
  step('_chapterdeploy.js', ['--sheet1', ...ALL_TAGS]);
  step('_msnbuild.js', ['--deploy', ...ALL_TAGS]);
  step('_mirrorsync.js', ALL_TAGS);
  step('_repack_disc.js', ['--apply']);

  log(`\npipeline: ok ${ok}, failed ${bad}`);
  return { ok, bad };
}

function mergePlaintext(log) {
  const patch = have(PATCH) ? RD(PATCH) : {};
  Object.assign(patch, {
    'text/system.dat': WORK + '/system_zh.dat',
    'installarchive/header_music.txt': WORK + '/header_music_zh.txt',
    'installarchive/header_photo.txt': WORK + '/header_photo_zh.txt',
  });
  fs.writeFileSync(PATCH, JSON.stringify(patch, null, 1));
  log(`plaintext containers merged into patch_common.json (${Object.keys(patch).length} entries)`);
}

module.exports = { runPipeline, ALL_TAGS, ARCHIVES, MASK_JOBS };
