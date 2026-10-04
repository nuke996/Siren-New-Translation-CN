#!/usr/bin/env node
const __P = require('./_config.js');
// Import Chinese drafts into one movie/archive subtitle sheet stored in common.dat.
//
// Pipeline per sheet: build cell->char map -> collect target texts -> allocate cells
// for new glyphs -> render+inject glyphs (glyphgen) -> rewrite messages (msgwrite) ->
// emit new .dat/.dds. Packing/deploy is done separately (sntp_pack.js).
//
// usage: node importsheet.js <stem>            # stem e.g. hud/movie/ep02_cp1
//        node importsheet.js --all             # process every movie sheet that has a draft
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');

const BASE = process.env.SNT_BASE || `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const TOOLS = `${__P.TOOLS}`;
const OUT = path.join(WORK, 'import');
const CELL_W = 24, CELL_H = 28, BLKW = 6, BLKH = 7;
const MARK = Buffer.from('fffd181cfffc', 'hex');
const FONT = 'SimHei', FONTSIZE = 20;

// ---------- DB ----------
function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
  const add = (names, chars) => {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(WORK, names), 'utf8'));
      const c = JSON.parse(fs.readFileSync(path.join(WORK, chars), 'utf8'));
      for (const it of v) { const ch = c[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; }
    } catch (e) { }
  };
  add('vocab.json', 'vocab_chars.json');
  add('subvocab.json', 'subvocab_chars.json');
  return db;
}

// ---------- helpers ----------
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }
function cellSig(buf, dataOffset, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dataOffset + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function parseFontdata(buf) {
  const count = buf.readUInt32BE(12);
  const entries = [];
  for (let i = 0; i < count; i++) { const p = 16 + i * 8; entries.push({ nameOff: buf.readUInt32BE(p), dataOff: buf.readUInt32BE(p + 4) }); }
  return { count, entries };
}
function headerEnd(buf, abs) {                        // after MARK + trailing u16
  const i = buf.indexOf(MARK, abs);
  if (i < 0) throw new Error('marker not found @' + abs);
  return i + MARK.length + 2;
}
function readMsg(buf, abs) {                          // returns {style, glyphs}
  // Two-segment records (flag 0x0201): skip the inline copy of header width B that
  // sits in the body after segment 1 (A/22 glyphs); it is a layout value, not a glyph.
  const flag = buf.readUInt16BE(abs);
  const isTwo = flag === 0x0201;
  const seg1 = isTwo ? Math.round(buf.readUInt16BE(abs + 2) / 22) : -1;
  const B2 = isTwo ? buf.readUInt16BE(abs + 4) : -1;
  let p = headerEnd(buf, abs), style = null, emitted = 0, markerDone = false; const out = [];
  while (p + 1 < buf.length) {
    const v = buf.readUInt16BE(p); p += 2;
    if (v === 0xffff) break;
    if (v === 0xfffb) { style = buf.readUInt16BE(p); p += 2; continue; }
    if (v >= 0xff00) continue;
    if (isTwo && !markerDone && emitted === seg1 && v === B2) { markerDone = true; continue; }
    out.push(v); emitted++;
  }
  return { style, glyphs: out };
}
const CJK = /[\u4e00-\u9fff]/;

// ---------- main per-sheet ----------
// container: null -> movie/archive sheet inside common.dat
//            'sNN' -> chapter sheet sNN0 inside sNN.dat (index = embedded sNN.hed in common.dat)
function openContainer(chapter) {
  const cdat = fs.readFileSync(BASE + 'common.dat');
  const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
  if (!chapter) return { cidx, datBuf: cdat };
  const ch = cidx.entries.find(e => e.name === chapter + '.hed');
  if (!ch) throw new Error('chapter index not found: ' + chapter);
  return { cidx: parseHed(cdat.subarray(ch.off, ch.off + ch.size)), datBuf: fs.readFileSync(BASE + chapter + '.dat') };
}

function importSheet(stem, chapter) {
  const { cidx, datBuf } = openContainer(chapter);
  const ddsE = cidx.entries.find(e => e.name.endsWith(stem + '.dds'));
  const datE = cidx.entries.find(e => e.name.endsWith(stem + '.dat'));
  if (!ddsE || !datE) throw new Error('entry not found: ' + stem);
  const db = loadDb();

  const sheet = Buffer.from(datBuf.subarray(ddsE.off, ddsE.off + ddsE.size));
  const hdr = parseDDS(sheet);
  const cols = Math.floor(hdr.width / CELL_W), rows = Math.floor(hdr.height / CELL_H);
  const N = cols * rows;
  const glyphs = new Array(N).fill('');
  const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
  const blank = new Array(N).fill(false);
  for (let c = 0; c < N; c++) {
    const col = c % cols, row = Math.floor(c / cols);
    const sig = cellSig(sheet, hdr.dataOffset, hdr.width, col, row);
    if (db[sig]) glyphs[c] = db[sig];
    else {
      let mx = 0;
      for (let y = 0; y < CELL_H && mx < 40; y++) for (let x = 0; x < CELL_W; x++) {
        const i = (((row * CELL_H + y) * hdr.width) + (col * CELL_W + x)) * 4;
        if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) { mx = 40; break; }
      }
      blank[c] = mx < 40;
    }
  }

  // ---- messages ----
  const mbuf = Buffer.from(datBuf.subarray(datE.off, datE.off + datE.size));
  const fd = parseFontdata(mbuf);
  const nameStart = Math.min(...fd.entries.map(e => e.nameOff + 16));   // names live after the data records
  const abs = fd.entries.map(e => e.dataOff + 16);
  const order = abs.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
  const endOf = new Map();
  order.forEach((o, k) => endOf.set(o.i, Math.min(k + 1 < order.length ? order[k + 1].a : mbuf.length, nameStart)));
  const msgs = [];
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(mbuf, fd.entries[i].nameOff + 16);
    const { style, glyphs: idx } = readMsg(mbuf, abs[i]);
    msgs.push({ i, name, style, idx, start: abs[i], end: endOf.get(i), hdrEnd: headerEnd(mbuf, abs[i]) });
  }

  // ---- target texts ----
  const common = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_common.json'), 'utf8'));
  const targets = new Map();
  if (common.templates && common.templates.ARCHIVE_ADDED) {
    const keys = Object.keys(common.archive_names);
    for (let n = 1; n <= keys.length; n++) {
      const zh = common.archive_names[keys[n - 1]];
      targets.set('ARCHIVE' + String(n).padStart(3, '0'), common.templates.ARCHIVE_ADDED.replace('{item}', zh));
    }
    if (common.archive_episodes) {
      for (const [name, zh] of Object.entries(common.archive_episodes))
        targets.set(name, common.templates.ARCHIVE_ADDED.replace('{item}', zh));
    }
  }
  if (chapter) {
    const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_chapter_' + chapter + '.json'), 'utf8'));
    for (const ln of d.lines) targets.set(ln.name, ln.text);
  } else {
    const m = /^hud\/movie\/ep(\d+)_cp/.exec(stem);
    if (m) {
      const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_ep' + m[1] + '.json'), 'utf8'));
      for (const ln of d.lines) targets.set(ln.name, ln.text);
    } else if (/^hud\/launcher\/jimaku\/archive_\d+$/.test(stem)) {
      const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_archive.json'), 'utf8'));
      for (const ln of d.lines) targets.set(ln.name, ln.text);
    } else if (stem === 'hud/launcher/label') {
      const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_label.json'), 'utf8'));
      for (const ln of d.lines) targets.set(ln.name, ln.text);
    }
  }
  // archive document sheets reuse the archive name only (body not drafted yet) -> skip if no match

  // ---- build edits ----
  const clean = s => s.replace(/[\u25c7\u203b]/g, '');            // drop ◇ / ※ annotations
  const styleLessOf = style => (style === null || style === undefined);
  // A draft text may contain "\n" to mark the display line breaks the original
  // record had. Multi-segment style-less records use the A/B width-field layout
  // (header = 2N+10 B, body adds one FFFE FFFC + width separator per extra segment).
  const hdrBytes = (style, segs, msg) => styleLessOf(style) ? (2 * segs.length + 10) : (msg.hdrEnd - msg.start);
  const bodyBytes = (style, segs) => (styleLessOf(style) ? 0 : 4)
    + 2 * segs.reduce((a, s) => a + s.length, 0) + (segs.length - 1) * 6 + 2;
  const fitBytes = (style, segs, msg) => hdrBytes(style, segs, msg) + bodyBytes(style, segs);
  let edits = [];
  let skippedNoTarget = 0, skippedNoText = 0, multiSeg = 0, multiDowngraded = 0;
  const fitFail = [];
  for (const msg of msgs) {
    if (!targets.has(msg.name)) { skippedNoTarget++; continue; }
    let text = clean(targets.get(msg.name));
    if (msg.style === 0 && text.startsWith('\u3010')) text = text.slice(1);
    if (msg.style === 2 && text.startsWith('\u3008')) { const k = text.indexOf('\u3009'); if (k >= 0) text = text.slice(k + 1); }
    if (msg.style === 2 && text.startsWith('\u957f\u6309')) text = text.slice(2).replace(/^[ \u3000]+/, '');
    if (!text.length) { skippedNoText++; continue; }
    const slot = msg.end - msg.start;
    const styleLess = styleLessOf(msg.style);
    let segs = styleLess ? text.split('\n').filter(s => s.length) : [text];
    if (!segs.length) { skippedNoText++; continue; }
    if (fitBytes(msg.style, segs, msg) > slot) {
      // Restored multi-line layout does not fit: tighten, then collapse to one
      // line (previous behaviour) before giving up so nothing regresses.
      const tightSegs = segs.map(s => s.replace(/[ \u3000]/g, ''));
      const one = [segs.join('').replace(/[ \u3000]/g, '')];
      let chosen = null;
      if (fitBytes(msg.style, tightSegs, msg) <= slot) chosen = tightSegs;
      else if (fitBytes(msg.style, one, msg) <= slot) chosen = one;
      if (!chosen) { fitFail.push(`${msg.name}: need ${fitBytes(msg.style, segs, msg)} have ${slot} :: ${text}`); continue; }
      if (segs.length > 1 && chosen.length === 1) multiDowngraded++;
      segs = chosen;
    }
    if (segs.length > 1) multiSeg++;
    edits.push({ name: msg.name, style: msg.style, text: segs.join(''), segments: segs, srcMsg: msg });
  }

  // ---- cell allocation ----
  const charCell = new Map();
  glyphs.forEach((c, i) => { if (c && !charCell.has(c)) charCell.set(c, i); });
  const isSpace = c => c === ' ' || c === '\u3000';
  const analyze = ed => {
    const needed = new Set();
    for (const x of ed) for (const c of x.text) needed.add(c);
    const protectedCells = new Set();
    const editedNames = new Set(ed.map(x => x.name));
    for (const msg of msgs) if (!editedNames.has(msg.name)) for (const g of msg.idx) protectedCells.add(g);
    const newChars = [...needed].filter(c => !charCell.has(c));
    const keepCells = new Set();
    for (const c of needed) { const cell = charCell.get(c); if (cell !== undefined) keepCells.add(cell); }
    const renderCharsList = newChars.filter(c => !isSpace(c));
    const spaceChars = newChars.filter(isSpace);
    const avail = [];
    for (let c = 0; c < N; c++) if (!protectedCells.has(c) && !keepCells.has(c) && blank[c]) avail.push(c);
    for (let c = 0; c < N; c++) if (!protectedCells.has(c) && !keepCells.has(c) && !blank[c]) avail.push(c);
    return { needed, protectedCells, newChars, keepCells, renderCharsList, spaceChars, avail };
  };
  // Cell budget: the atlas holds a fixed 378 cells. A needed glyph either reuses an
  // existing cell (keepCells) or must be rendered into a free cell. Free cells are
  // 378 - (cells still referenced by un-edited messages) - keepCells. Dropping a
  // message does NOT free cells (its cells merely become protected again), so we
  // never auto-drop; an over-budget sheet is reported so the translations can be
  // shortened instead.
  const capSkip = [];
  const a = analyze(edits);
  if (a.newChars.length > a.avail.length) {
    if (fitFail.length) {
      console.log('  FIT-FAIL(' + fitFail.length + '):\n    ' + fitFail.join('\n    '));
      fs.writeFileSync(path.join(OUT, '_fitfail.txt'),
        (fs.existsSync(path.join(OUT, '_fitfail.txt')) ? fs.readFileSync(path.join(OUT, '_fitfail.txt'), 'utf8') : '') +
        fitFail.map(x => `[${stem}] ${x}`).join('\n') + '\n');
    }
    try {
      fs.mkdirSync(OUT, { recursive: true });
      const occ = {};
      for (const ed of edits) for (const ch of ed.text) { (occ[ch] = occ[ch] || new Set()).add(ed.name); }
      const dump = a.newChars.map(c => `${c}\t${(occ[c] || new Set()).size}\t${[...(occ[c] || [])].join(',')}`).join('\n');
      fs.writeFileSync(path.join(OUT, '_cap_' + stem.replace(/[^A-Za-z0-9_]+/g, '_') + '.txt'),
        `need=${a.newChars.length} avail=${a.avail.length} keep=${a.keepCells.size} protected=${a.protectedCells.size}\n`
        + `NEW(char\\t#msgs\\tnames):\n` + dump + '\n');
    } catch (e) { }
    throw new Error(`${stem}: need ${a.newChars.length} new glyph cells, only ${a.avail.length} free `
      + `(deficit ${a.newChars.length - a.avail.length}); un-edited messages still protect cells`);
  }
  const { needed, protectedCells, newChars, keepCells, renderCharsList, spaceChars, avail } = a;
  const totalNew = newChars.length;
  const extra = {};
  let ai = 0;
  const gcells = [];
  for (const c of renderCharsList) { const cell = avail[ai++]; extra[c] = cell; gcells.push({ char: c, cell }); }
  // Render the space cells too: a space may land on a free cell that still holds an
  // old glyph (e.g. a leftover Japanese kanji), so drawing the inkless space blanks
  // it. Reserving the cell without drawing previously leaked the old glyph (a lone
  // "役" appeared in the Ep1-Ch1 cutscene).
  for (const c of spaceChars) { const cell = avail[ai++]; extra[c] = cell; gcells.push({ char: c, cell }); }

  // Re-render reused glyphs in place too: some cells carry a WRONG decode-DB label
  // (e.g. a cell labelled 人 whose bitmap is ノ), so trusting the old bitmap would
  // leak the wrong shape into the subtitle. Their cells are kept anyway, so
  // overwriting them costs no extra space. Skip cells still used by an un-edited
  // (fit-fail) message so we don't clobber those.
  for (const c of needed) {
    const cell = charCell.get(c);
    if (cell === undefined || protectedCells.has(cell) || isSpace(c)) continue;
    gcells.push({ char: c, cell });
  }

  // reference for calibration: a shared kanji present in this sheet
  const prefer = ['\u5929', '\u65e5', '\u6751', '\u5927', '\u4eba', '\u5c71', '\u76ee', '\u624b'];
  let refChar = '', refCell = -1;
  for (const p of prefer) { const i = glyphs.indexOf(p); if (i >= 0) { refChar = p; refCell = i; break; } }
  if (refCell < 0) { for (let i = 0; i < N; i++) if (glyphs[i] && CJK.test(glyphs[i])) { refChar = glyphs[i]; refCell = i; break; } }
  if (refCell < 0) throw new Error(stem + ': no reference glyph');

  // ---- run glyphgen ----
  fs.mkdirSync(OUT, { recursive: true });
  const safe = stem.replace(/[^A-Za-z0-9_]+/g, '_');
  const origDds = path.join(OUT, safe + '.orig.dds');
  const newDds = path.join(OUT, safe + '.dds');
  fs.writeFileSync(origDds, sheet);
  const specPath = path.join(OUT, safe + '.glyphspec.json');
  fs.writeFileSync(specPath, JSON.stringify({
    font: FONT, size: FONTSIZE, bold: 0, sheet: origDds, out: newDds,
    hint: process.env.ZH_HINT || 'sbp',
    cols, cellW: CELL_W, cellH: CELL_H, refChar, refCell, cells: gcells
  }), 'utf8');
  execFileSync(process.execPath, [path.join(TOOLS, 'glyphgen.js'), 'build', specPath], { stdio: 'inherit' });

  // ---- run msgwrite ----
  const mapPath = path.join(OUT, safe + '.map.json');
  fs.writeFileSync(mapPath, JSON.stringify({ sheet: stem, cols, cellW: CELL_W, cellH: CELL_H, glyphs }, null, 1));
  const editPath = path.join(OUT, safe + '.edit.json');
  const inDat = path.join(OUT, safe + '.orig.dat');
  const outDat = path.join(OUT, safe + '.dat');
  fs.writeFileSync(inDat, mbuf);
  fs.writeFileSync(editPath, JSON.stringify({
    map: mapPath, extra,
    edits: edits.map(e => ({ name: e.name, style: e.style, text: e.text, segments: e.segments }))
  }), 'utf8');
  const mergedPath = path.join(OUT, safe + '.merged.json');
  execFileSync(process.execPath, [path.join(TOOLS, 'msgwrite.js'), inDat, editPath, outDat, mergedPath], { stdio: 'inherit' });

  // ---- report ----
  const overflows = [];
  for (const ed of edits) {
    const need = fitBytes(ed.style, ed.segments, ed.srcMsg);
    const room = ed.srcMsg.end - ed.srcMsg.start;
    if (need > room) overflows.push(`${ed.name}: need ${need} have ${room}`);
  }
  console.log(`\n[${stem}] grid ${cols}x${rows}  messages ${fd.count}  edits ${edits.length}`);
  console.log(`  cells: known ${glyphs.filter(Boolean).length}  blank ${blank.filter(Boolean).length}  protected ${protectedCells.size}  reusedChars ${charCell.size}`);
  console.log(`  new glyphs ${renderCharsList.length} + spaces ${spaceChars.length}  ; free cells ${avail.length}  ; ref "${refChar}"@${refCell}`);
  console.log(`  segments: multi ${multiSeg}, downgraded-to-one-line ${multiDowngraded}`);
  console.log(`  skipped: no-target ${skippedNoTarget}, empty ${skippedNoText}, fit-fail ${fitFail.length}, cap-drop ${capSkip.length}`);
  if (capSkip.length) {
    console.log('  CAP-DROP(' + capSkip.length + '): ' + capSkip.join(', '));
    fs.writeFileSync(path.join(OUT, '_capskip.txt'),
      (fs.existsSync(path.join(OUT, '_capskip.txt')) ? fs.readFileSync(path.join(OUT, '_capskip.txt'), 'utf8') : '') +
      `[${stem}] ` + capSkip.join(', ') + '\n');
  }
  if (overflows.length) console.log('  OVERFLOW(' + overflows.length + '):\n    ' + overflows.join('\n    '));
  if (fitFail.length) {
    console.log('  FIT-FAIL(' + fitFail.length + '):\n    ' + fitFail.join('\n    '));
    fs.writeFileSync(path.join(OUT, '_fitfail.txt'),
      (fs.existsSync(path.join(OUT, '_fitfail.txt')) ? fs.readFileSync(path.join(OUT, '_fitfail.txt'), 'utf8') : '') +
      fitFail.map(x => `[${stem}] ${x}`).join('\n') + '\n');
  }
  return { safe, edits: edits.length, newGlyphs: renderCharsList.length, overflows: overflows.length, fitFail: fitFail.length };
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--chapter' || args[0] === '--chapters') {
    let tags;
    if (args[0] === '--chapters') {
      tags = fs.readdirSync(WORK).filter(f => /^zh_draft_chapter_s\d+\.json$/.test(f))
        .map(f => f.replace(/^zh_draft_chapter_/, '').replace(/\.json$/, ''))
        .filter(t => fs.existsSync(BASE + t + '.dat'));
    } else tags = args.slice(1);
    try { fs.unlinkSync(path.join(OUT, '_fitfail.txt')); } catch (e) { }
    const results = [];
    for (const t of tags) {
      try { results.push(importSheet(t + '0', t)); }
      catch (e) { console.log(`[${t}] ERROR: ${e.message}`); }
    }
    console.log('\n== summary ==');
    console.log('chapters ok:', results.length, ' totalEdits:', results.reduce((a, r) => a + r.edits, 0),
      ' totalNewGlyphs:', results.reduce((a, r) => a + r.newGlyphs, 0),
      ' withOverflow:', results.filter(r => r.overflows).length,
      ' fitFail:', results.reduce((a, r) => a + r.fitFail, 0));
    return;
  }
  let stems;
  if (args[0] === '--all') {
    const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
    stems = cidx.entries.filter(e => /^hud\/movie\/ep\d+_cp\d+\.dat$/.test(e.name)).map(e => e.name.replace(/\.dat$/, ''));
    stems = [...new Set(stems)];
  } else stems = [args[0]];
  const results = [];
  if (args[0] === '--all') { try { fs.unlinkSync(path.join(OUT, '_fitfail.txt')); } catch (e) { } }
  for (const s of stems) {
    try { results.push(importSheet(s)); }
    catch (e) { console.log(`[${s}] ERROR: ${e.message}`); }
  }
  console.log('\n== summary ==');
  console.log('sheets ok:', results.length, ' totalEdits:', results.reduce((a, r) => a + r.edits, 0),
    ' totalNewGlyphs:', results.reduce((a, r) => a + r.newGlyphs, 0),
    ' sheetsWithOverflow:', results.filter(r => r.overflows).length,
    ' fitFail:', results.reduce((a, r) => a + r.fitFail, 0));
}
try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }