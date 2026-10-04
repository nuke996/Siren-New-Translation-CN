// Rewrite FONTDATA message records in place (same file size, no offset changes).
//
// Strategy: each record = [header (up to and including the FF FD 18 1C FF FC + u16 tail)]
//           + [u16 stream ending with 0xFFFF].
// A new stream is written from the record start; the remaining bytes of the original
// record are padded with 0xFFFF (extra terminators are harmless). No offsets move and
// the file keeps its exact original size -> nothing else in the archive needs updating.
//
// usage: node msgwrite.js <in.dat> <edit.json> <out.dat> <newmap.json>
//
// edit.json = {
//   "map": "s010_map.json",             // existing glyph->char table (for reuse)
//   "extra": { "调": 252, ... },        // newly injected characters -> cell index
//   "edits": [ { "name":"AC_CHECK", "style":0, "text":"调查" }, ... ]
// }   style: 0 = "【" prompt, 2 = long-press icon, null = none
'use strict';
const fs = require('fs');
const { parseFontdata } = require('./msgdecode.js');
function readCStr(b, off) { let e = off; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', off, e); }

const [, , inPath, editPath, outPath, mapOut] = process.argv;
if (!inPath || !editPath || !outPath) {
  console.log('usage: node msgwrite.js <in.dat> <edit.json> <out.dat> [newmap.json]');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(editPath, 'utf8'));
const map = JSON.parse(fs.readFileSync(spec.map, 'utf8'));
const glyphsArr = map.glyphs.slice();
// char -> cell lookup: original map first, then extra
const charCell = new Map();
glyphsArr.forEach((c, i) => { if (c && !charCell.has(c)) charCell.set(c, i); });
for (const [c, cell] of Object.entries(spec.extra || {})) charCell.set(c, cell);

const buf = fs.readFileSync(inPath);
const fd = parseFontdata(buf);
const MARK = Buffer.from('fffd181cfffc', 'hex');

function findHeaderEnd(abs, limit) {
  const idx = buf.indexOf(MARK, abs);
  if (idx < 0 || idx > limit) throw new Error('marker not found for record @' + abs);
  return idx + MARK.length + 2; // + trailing u16
}
function recordEnd(abs) {
  for (let p = abs; p + 1 < buf.length; p += 2) if (buf.readUInt16BE(p) === 0xffff) return p + 2;
  return buf.length;
}

const out = Buffer.from(buf);
// record ranges (assume contiguous / derived from offsets, same as fd_layout)
// NOTE: the name string block is stored AFTER the last data record, so every
// record's range must be capped at the name-table start, otherwise padding the
// last record would overwrite the names with 0xFF.
const nameStart = Math.min(...fd.entries.map(e => e.nameOff + 16));
const abs = fd.entries.map(e => e.dataOff + 16);
const order = abs.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
const endOf = new Map();
order.forEach((o, k) => endOf.set(o.i, Math.min(k + 1 < order.length ? order[k + 1].a : buf.length, nameStart)));

// Glyph advance in px, derived from single-segment (flag 0x0101) records, where the
// header width equals adv * glyphCount exactly. Avoids hard-coding the metric.
let ADV = 22;
{
  const cands = [];
  for (let i = 0; i < fd.count; i++) {
    const s = abs[i], e = endOf.get(i);
    if (buf.readUInt16BE(s) !== 0x0101) continue;
    let h;
    try { h = findHeaderEnd(s, e); } catch (err) { continue; }
    let oc = 0;
    for (let p = h; p + 1 < e; p += 2) { const v = buf.readUInt16BE(p); if (v === 0xffff) break; if (v < 0xff00) oc++; }
    if (oc >= 4) cands.push(buf.readUInt16BE(s + 2) / oc);
  }
  if (cands.length) { cands.sort((a, b) => a - b); ADV = Math.round(cands[Math.floor(cands.length / 2)]); }
}

let applied = 0;
// Records are matched to edits by name.  Several records may share a name (the
// drafts list one line per record), so assign same-name edits to same-name
// records IN ORDER; otherwise only the first record of each name would ever be
// rewritten and the rest would keep their Japanese text.
const byName = new Map();
for (let i = 0; i < fd.count; i++) {
  const n = readCStr(buf, fd.entries[i].nameOff + 16);
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(i);
}
const cursor = new Map();
for (const ed of spec.edits) {
  const list = byName.get(ed.name);
  if (!list) throw new Error('record not found: ' + ed.name);
  const c = cursor.get(ed.name) || 0;
  if (c >= list.length) console.log(`  ! ${ed.name}: ${c + 1} edits but only ${list.length} records`);
  const ri = list[Math.min(c, list.length - 1)];
  cursor.set(ed.name, c + 1);
  const start = abs[ri], end = endOf.get(ri);
  const hdrEnd = findHeaderEnd(start, end);
  const total = end - start;
  const hdrLen = hdrEnd - start;

  // A record may carry several text segments (display lines). `ed.segments` holds
  // them; `ed.text` (segments joined by "\n") is accepted as a fallback. The
  // original on-disc layout for a multi-segment subtitle/message is:
  //   header: u16 flag=(N<<8)|low | u16 w1 .. u16 wN | FF FD 18 1C FF FC | u16 w1
  //   body:   seg1 | (FF FE FF FC | u16 wi | segi) ... | FF FF
  // where wi = 22 * len(segi). A single segment keeps the compact 0x0101 header.
  const segs = (Array.isArray(ed.segments) && ed.segments.length) ? ed.segments : [ed.text];
  const styleLess = (ed.style === null || ed.style === undefined);

  const parts = [];
  if (!styleLess) {
    const b = Buffer.alloc(4); b.writeUInt16BE(0xfffb, 0); b.writeUInt16BE(ed.style, 2); parts.push(b);
  }
  for (let si = 0; si < segs.length; si++) {
    if (si > 0) {
      const sep = Buffer.alloc(6);
      sep.writeUInt16BE(0xfffe, 0); sep.writeUInt16BE(0xfffc, 2);
      sep.writeUInt16BE(ADV * segs[si].length, 4);
      parts.push(sep);
    }
    for (const ch of segs[si]) {
      const cell = charCell.get(ch);
      if (cell === undefined) throw new Error(`no glyph for "${ch}" (record ${ed.name})`);
      const b = Buffer.alloc(2); b.writeUInt16BE(cell, 0); parts.push(b);
    }
  }
  const term = Buffer.alloc(2); term.writeUInt16BE(0xffff, 0); parts.push(term);
  const body = Buffer.concat(parts);

  // Header / width fields. Styled system strings keep their original header.
  let hdr = buf.subarray(start, hdrEnd);
  let newHdrLen = hdrLen;
  if (styleLess) {
    const origFlag = buf.readUInt16BE(start);
    const origN = origFlag >> 8;                        // original width-field count
    const lowByte = origFlag & 0xff;                    // record-class byte (preserve)
    if (segs.length <= 1) {
      const w = ADV * segs[0].length;
      const ctrl = hdr.subarray(2 * (origN + 1));       // FFFD op FFFC tailA
      hdr = Buffer.alloc(4 + ctrl.length);
      hdr.writeUInt16BE(0x0101, 0);                     // one line, one width field
      hdr.writeUInt16BE(w, 2);
      ctrl.copy(hdr, 4);
      hdr.writeUInt16BE(w, hdr.length - 2);
      newHdrLen = hdr.length;
    } else {
      hdr = Buffer.alloc(2 * segs.length + 10);         // flag + N widths + MARK + tail
      hdr.writeUInt16BE((segs.length << 8) | lowByte, 0);
      for (let si = 0; si < segs.length; si++) hdr.writeUInt16BE(ADV * segs[si].length, 2 + 2 * si);
      MARK.copy(hdr, 2 + 2 * segs.length);
      hdr.writeUInt16BE(ADV * segs[0].length, 2 + 2 * segs.length + MARK.length);
      newHdrLen = hdr.length;
    }
  }
  if (newHdrLen + body.length > total) throw new Error(`record ${ed.name} too small: need ${newHdrLen + body.length}, have ${total}`);
  // pad to original record length with 0xFFFF terminators
  const pad = Buffer.alloc(total - newHdrLen - body.length, 0xff);
  const rec = Buffer.concat([hdr, body, pad]);
  rec.copy(out, start);
  console.log(`[${ri}] ${ed.name}: ${total}B -> body ${body.length}B (hdr ${hdrLen}), padded ${pad.length}B`);
  applied++;
}
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${out.length} B, same size: ${out.length === buf.length})`);

if (mapOut) {
  const nm = JSON.parse(JSON.stringify(map));
  while (nm.glyphs.length < glyphsArr.length) nm.glyphs.push('');
  for (let i = 0; i < nm.glyphs.length; i++) if (nm.glyphs[i] === undefined) nm.glyphs[i] = '';
  for (const [c, cell] of Object.entries(spec.extra || {})) {
    while (nm.glyphs.length <= cell) nm.glyphs.push('');
    nm.glyphs[cell] = c;
  }
  fs.writeFileSync(mapOut, JSON.stringify(nm, null, 2));
  console.log(`wrote ${mapOut}`);
}