// Build a "test package" mirror of the game disc folder.
// Every file is created as a WINDOWS HARD LINK (same volume -> no extra disk
// space). Only the files listed in <replace.json> are written as real copies
// (the patched ones). The original disc folder is never modified.
//
// usage:
//   node mk_mirror.js <srcRoot> <dstRoot> <replace.json> [--clean]
//
// replace.json = { "relative/path/inside/src": "absolute path of replacement file" }
//
// Notes:
//  - <dstRoot> MUST be on the same drive as <srcRoot> (hard links requirement).
//  - the "_hanhua" folder is excluded from the mirror.

'use strict';
const fs = require('fs');
const path = require('path');

const [, , srcRoot, dstRoot, replacePath, ...flags] = process.argv;
if (!srcRoot || !dstRoot || !replacePath) {
  console.log('usage: node mk_mirror.js <srcRoot> <dstRoot> <replace.json> [--clean]');
  process.exit(1);
}
const clean = flags.includes('--clean');
const replace = JSON.parse(fs.readFileSync(replacePath, 'utf8'));

const srcAbs = path.resolve(srcRoot);
const dstAbs = path.resolve(dstRoot);
const EXCLUDE = new Set(['_hanhua']);

if (clean && fs.existsSync(dstAbs)) {
  console.log('removing existing mirror: ' + dstAbs);
  fs.rmSync(dstAbs, { recursive: true, force: true });
}

let nLink = 0, nCopy = 0, nDir = 0;

function walk(rel) {
  const srcDir = path.join(srcAbs, rel);
  const dstDir = path.join(dstAbs, rel);
  fs.mkdirSync(dstDir, { recursive: true });
  nDir++;
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + ent.name : ent.name;
    if (!rel && EXCLUDE.has(ent.name)) continue;         // skip _hanhua at root
    const s = path.join(srcAbs, r);
    const d = path.join(dstAbs, r);
    if (ent.isDirectory()) {
      walk(r);
    } else if (ent.isFile()) {
      const relSlash = r.replace(/\\/g, '/');
      if (replace[relSlash]) {
        if (fs.existsSync(d)) fs.unlinkSync(d);
        fs.copyFileSync(replace[relSlash], d);
        nCopy++;
        console.log('  COPY ' + relSlash);
      } else {
        if (fs.existsSync(d)) fs.unlinkSync(d);
        fs.linkSync(s, d);
        nLink++;
      }
    }
  }
}

console.log('mirror ' + srcAbs + '  ->  ' + dstAbs);
walk('');
console.log(`\ndirs=${nDir} hardlinks=${nLink} copies=${nCopy}`);