// Rebuild an 8-bit alpha-mask DDS (A8) by rendering Chinese text with GDI+.
//
// - Keeps the ORIGINAL DDS header byte-for-byte (so the engine's format
//   expectations are untouched) and only replaces the pixel data.
// - Each line is rendered to its own BMP by tools/render_text.ps1, its ink
//   bounding box is measured, and it is pasted left-aligned at targetY.
//
// usage: node build_mask.js <origDds> <spec.json> <outDds> [previewPng]
//
// spec.json = {
//   font:"SimHei", size:22, bold:1,
//   lines:[ {text:"...", y:0}, {text:"...", y:26}, ... ]
// }
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { writePNG } = require('./dds2png.js');

const [, , origDds, specPath, outDds, previewPng] = process.argv;
if (!origDds || !specPath || !outDds) {
  console.log('usage: node build_mask.js <origDds> <spec.json> <outDds> [previewPng]');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const orig = fs.readFileSync(origDds);
const W = orig.readUInt32LE(16), H = orig.readUInt32LE(12);
const bpp = orig.readUInt32LE(88);
if (bpp !== 8) throw new Error('expected 8-bit alpha DDS, got bpp=' + bpp);
const dataLen = W * H;
console.log(`orig DDS ${W}x${H} bpp=${bpp} dataLen=${dataLen} (file ${orig.length})`);

// 1) render each line to its own BMP
const tmpDir = path.dirname(specPath);
const job = { font: spec.font, size: spec.size, bold: spec.bold, width: 2048, height: 128, lines: [] };
spec.lines.forEach((ln, i) => {
  job.lines.push({ text: ln.text, out: path.join(tmpDir, `_line${i}.bmp`), size: ln.size });
});
const jobPath = path.join(tmpDir, '_render_job.json');
fs.writeFileSync(jobPath, '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  path.join(__dirname, 'render_text.ps1'), '-Job', jobPath], { stdio: 'inherit' });

// 2) BMP reader
function readBMP(p) {
  const b = fs.readFileSync(p);
  return {
    b,
    off: b.readUInt32LE(10),
    w: b.readInt32LE(18),
    rawH: b.readInt32LE(22),
    bpp: b.readUInt16LE(28),
  };
}
function lum(bmp, x, y) {
  const h = Math.abs(bmp.rawH);
  const yy = bmp.rawH > 0 ? (h - 1 - y) : y;
  const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4;
  return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)];
}

// 3) composite
// spec.keep=true  -> start from the original alpha data (preserve graphics/art)
// spec.clear=[{x,y,w,h}] -> zero those rectangles before pasting new text
const data = Buffer.alloc(dataLen, 0);
if (spec.keep) orig.subarray(128, 128 + dataLen).copy(data);
if (Array.isArray(spec.clear)) for (const r of spec.clear) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (x >= 0 && x < W && y >= 0 && y < H) data[y * W + x] = 0;
  }
}
spec.lines.forEach((ln, i) => {
  const bmp = readBMP(job.lines[i].out);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < Math.abs(bmp.rawH); y++) {
    for (let x = 0; x < bmp.w; x++) {
      if (lum(bmp, x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const inkW = x1 - x0 + 1, inkH = y1 - y0 + 1;
  // Horizontal placement: 'center' keeps the ink centred in the W-wide canvas
  // (matches the original A8 masks, whose text is centred); 'left' pastes at x=0.
  const align = ln.align || spec.align || 'left';
  const pasteX = ln.x !== undefined ? ln.x
    : (align === 'center' ? Math.round((W - inkW) / 2)
      : align === 'right' ? Math.max(0, W - inkW - 1) : 0);
  console.log(`  line${i} "${ln.text}" ink=${inkW}x${inkH} -> paste at x=${pasteX} y=${ln.y} (align=${align})`);
  if (inkW > W - 2) console.log(`    WARNING: line wider than ${W}: ${inkW}`);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = lum(bmp, x, y);
      const tx = pasteX + (x - x0), ty = ln.y + (y - y0);
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        const idx = ty * W + tx;
        if (v > data[idx]) data[idx] = v;
      }
    }
  }
});

// 4) write new DDS = original 128-byte header + new alpha data
const out = Buffer.concat([orig.subarray(0, 128), data]);
fs.writeFileSync(outDds, out);
console.log(`wrote ${outDds} (${out.length} B)`);

if (previewPng) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < dataLen; i++) {
    const a = data[i];
    rgba[i * 4] = 255 - a; rgba[i * 4 + 1] = 255 - a; rgba[i * 4 + 2] = 255 - a; rgba[i * 4 + 3] = 255;
  }
  writePNG(previewPng, W, H, rgba);
  console.log(`wrote preview ${previewPng}`);
}