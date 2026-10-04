// SNTP archive tool for SIREN: New Translation (PS3, BCJS30020)
// Format (big-endian):
//   .hed : magic "SNTP" | u32 ver | u32 unk | u32 unk | u32 nameBase
//          | u32 entryTableOffset | u32 unk | u32 entryCount
//          then name blob (null-separated) then entryCount * 16B entries
//   entry: u32 nameOffset(rel to nameBase) | u32 dataOffset | u32 size | u32 flags
//   .dat : concatenated file data (2048-aligned)
//   .siz : u32 hedSize | u32 datSize
const fs = require('fs');
const path = require('path');

function parseHed(hedPath) {
  const b = fs.readFileSync(hedPath);
  if (b.toString('ascii', 0, 4) !== 'SNTP') throw new Error('not SNTP: ' + hedPath);
  const nameBase = b.readUInt32BE(0x10);
  const entryOff = b.readUInt32BE(0x14);
  let count = b.readUInt32BE(0x1c);
  // derive count if header field is 0 (some sXX.hed files)
  if (count === 0 || entryOff + count * 16 !== b.length) {
    const derived = (b.length - entryOff) / 16;
    if (Number.isInteger(derived) && derived > 0) count = derived;
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    const eo = entryOff + i * 16;
    const no = b.readUInt32BE(eo);
    const off = b.readUInt32BE(eo + 4);
    const size = b.readUInt32BE(eo + 8);
    const flags = b.readUInt32BE(eo + 12);
    let s = nameBase + no, e = s;
    while (b[e] !== 0) e++;
    entries.push({ name: b.toString('ascii', s, e), off, size, flags });
  }
  return { nameBase, entryOff, count, entries };
}

function archivePaths(name) {
  // accepts "common", "s01", or a full path already ending in .hed
  const dir = path.dirname(name);
  let base = path.basename(name).replace(/\.(hed|dat|siz)$/i, '');
  return { hed: path.join(dir, base + '.hed'), dat: path.join(dir, base + '.dat') };
}

function extractAll(archName, outDir) {
  const { hed, dat } = archivePaths(archName);
  const idx = parseHed(hed);
  const fd = fs.openSync(dat, 'r');
  let n = 0;
  for (const en of idx.entries) {
    if (!en.name || en.size === 0) continue;
    const buf = Buffer.alloc(en.size);
    fs.readSync(fd, buf, 0, en.size, en.off);
    const dest = path.join(outDir, en.name.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    n++;
  }
  fs.closeSync(fd);
  return { count: idx.count, written: n };
}

function extractOne(archName, targetName, outFile, datOverride) {
  const { hed, dat } = archivePaths(archName);
  const idx = parseHed(hed);
  const en = idx.entries.find(e => e.name === targetName || e.name.toLowerCase() === targetName.toLowerCase());
  if (!en) throw new Error('not found: ' + targetName);
  const fd = fs.openSync(datOverride || dat, 'r');
  const buf = Buffer.alloc(en.size);
  fs.readSync(fd, buf, 0, en.size, en.off);
  fs.closeSync(fd);
  fs.writeFileSync(outFile, buf);
  return en;
}

module.exports = { parseHed, extractAll, extractOne, archivePaths };

if (require.main === module) {
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    if (cmd === 'list') {
      const idx = parseHed(a);
      console.log(`count=${idx.count} entryOff=${idx.entryOff}`);
      for (const e of idx.entries) console.log(`${e.off}\t${e.size}\t${e.name}`);
    } else if (cmd === 'extract-all') {
      const r = extractAll(a, b);
      console.log(`entries=${r.count} written=${r.written} -> ${b}`);
    } else if (cmd === 'extract') {
      const e = extractOne(a, b, c, process.env.SNTP_DAT);
      console.log(`wrote ${e.size} bytes -> ${c}`);
    } else {
      console.log('usage: node sntp.js list <arch.hed> | extract <arch.hed> <name> <outFile> | extract-all <arch.hed> <outDir>');
    }
  } catch (err) { console.error('ERROR: ' + err.message); process.exit(1); }
}