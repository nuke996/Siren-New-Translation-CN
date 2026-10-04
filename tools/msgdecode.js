// FONTDATA message decoder for SIREN: New Translation (PS3, BCJS30020)
// Decodes a .dat (FONTDATA) using a glyph-index -> character map (JSON).
//
// FONTDATA layout:
//   magic "FONTDATA"(8) | u32 ver | u32 count | count*(u32 nameOff,u32 dataOff)
//   nameOff / dataOff are RELATIVE TO BASE 16  -> absolute = value + 16
//   record body: 01 01 | u16 A | FF FD 18 1C FF FC | u16 A | u16 sequence ... 0xFFFF
//   sequence items are glyph indices; control codes are >= 0xFF00
//
// usage: node msgdecode.js <msg.dat> <map.json> [out.txt]
const fs = require('fs');

function parseFontdata(buf) {
  if (buf.toString('ascii', 0, 8) !== 'FONTDATA') throw new Error('not FONTDATA');
  const count = buf.readUInt32BE(12);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const p = 16 + i * 8;
    const nameOff = buf.readUInt32BE(p);
    const dataOff = buf.readUInt32BE(p + 4);
    entries.push({ nameOff, dataOff });
  }
  return { count, entries };
}

function readCStr(buf, off) {
  let e = off; while (e < buf.length && buf[e] !== 0) e++;
  return buf.toString('utf8', off, e);
}

const MARK = Buffer.from('fffd181cfffc', 'hex');

// Parse one record payload (starting at absolute offset abs).
//   header: u16 flag | u16 A | [u16 B (only when flag==0x0201)] | FF FD 18 1C FF FC | u16 tailA
//   -> 12 bytes for flag 0x0101, 14 bytes for flag 0x0201. Locate the 6-byte MARK
//      so both header lengths parse correctly (the fixed 12-byte form mis-read the
//      tailA width field of 0x0201 records as a glyph index).
//   then a stream of u16:
//     0xFFFF              = end of message
//     0xFFFB <u16 style>  = "prompt style"   0 = normal ("【"), 2 = long-press icon
//     0xFFF*               = other control (formatting); ignored
//     other               = glyph index
// Returns { style, glyphs:[...] }
function readPayload(buf, abs) {
  const mi = (abs >= 0 && abs + 2 <= buf.length) ? buf.indexOf(MARK, abs) : -1;
  let p = (mi >= 0 && mi - abs <= 20) ? mi + MARK.length + 2 : abs + 2 + 2 + 6 + 2;
  // Two-segment records (flag 0x0201) carry an extra header u16 B and place an inline
  // copy of that width value inside the body, right after segment 1 (A/22 glyphs).
  // It is a layout value, not a glyph index -> skip it or it decodes as an out-of-range ◇.
  const flag = buf.readUInt16BE(abs);
  const isTwo = flag === 0x0201 && abs + 6 <= buf.length;
  const seg1 = isTwo ? Math.round(buf.readUInt16BE(abs + 2) / 22) : -1;
  const B2 = isTwo ? buf.readUInt16BE(abs + 4) : -1;
  let style = null, emitted = 0, markerDone = false;
  const out = [];
  while (p + 1 < buf.length) {
    const v = buf.readUInt16BE(p); p += 2;
    if (v === 0xffff) break;
    if (v === 0xfffb) {                  // prompt-style control + operand
      style = buf.readUInt16BE(p); p += 2;
      continue;
    }
    if (v >= 0xff00) continue;           // other controls
    if (isTwo && !markerDone && emitted === seg1 && v === B2) { markerDone = true; continue; }
    out.push(v); emitted++;
  }
  return { style, glyphs: out };
}

// keep a glyph-only view for callers that don't care about style
function readGlyphs(buf, abs) { return readPayload(buf, abs).glyphs; }

const STYLE_PREFIX = { 0: '【', 2: '\u3008长按\u3009' };  // engine-drawn prompt markers

function decodeBody(buf, abs, glyphs) {
  const { style, glyphs: idx } = readPayload(buf, abs);
  let s = STYLE_PREFIX[style] !== undefined ? STYLE_PREFIX[style] : '';
  for (const g of idx) {
    const c = glyphs[g];
    s += (c === undefined || c === '' ? '\ufffd' : c);
  }
  return s;
}

function main() {
  const [datPath, mapPath, outPath] = process.argv.slice(2);
  if (!datPath || !mapPath) { console.log('usage: node msgdecode.js <msg.dat> <map.json> [out.txt]'); process.exit(1); }
  const buf = fs.readFileSync(datPath);
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const glyphs = map.glyphs;
  const fd = parseFontdata(buf);
  const lines = [`# ${datPath}  count=${fd.count}  sheet=${map.sheet} (${map.cols}x${map.cellW}x${map.cellH})`, ''];
  for (let i = 0; i < fd.count; i++) {
    const e = fd.entries[i];
    const nameAbs = e.nameOff + 16;
    const dataAbs = e.dataOff + 16;
    const name = readCStr(buf, nameAbs);
    let text = '';
    try { text = decodeBody(buf, dataAbs, glyphs); } catch (err) { text = '<ERR ' + err.message + '>'; }
    lines.push(`[${i}] ${name}`);
    lines.push(text);
    lines.push('');
  }
  const out = lines.join('\n');
  if (outPath) { fs.writeFileSync(outPath, out); console.log(`wrote ${outPath} (${fd.count} messages)`); }
  else console.log(out);
}

if (require.main === module) { try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); } }
module.exports = { parseFontdata, readPayload, readGlyphs, decodeBody };