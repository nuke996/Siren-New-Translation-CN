// Cell-level ink analysis for a glyph sheet DDS (DXT1 or raw).
// usage: node cellbox.js <sheet.dds> [cols] [cellW] [cellH]
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw } = require('./dds2png.js');

const p = process.argv[2];
const cols = process.argv[3] ? parseInt(process.argv[3]) : 21;
const cw = process.argv[4] ? parseInt(process.argv[4]) : 24;
const ch = process.argv[5] ? parseInt(process.argv[5]) : 28;

const raw = fs.readFileSync(p);
const d = parseDDS(raw);
console.log(`DDS ${d.width}x${d.height} fourCC=${JSON.stringify(d.fourCC)} rgbBitCount=${d.rgbBitCount} aMask=${d.aMask}`);
let rgba;
if (d.fourCC.replace(/\0/g, '').trim() === 'DXT1') rgba = decodeDXT1(raw, d.width, d.height, d.dataOffset);
else rgba = decodeRaw(raw, d.width, d.height, d.dataOffset, d.rgbBitCount || 32, d);

const rows = Math.floor(d.height / ch);
console.log(`cells: cols=${cols} rows=${rows} total=${cols * rows}`);

function cellInk(ci) {
  const col = ci % cols, row = Math.floor(ci / cols);
  const x0 = col * cw, y0 = row * ch;
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, maxv = 0, sum = 0, cnt = 0;
  for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) {
    const i = (y * d.width + x) * 4;
    const lum = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    if (lum > maxv) maxv = lum;
    sum += lum; cnt++;
    if (lum > 96) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  return { maxv, avg: Math.round(sum / cnt), minx, miny, maxx, maxy };
}

let blanks = [], used = 0;
for (let i = 0; i < cols * rows; i++) {
  const b = cellInk(i);
  if (b.maxv < 40) { blanks.push(i); continue; }
  used++;
}
console.log(`used cells (maxv>=40): ${used}; blank cells: ${blanks.length}`);
console.log('blank indices: ' + blanks.join(','));

// ink metrics of used cells (excluding the blankish ones)
let wMax = 0, hMax = 0, wSum = 0, hSum = 0, n = 0, xminAll = 1e9, yminAll = 1e9;
for (let i = 0; i < cols * rows; i++) {
  const b = cellInk(i);
  if (b.maxv < 40) continue;
  const w = b.maxx - b.minx + 1, h = b.maxy - b.miny + 1;
  if (w > wMax) wMax = w; if (h > hMax) hMax = h;
  wSum += w; hSum += h; n++;
  const col = i % cols, row = Math.floor(i / cols);
  const ox = b.minx - col * cw, oy = b.miny - row * ch;
  if (ox < xminAll) xminAll = ox; if (oy < yminAll) yminAll = oy;
}
console.log(`ink bbox: w avg=${(wSum / n).toFixed(1)} max=${wMax}; h avg=${(hSum / n).toFixed(1)} max=${hMax}; min left-off=${xminAll} min top-off=${yminAll}`);
// per-cell detail for a sample + the requested blanks
const sample = [0, 5, 29, 104, 182].concat(blanks.slice(0, 12));
for (const i of sample) {
  const b = cellInk(i);
  const col = i % cols, row = Math.floor(i / cols);
  console.log(`  cell ${i} (c${col},r${row}) maxv=${b.maxv} avg=${b.avg} bbox=[${b.minx - col * cw},${b.miny - row * ch}..${b.maxx - col * cw},${b.maxy - row * ch}]` + (b.maxv < 40 ? '  BLANK' : ''));
}