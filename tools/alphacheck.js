// Report DXT1 alpha state of a few cells. usage: node alphacheck.js <sheet.dds> idx,idx,...
const fs = require('fs');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const raw = fs.readFileSync(process.argv[2]);
const d = parseDDS(raw);
const rgba = decodeDXT1(raw, d.width, d.height, d.dataOffset);
const cols = 21, cw = 24, ch = 28;
for (const s of process.argv[3].split(',')) {
  const ci = parseInt(s);
  const col = ci % cols, row = Math.floor(ci / cols);
  let aMin = 999, aMax = -1, lumMax = 0, lumMin = 999;
  for (let y = row * ch; y < row * ch + ch; y++) for (let x = col * cw; x < col * cw + cw; x++) {
    const i = (y * d.width + x) * 4;
    const a = rgba[i + 3], lum = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    if (a < aMin) aMin = a; if (a > aMax) aMax = a;
    if (lum > lumMax) lumMax = lum; if (lum < lumMin) lumMin = lum;
  }
  console.log(`cell ${ci} (c${col},r${row}) alpha[${aMin}..${aMax}] lum[${lumMin}..${lumMax}]`);
}
// also report per-block byte offset formula sanity
console.log(`width=${d.width} height=${d.height} dataOffset=${d.dataOffset} fileLen=${raw.length} expectedDxt1Len=${d.dataOffset + (d.width / 4) * (d.height / 4) * 8}`);