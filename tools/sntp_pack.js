// SNTP archive re-packer for SIREN: New Translation (PS3, BCJS30020)
// Strategy A (safest): in-place replacement inside the existing .dat.
//   - new content MUST be <= the original entry size
//   - bytes are written at the original dataOffset
//   - the leftover tail is zero-filled
//   - only the entry's `size` field in the .hed is updated
//   - NO offsets are changed, NO 2048 alignment is recomputed
//
// usage:
//   node sntp_pack.js <arch.hed> <arch.dat> <patch.json> <outDir>
//
// patch.json = { "archive/name.ext": "path/to/new/content", ... }
// Outputs <outDir>/<base>.hed , <base>.dat , <base>.siz
//
// The original archive is never modified.

'use strict';
const fs = require('fs');
const path = require('path');
const __P = require('./_config.js');

function parseHed(buf) {
  if (buf.toString('ascii', 0, 4) !== 'SNTP') throw new Error('not SNTP');
  const nameBase = buf.readUInt32BE(0x10);
  const entryOff = buf.readUInt32BE(0x14);
  let count = buf.readUInt32BE(0x1c);
  if (count === 0 || entryOff + count * 16 !== buf.length) {
    const derived = (buf.length - entryOff) / 16;
    if (Number.isInteger(derived) && derived > 0) count = derived;
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    const eo = entryOff + i * 16;
    const no = buf.readUInt32BE(eo);
    const off = buf.readUInt32BE(eo + 4);
    const size = buf.readUInt32BE(eo + 8);
    const flags = buf.readUInt32BE(eo + 12);
    let s = nameBase + no, e = s;
    while (e < buf.length && buf[e] !== 0) e++;
    entries.push({ i, eo, name: buf.toString('ascii', s, e), off, size, flags });
  }
  return { nameBase, entryOff, count, entries };
}

function main() {
  const [hedPath, datPath, patchPath, outDir] = process.argv.slice(2);
  if (!hedPath || !datPath || !patchPath || !outDir) {
    console.log('usage: node sntp_pack.js <arch.hed> <arch.dat> <patch.json> <outDir>');
    process.exit(1);
  }
  const patches = JSON.parse(fs.readFileSync(patchPath, 'utf8')); // { name: srcPath }

  const hed = Buffer.from(fs.readFileSync(hedPath));       // mutable copy
  const dat = Buffer.from(fs.readFileSync(datPath));       // mutable copy
  const idx = parseHed(hed);

  const base = path.basename(hedPath).replace(/\.hed$/i, '');
  fs.mkdirSync(outDir, { recursive: true });

  let changed = 0;
  for (const [name, srcPath] of Object.entries(patches)) {
    const en = idx.entries.find(e => e.name === name);
    if (!en) throw new Error('entry not found in archive: ' + name);
    const nb = fs.readFileSync(path.isAbsolute(srcPath) ? srcPath : path.join(__P.WORK, srcPath));
    // Strategy A': content must fit before the next entry starts (existing size, or the
    // archive's own padding/alignment slack).  Offsets are never changed.
    const nextOff = Math.min(...idx.entries.filter(o => o.off > en.off).map(o => o.off), dat.length);
    const alloc = nextOff - en.off;
    if (nb.length > alloc) {
      throw new Error(`new content too large for strategy A: ${name} new=${nb.length} alloc=${alloc} (old=${en.size})`);
    }
    nb.copy(dat, en.off);
    if (nb.length < en.size) dat.fill(0x00, en.off + nb.length, en.off + en.size); // wipe leftover bytes
    hed.writeUInt32BE(nb.length, en.eo + 8);              // update size field
    console.log(`patched ${name}: ${en.size} -> ${nb.length} bytes @${en.off}${nb.length > en.size ? ' (grown, alloc=' + alloc + ')' : ''}`);
    changed++;
  }

  const outHed = path.join(outDir, base + '.hed');
  const outDat = path.join(outDir, base + '.dat');
  const outSiz = path.join(outDir, base + '.siz');
  fs.writeFileSync(outHed, hed);
  fs.writeFileSync(outDat, dat);
  const siz = Buffer.alloc(8);
  siz.writeUInt32BE(hed.length, 0);
  siz.writeUInt32BE(dat.length, 4);
  fs.writeFileSync(outSiz, siz);

  console.log(`\nwrote ${outHed} (${hed.length} B)`);
  console.log(`wrote ${outDat} (${dat.length} B)`);
  console.log(`wrote ${outSiz} (${siz.length} B)`);
  console.log(`patched entries: ${changed}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
}
module.exports = { parseHed };