#!/usr/bin/env node
// IMPORT the polished Chinese from _hanhua/i18n/*.json back into every canonical
// source, then regenerate + deploy everything and refresh _hanhua/dist (the disc
// source used to build the final image).
//
// usage:
//   node _i18n_import.js                # full: sources -> rebuild -> deploy -> repack dist
//   node _i18n_import.js --sources-only # only write the canonical source JSONs (fast; for checks)
'use strict';
const fs = require('fs');
const path = require('path');
const { WORK, I18N, RD, UNITS } = require('./_i18n_lib.js');
const { runPipeline } = require('./_pipeline.js');
const { preflight, collectBuildDiagnostics, printReport } = require('./_validate_i18n.js');

const args = process.argv.slice(2);
const sourcesOnly = args.includes('--sources-only');
const force = args.includes('--force');

// ---------------------------------------------------------------------------
// 1) pre-flight: validate every translator-view file before writing anything
// ---------------------------------------------------------------------------
const pf = preflight();
printReport(pf, []);
if (pf.errors.length && !force) {
  console.log(`\n[ABORT] 译文校验发现 ${pf.errors.length} 个错误：未写入、未打包。`);
  console.log('        修正上述条目后重跑；确需忽略可加 --force。');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 2) write the polished text back into the canonical sources
// ---------------------------------------------------------------------------
let total = 0;
for (const u of UNITS) {
  const p = path.join(I18N, u.file);
  if (!fs.existsSync(p)) { console.log(`!! missing ${u.file} (run export first)`); continue; }
  const doc = RD(p);
  const entries = (doc.entries || []).map(e => ({ id: e.id, jp: e.jp, zh: e.zh }));
  u.write(entries);
  total += entries.length;
  console.log(`<- ${u.file.padEnd(26)} ${String(entries.length).padStart(5)} entries applied`);
}
console.log(`\napplied ${total} entries into canonical sources.`);
if (sourcesOnly) { console.log('(--sources-only: stopping before rebuild)'); process.exit(pf.errors.length ? 1 : 0); }

// ---------------------------------------------------------------------------
// 3) rebuild + deploy + repack dist, then surface the build diagnostics
// ---------------------------------------------------------------------------
const t0 = Date.now();
const { bad } = runPipeline();
const diag = collectBuildDiagnostics(t0);
printReport(null, diag);

const failed = bad || diag.length || pf.errors.length;
console.log(`\nimport result: pipelineFailed=${bad}  buildDiagnostics=${diag.length}  viewErrors=${pf.errors.length}`);
console.log(failed
  ? 'IMPORT: 存在问题（见上）；请修正后重跑。'
  : 'import done. dist refreshed at dist/USRDIR/sirenx/data/');
console.log('copy dist over the original PS3_GAME to build the final image.');
process.exit(failed ? 1 : 0);

