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

const args = process.argv.slice(2);
const sourcesOnly = args.includes('--sources-only');

// ---------------------------------------------------------------------------
// 1) write the polished text back into the canonical sources
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
if (sourcesOnly) { console.log('(--sources-only: stopping before rebuild)'); process.exit(0); }

// ---------------------------------------------------------------------------
// 2) rebuild + deploy + repack dist
// ---------------------------------------------------------------------------
const { bad } = runPipeline();
console.log(`\nimport done. dist refreshed at _hanhua/dist/USRDIR/sirenx/data/`);
console.log('copy _hanhua/dist over the original PS3_GAME to build the final image.');
process.exit(bad ? 1 : 0);

