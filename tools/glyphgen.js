// Inject Chinese glyphs into a DXT1 glyph-sheet DDS (SIREN New Translation).
// - Renders each Chinese character with GDI+ (tools/render_text.ps1).
// - Self-calibrates placement by matching a reference kanji to the original cell.
// - Encodes each 24x28 cell as 6x7 DXT1 blocks (24 and 28 are both /4 aligned).
//
// usage:
//   node glyphgen.js calib <font> <char> <size,size,...>
//   node glyphgen.js build <spec.json>
//
// spec.json = {
//   font:"SimHei", size:20, bold:0,
//   sheet:"...s010.dds", out:"...s010_zh.dds", preview:"...s010_zh.png",
//   cols:21, cellW:24, cellH:28,
//   refChar:"調", refCell:29,
//   cells:[ {char:"调", cell:252}, ... ]
// }
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseDDS, decodeDXT1, writePNG } = require('./dds2png.js');
const __P = require('./_config.js');

// Spec paths (sheet/out/preview) may be relative; resolve against the workspace.
const resolvePath = (p) => (p && !path.isAbsolute(p)) ? path.join(__P.WORK, p) : p;
const PS1 = path.join(__dirname, 'render_text.ps1');
const TMP = path.join(__dirname, '..', 'work');
const DRAW = 20; // render_text.ps1 draws at (20,20)

function renderChars(font, size, bold, chars, hint) {
  const job = { font, size, bold, hint, width: 160, height: 160, lines: [] };
  const outs = [];
  chars.forEach((c, i) => {
    const o = path.join(TMP, `_g${i}.bmp`);
    outs.push(o);
    job.lines.push({ text: c, out: o });
  });
  const jp = path.join(TMP, '_glyphjob.json');
  fs.writeFileSync(jp, '\uFEFF' + JSON.stringify(job), 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jp], { stdio: 'inherit' });
  return outs;
}
function readBMP(p) {
  const b = fs.readFileSync(p);
  return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) };
}
function lum(bmp, x, y) {
  const h = Math.abs(bmp.rawH);
  const yy = bmp.rawH > 0 ? (h - 1 - y) : y;
  const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4;
  return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)];
}
function bbox(bmp, thresh) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) {
    if (lum(bmp, x, y) > thresh) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return [x0, y0, x1, y1];
}

// ---- DXT1 encode one 24x28 cell from a luminance getter (val 0..255) ----
function pack565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
function unpack565v(c) { return [(c >> 11) & 31, (c >> 5) & 63, c & 31]; }
// Returns an array of bwY buffers (one per block-row), each bwX blocks.
function encodeCellRows(lumAt, bwX, bwY) {
  // lumAt(px,py) -> 0..255 luminance within the cell
  const rows = [];
  for (let by = 0; by < bwY; by++) {
    const blocks = Buffer.alloc(bwX * 8);
    let o = 0;
    for (let bx = 0; bx < bwX; bx++) {
    let vals = [];
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) vals.push(lumAt(bx * 4 + px, by * 4 + py));
    let mx = Math.max(...vals), mn = Math.min(...vals);
    // use endpoints as gray 565
    let c0 = pack565(mx, mx, mx), c1 = pack565(mn, mn, mn);
    let modeGT = c0 > c1;
    if (!modeGT) { // ensure c0>c1 for 4-level opaque palette when there is variation
      if (mx > mn) { const t = c0; c0 = c1; c1 = t; modeGT = true; }
    }
    // palette
    const e0 = unpack565v(c0), e1 = unpack565v(c1);
    function toGray(v) { return ((v[0] << 3) | (v[0] >> 2)) * 0.299 + ((v[1] << 2) | (v[1] >> 4)) * 0.587 + ((v[2] << 3) | (v[2] >> 2)) * 0.114; }
    const g0 = toGray(e0), g1 = toGray(e1);
    let pal;
    if (modeGT) pal = [g0, g1, (g0 + 2 * g1) / 3, (2 * g0 + g1) / 3];
    else pal = [g0, g1, (g0 + g1) / 2, g0]; // c0==c1 (flat)
    let bits = 0;
    for (let i = 0; i < 16; i++) {
      let best = 0, bd = 1e9;
      for (let k = 0; k < 4; k++) { const d = Math.abs(vals[i] - pal[k]); if (d < bd) { bd = d; best = k; } }
      bits |= best << (i * 2);
    }
    blocks.writeUInt16LE(c0, o); o += 2;
    blocks.writeUInt16LE(c1, o); o += 2;
    blocks.writeUInt32LE(bits >>> 0, o); o += 4;
    }
    rows.push(blocks);
  }
  return rows;
}

function main() {
  const mode = process.argv[2];
  if (mode === 'calib') {
    const font = process.argv[3], ch = process.argv[4], sizes = process.argv[5].split(',').map(Number);
    for (const s of sizes) {
      const [o] = renderChars(font, s, 0, [ch]);
      const b = readBMP(o); const bb = bbox(b, 16);
      console.log(`${font} ${s}px "${ch}" ink=${bb[2] - bb[0] + 1}x${bb[3] - bb[1] + 1} bbox=[${bb[0]},${bb[1]}..${bb[2]},${bb[3]}] (draw origin ${DRAW},${DRAW})`);
    }
    return;
  }
  if (mode !== 'build') { console.log('usage: node glyphgen.js calib <font> <char> <sizes> | build <spec.json>'); process.exit(1); }

  const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const cols = spec.cols || 21, cw = spec.cellW || 24, chh = spec.cellH || 28;
  const raw = fs.readFileSync(resolvePath(spec.sheet));
  const hdr = parseDDS(raw);
  const strideBlocks = hdr.width / 4;

  // unique chars to render (refChar first)
  const chars = [spec.refChar, ...spec.cells.map(c => c.char)];
  const outs = renderChars(spec.font, spec.size, spec.bold, chars, spec.hint || 'sbp');
  const bmps = outs.map(readBMP);

  // reference calibration
  const rb = bbox(bmps[0], 16);
  const rd = decodeDXT1(raw, hdr.width, hdr.height, hdr.dataOffset);
  const rcol = spec.refCell % cols, rrow = Math.floor(spec.refCell / cols);
  let ox0 = 1e9, oy0 = 1e9;
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    const i = ((rrow * chh + y) * hdr.width + (rcol * cw + x)) * 4;
    const l = Math.round(0.299 * rd[i] + 0.587 * rd[i + 1] + 0.114 * rd[i + 2]);
    if (l > 40) { if (x < ox0) ox0 = x; if (y < oy0) oy0 = y; }
  }
  const CX = ox0 - rb[0] + DRAW, CY = oy0 - rb[1] + DRAW;
  console.log(`calib: rendered "${spec.refChar}" bbox=[${rb[0]},${rb[1]}..${rb[2]},${rb[3]}] ink=${rb[2] - rb[0] + 1}x${rb[3] - rb[1] + 1}`);
  console.log(`  original cell ${spec.refCell} top-left ink=(${ox0},${oy0}) -> cellOrigin=(CX=${CX},CY=${CY})`);

  const bwX = cw / 4, bwY = chh / 4;
  const out = Buffer.from(raw);
  spec.cells.forEach((c, k) => {
    const bmp = bmps[k + 1];
    const col = c.cell % cols, row = Math.floor(c.cell / cols);
    const rowsBlk = encodeCellRows((px, py) => {
      const sx = px - CX + DRAW, sy = py - CY + DRAW;
      if (sx < 0 || sy < 0 || sx >= bmp.w || sy >= Math.abs(bmp.rawH)) return 0;
      return lum(bmp, sx, sy);
    }, bwX, bwY);
    const start = hdr.dataOffset + ((row * bwY) * strideBlocks + col * bwX) * 8;
    for (let by = 0; by < bwY; by++) {
      rowsBlk[by].copy(out, start + by * strideBlocks * 8);
    }
    console.log(`  cell ${c.cell} (c${col},r${row}) <- "${c.char}" @byte ${start}`);
  });

  fs.writeFileSync(resolvePath(spec.out), out);
  console.log(`wrote ${spec.out} (${out.length} B)`);

  if (spec.preview) {
    const rgba = decodeDXT1(out, hdr.width, hdr.height, hdr.dataOffset);
    writePNG(resolvePath(spec.preview), hdr.width, hdr.height, rgba);
    console.log(`wrote preview ${spec.preview}`);
  }
}
main();