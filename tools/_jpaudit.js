#!/usr/bin/env node
'use strict';
// Audit / repair the hand-transcribed Japanese decode dictionary
// (work/vocab_chars.json + work/subvocab_chars.json).
//
// The FONTDATA "glyph atlas" text channels store glyph-cell indices; the decoder
// turns a cell into a character with a signature table (chap_templates.json) plus
// hand transcription (vocab/subvocab).  Hand transcription is error prone: a cell
// may be read as a visually different character (e.g. 傷 read as 悔), which then
// poisons the exported Japanese original and, in turn, any translation made from it.
//
// This tool renders, for every transcribed cell, the ORIGINAL 24x28 atlas cell
// (the entry's `sig` is the raw DXT1 cell, so it can be decoded standalone) next to
// the game global font-atlas glyph of the transcribed character.  Matching pairs are
// the same glyph; a mismatch means the transcription is wrong.  See docs/PITFALLS.md.
//
// usage:
//   node _jpaudit.js montage [vocab|subvocab] [start] [count] [cols] [scale]
//                                -> work/_montage_<which>_<start>.png
//   node _jpaudit.js apply [fixes.json]
//                                -> write corrections into vocab_chars.json /
//                                   subvocab_chars.json (work + locales/<locale>/source)
//   node _jpaudit.js report [fixes.json]
//                                -> list every record whose Japanese text changes
//                                   once the fixes are applied (work/import/*.orig.*)
const fs = require('fs');
const path = require('path');
const __P = require('./_config.js');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');
const { parseHed } = require('./sntp_pack.js');

const WORK = __P.WORK;
const SRC = `${__P.REPO}/locales/${__P.locale}/source`;
const FIXES = path.join(SRC, 'jp_decode_fixes.json');
const CW = 24, CH = 28, BLKW = 6, BLKH = 7;
const FONT01 = path.join(WORK, 'font01.dds');
const TBL = path.join(WORK, 'fontidexu8.tbl');

function rd(p) { let s = fs.readFileSync(p, 'utf8'); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return JSON.parse(s); }
function wr(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8'); }

// ---- font01 char -> glyph index ------------------------------------------
function fontCharMap() {
  const tbl = fs.readFileSync(TBL); const m = {};
  for (let o = 2000; o + 8 <= tbl.length; o += 8) {
    const raw = Buffer.from([tbl[o], tbl[o + 1], tbl[o + 2], tbl[o + 3]]).reverse().toString('utf8').replace(/\0+$/g, '');
    if (!raw || raw.includes('\uFFFD')) continue;
    const g = tbl.readUInt32BE(o + 4); if (m[raw] === undefined) m[raw] = g;
  }
  return m;
}
let _fontCache = null;
function fontGlyphs() { if (!_fontCache) { const buf = fs.readFileSync(FONT01); const h = parseDDS(buf); _fontCache = { rgba: decodeDXT1(buf, h.width, h.height, h.dataOffset), W: h.width, H: h.height }; } return _fontCache; }
function sigCell(sig) { return decodeDXT1(Buffer.from(sig, 'hex'), CW, CH, 0); }

// ---- montage --------------------------------------------------------------
function montageEntries(which) {
  // returns [{sig, ch, id}] for the requested dictionary source
  const out = [];
  if (which === 'chap') {
    const tpl = rd(path.join(WORK, 'chap_templates.json'));
    for (const sig of Object.keys(tpl)) out.push({ sig, ch: tpl[sig], id: null });
  } else {
    const list = rd(path.join(WORK, which === 'subvocab' ? 'subvocab.json' : 'vocab.json'));
    const chars = rd(path.join(WORK, which === 'subvocab' ? 'subvocab_chars.json' : 'vocab_chars.json'));
    for (const v of list) { const ch = chars[String(v.id)]; if (ch) out.push({ sig: v.sig, ch, id: v.id }); }
  }
  return out;
}
function montage(which, start, count, cols, S) {
  const all = montageEntries(which);
  const slice = all.slice(start, start + count);
  const cMap = fontCharMap(); const fg = fontGlyphs();
  const FS = S, FCW = 20, FCH = 18, gap = 14, pad = 12, vgap = 16;
  const pairW = CW * S + gap + FCW * FS, pairH = Math.max(CH * S, FCH * FS);
  const cW = pairW + pad, cH = pairH + vgap;
  const W = pad + cols * cW, H = pad + Math.ceil(slice.length / cols) * cH;
  const out = Buffer.alloc(W * H * 4, 255);
  const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255; };
  slice.forEach((e, k) => {
    const bx = pad + (k % cols) * cW, by = pad + Math.floor(k / cols) * cH;
    const bg = (Math.floor(k / cols) % 2) ? 244 : 255;
    for (let y = 0; y < cH - 4; y++) for (let x = 0; x < cW - 4; x++) put(bx + x, by + y, bg, bg, bg);
    for (let x = 0; x < cW - 4; x++) { put(bx + x, by, 120, 120, 255); put(bx + x, by + cH - 5, 120, 120, 255); }
    for (let y = 0; y < cH - 4; y++) { put(bx, by + y, 120, 120, 255); put(bx + cW - 5, by + y, 120, 120, 255); }
    const ox = bx + 3, oy = by + 3 + Math.floor((pairH - CH * S) / 2);
    const sr = sigCell(e.sig);
    for (let y = 0; y < CH * S; y++) for (let x = 0; x < CW * S; x++) { const si = (Math.floor(y / S) * CW + Math.floor(x / S)) * 4; const l = Math.round(0.299 * sr[si] + 0.587 * sr[si + 1] + 0.114 * sr[si + 2]); put(ox + x, oy + y, 255 - l, 255 - l, 255 - l); }
    for (let y = 0; y < pairH; y++) { put(ox + CW * S + 4, oy + y, 200, 0, 0); put(ox + CW * S + 5, oy + y, 200, 0, 0); }
    const g = cMap[e.ch];
    if (g !== undefined) { const fc = g % 51, fr = Math.floor(g / 51); const rx = ox + CW * S + gap, ry = by + 3 + Math.floor((pairH - FCH * FS) / 2);
      for (let y = 0; y < FCH * FS; y++) for (let x = 0; x < FCW * FS; x++) { const sx = fc * 20 + Math.floor(x / FS), sy = fr * 20 + 2 + Math.floor(y / FS); if (sx >= fg.W || sy >= fg.H) continue; const i = (sy * fg.W + sx) * 4; const l = Math.round(0.299 * fg.rgba[i] + 0.587 * fg.rgba[i + 1] + 0.114 * fg.rgba[i + 2]); put(rx + x, ry + y, 255 - l, 255 - l, 255 - l); } }
  });
  const outName = path.join(WORK, `_montage_${which}_${start}.png`);
  writePNG(outName, W, H, out);
  console.log(`wrote ${outName} ${W}x${H}  ${which} [${start},${start + slice.length})`);
  console.log(slice.map(e => e.ch).join(''));
}

// ---- apply ----------------------------------------------------------------
function apply(fixesPath) {
  const f = rd(fixesPath || FIXES);
  let n = 0;
  for (const [which, charFile] of [['vocab', 'vocab_chars.json'], ['subvocab', 'subvocab_chars.json']]) {
    const fixes = f[which] || {};
    for (const dir of [WORK, SRC]) {
      const p = path.join(dir, charFile);
      if (!fs.existsSync(p)) continue;
      const c = rd(p);
      for (const [id, ch] of Object.entries(fixes)) { if (c[id] !== undefined && c[id] !== ch) { c[id] = ch; n++; } }
      wr(p, c);
      console.log('updated', p);
    }
  }
  console.log('applied corrections:', n);
}

// ---- report ---------------------------------------------------------------
function sigAt(sheet, dof, width, cell, cols) { const col = cell % cols, row = Math.floor(cell / cols); const bpr = (width / 4) * 8, b0 = dof + row * BLKH * bpr + col * BLKW * 8; const parts = []; for (let by = 0; by < BLKH; by++) { const b = b0 + by * bpr; parts.push(sheet.subarray(b, b + BLKW * 8)); } return Buffer.concat(parts).toString('hex'); }
function loadDb(applyFixes) {
  const db = rd(path.join(WORK, 'chap_templates.json'));
  for (const [listFile, charFile] of [['vocab.json', 'vocab_chars.json'], ['subvocab.json', 'subvocab_chars.json']]) {
    const list = rd(path.join(WORK, listFile)), chars = rd(path.join(WORK, charFile));
    for (const v of list) { const ch = chars[String(v.id)]; if (ch && !db[v.sig]) db[v.sig] = ch; }
  }
  if (applyFixes) { const f = rd(FIXES);
    for (const [listFile, charFile, key] of [['vocab.json', 'vocab_chars.json', 'vocab'], ['subvocab.json', 'subvocab_chars.json', 'subvocab']]) {
      const list = rd(path.join(WORK, listFile));
      for (const v of list) { const ch = (f[key] || {})[String(v.id)]; if (ch) db[v.sig] = ch; }
    }
  }
  return db;
}
function decodeSheet(stem, db) {
  const dat = fs.readFileSync(path.join(WORK, 'import', stem + '.orig.dat'));
  const sheet = fs.readFileSync(path.join(WORK, 'import', stem + '.orig.dds'));
  const h = parseDDS(sheet); const cols = Math.floor(h.width / CW);
  const fd = parseFontdata(dat); const res = [];
  for (let i = 0; i < fd.count; i++) {
    const no = fd.entries[i].nameOff + 16; let e = no; while (e < dat.length && dat[e] !== 0) e++;
    const name = dat.toString('utf8', no, e);
    let text = '';
    try { for (const g of readPayload(dat, fd.entries[i].dataOff + 16).glyphs) { const c = db[sigAt(sheet, h.dataOffset, h.width, g, cols)]; text += (c || '\u25c7'); } } catch (x) { text = '<ERR>'; }
    res.push({ name, text });
  }
  return res;
}
function report() {
  const f = rd(FIXES);
  const tpl = rd(path.join(WORK, 'chap_templates.json'));
  // corrected cell signatures that actually change the decode: a template match
  // always wins over vocab, so skip sigs the template already spells correctly.
  const fixSigs = new Set();
  for (const [listFile, key] of [['vocab.json', 'vocab'], ['subvocab.json', 'subvocab']]) {
    const list = rd(path.join(WORK, listFile));
    for (const v of list) { const ch = (f[key] || {})[String(v.id)]; if (ch && tpl[v.sig] !== ch) fixSigs.add(v.sig); }
  }
  const db = loadDb(true);
  const dir = path.join(WORK, 'import');
  const stems = fs.readdirSync(dir).filter(x => x.endsWith('.orig.dat')).map(x => x.replace('.orig.dat', ''));
  let records = 0, affected = 0, cellsFixed = 0;
  const lines = [];
  for (const stem of stems) {
    if (!fs.existsSync(path.join(dir, stem + '.orig.dds'))) continue;
    const dat = fs.readFileSync(path.join(dir, stem + '.orig.dat'));
    const sheet = fs.readFileSync(path.join(dir, stem + '.orig.dds'));
    const h = parseDDS(sheet); const cols = Math.floor(h.width / CW);
    const fd = parseFontdata(dat);
    for (let i = 0; i < fd.count; i++) {
      records++;
      const no = fd.entries[i].nameOff + 16; let e = no; while (e < dat.length && dat[e] !== 0) e++;
      const name = dat.toString('utf8', no, e);
      let text = '', hits = 0;
      try { for (const g of readPayload(dat, fd.entries[i].dataOff + 16).glyphs) { const sig = sigAt(sheet, h.dataOffset, h.width, g, cols); if (fixSigs.has(sig)) hits++; const c = db[sig]; text += (c || '\u25c7'); } } catch (x) { text = '<ERR>'; }
      if (hits) { affected++; cellsFixed += hits; lines.push(`${stem} :: ${name}  (${hits} fixed cell${hits > 1 ? 's' : ''})\n  ${text}`); }
    }
  }
  fs.writeFileSync(path.join(WORK, 'jp_audit_report.txt'), `# records whose Japanese original contained a mis-transcribed glyph\n# corrected cells: ${fixSigs.size}   affected records: ${affected} / ${records}\n\n` + lines.join('\n') + '\n', 'utf8');
  console.log('sheets:', stems.length, ' records:', records, ' fixed cells:', fixSigs.size, ' affected records:', affected, ' occurrences:', cellsFixed);
  console.log('report -> work/jp_audit_report.txt');
  for (const l of lines.slice(0, 40)) console.log(l);
}

// ---- todo: affected records mapped to their draft entries (for re-translation)
function sigSet() {
  const f = rd(FIXES), tpl = rd(path.join(WORK, 'chap_templates.json')), s = new Set();
  for (const [lf, key] of [['vocab.json', 'vocab'], ['subvocab.json', 'subvocab']]) {
    for (const v of rd(path.join(WORK, lf))) { const ch = (f[key] || {})[String(v.id)]; if (ch && tpl[v.sig] !== ch) s.add(v.sig); }
  }
  return s;
}
function decodeRecords(sheet, dat) {
  const h = parseDDS(sheet); const cols = Math.floor(h.width / CW); const fd = parseFontdata(dat); const recs = [];
  for (let i = 0; i < fd.count; i++) {
    const no = fd.entries[i].nameOff + 16; let e = no; while (e < dat.length && dat[e] !== 0) e++;
    const name = dat.toString('utf8', no, e); let sigs = [];
    try { sigs = readPayload(dat, fd.entries[i].dataOff + 16).glyphs; } catch (x) { }
    recs.push({ name, sigs });
  }
  return { cols, dataOffset: h.dataOffset, width: h.width, recs };
}
function channelDefs() {
  const cdat = fs.readFileSync(`${__P.DISC}/common.dat`);
  const cidx = parseHed(fs.readFileSync(`${__P.DISC}/common.hed`));
  const out = [];
  for (let i = 1; i <= 25; i++) {
    const tag = 's' + String(i).padStart(2, '0');
    const ch = cidx.entries.find(e => e.name === tag + '.hed'); if (!ch) continue;
    const idx = parseHed(cdat.subarray(ch.off, ch.off + ch.size));
    const ddsE = idx.entries.find(x => x.name.endsWith(tag + '0.dds')), datE = idx.entries.find(x => x.name.endsWith(tag + '0.dat'));
    if (!ddsE || !datE) continue;
    const dbuf = fs.readFileSync(`${__P.DISC}/${tag}.dat`);
    out.push({ draftFile: `zh_draft_chapter_${tag}.json`, sheet: dbuf.subarray(ddsE.off, ddsE.off + ddsE.size), dat: dbuf.subarray(datE.off, datE.off + datE.size) });
  }
  for (const e of cidx.entries) {
    const mm = /^(hud\/movie\/ep(\d+)_cp\d+|hud\/launcher\/jimaku\/archive_\d+)\.dds$/.exec(e.name); if (!mm) continue;
    const stem = e.name.replace(/\.dds$/, ''); const datE = cidx.entries.find(x => x.name === stem + '.dat'); if (!datE) continue;
    out.push({ draftFile: mm[1].startsWith('hud/movie/') ? `zh_draft_ep${mm[2]}.json` : 'zh_draft_archive.json', sheet: cdat.subarray(e.off, e.off + e.size), dat: cdat.subarray(datE.off, datE.off + datE.size) });
  }
  return out;
}
function todo() {
  const fix = sigSet(); const db = loadDb(true);
  const drafts = {}; const getDraft = f => drafts[f] || (drafts[f] = rd(path.join(WORK, f)));
  const lines = []; let n = 0;
  for (const ch of channelDefs()) {
    let d; try { d = decodeRecords(ch.sheet, ch.dat); } catch (e) { continue; }
    const dr = getDraft(ch.draftFile); const byName = {}; (dr.lines || []).forEach(l => { if (byName[l.name] === undefined) byName[l.name] = l; });
    for (const r of d.recs) {
      let hits = 0, text = '';
      for (const g of r.sigs) { const sig = sigAt(ch.sheet, d.dataOffset, d.width, g, d.cols); if (fix.has(sig)) hits++; text += db[sig] || '\u25c7'; }
      if (!hits) continue;
      const l = byName[r.name];
      lines.push([ch.draftFile, r.name, hits, l ? l.text : '', text].map(x => String(x).replace(/\t/g, ' ').replace(/\r?\n/g, '\\n')).join('\t'));
      n++;
    }
  }
  fs.writeFileSync(path.join(WORK, 'jp_retranslate.tsv'), 'draft\tname\thits\told_zh\tnew_jp\n' + lines.join('\n') + '\n', 'utf8');
  console.log('affected draft entries:', n, '-> work/jp_retranslate.tsv');
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'montage') montage(args[0] || 'vocab', +(args[1] || 0), +(args[2] || 48), +(args[3] || 6), +(args[4] || 5));
else if (cmd === 'apply') apply(args[0]);
else if (cmd === 'report') report();
else if (cmd === 'todo') todo();
else { console.log('usage: node _jpaudit.js montage [vocab|subvocab] [start] [count] [cols] [scale]'); console.log('       node _jpaudit.js apply [fixes.json]'); console.log('       node _jpaudit.js report'); console.log('       node _jpaudit.js todo'); process.exit(1); }
