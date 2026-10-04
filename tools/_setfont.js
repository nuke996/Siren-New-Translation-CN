#!/usr/bin/env node
const __P = require('./_config.js');
// Choose the typeface used for every piece of Chinese this project renders, and
// (with --rebuild) regenerate + redeploy all font-dependent artifacts.
//
// How it works: every generator renders text through tools/render_text.ps1, which
// now reads work/font_cfg.json (or the ZH_FONT env var) and overrides the font it
// was handed.  So one config value retargets the whole localisation.
//
// usage:
//   node _setfont.js "<FontName>" [--bold 0|1]     # just set the config
//   node _setfont.js "<FontName>" --rebuild        # set + regenerate + redeploy
//   node _setfont.js --show                        # print the current choice
//
// Caveat: _s11gen.js / _labelgen.js use a crop window calibrated for a ~17px em
// at the exact draw origin; a very different typeface may need re-calibration
// (compare the "_s11gen" preview against the original).  Latin/CJK widths also
// differ, so re-check the widest lines (mission objectives, manual headings).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const W = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const CFG = path.join(W, 'font_cfg.json');

const args = process.argv.slice(2);
if (args.includes('--show') || !args.length) {
  const cur = fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, 'utf8')) : {};
  console.log('current font_cfg:', JSON.stringify(cur));
  process.exit(0);
}
const font = args[0];
const bi = args.indexOf('--bold');
const cfg = { font };
if (bi >= 0) cfg.bold = +args[bi + 1];
fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2));
console.log('font_cfg.json =', JSON.stringify(cfg));

if (!args.includes('--rebuild')) {
  console.log('\nconfig updated.  Run with --rebuild to regenerate + redeploy everything.');
  process.exit(0);
}

// Regenerate every font-dependent artifact (glyph atlases AND baked image masks),
// deploy to HDD + mirror, and refresh _hanhua/dist.  Uses the shared pipeline so
// it stays in sync with the i18n import path.
const { runPipeline } = require('./_pipeline.js');
const { bad } = runPipeline();
console.log(`\nrebuild done: failed ${bad}`);
console.log('Verify in RPCS3; re-check the widest lines and the sXX1/label crop alignment.');
