// Crop + scale + invert a region of a DDS to PNG for visual checking.
// usage: node cropdds.js <dds> x y w h scale invert(0|1) out.png
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw, writePNG } = require('./dds2png.js');
const [p, X, Y, W, H, S, INV, out] = process.argv.slice(2);
const x0 = +X, y0 = +Y, w = +W, h = +H, s = +S || 1, inv = INV === '1';
const raw = fs.readFileSync(p);
const d = parseDDS(raw);
const src = d.fourCC.replace(/\0/g, '').trim() === 'DXT1'
  ? decodeDXT1(raw, d.width, d.height, d.dataOffset)
  : decodeRaw(raw, d.width, d.height, d.dataOffset, d.rgbBitCount || 32, d);
const ow = w * s, oh = h * s;
const out0 = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
  const sx = x0 + Math.floor(x / s), sy = y0 + Math.floor(y / s);
  const si = (sy * d.width + sx) * 4;
  let v = Math.round(0.299 * src[si] + 0.587 * src[si + 1] + 0.114 * src[si + 2]);
  if (inv) v = 255 - v;
  const di = (y * ow + x) * 4;
  out0[di] = out0[di + 1] = out0[di + 2] = v; out0[di + 3] = 255;
}
writePNG(out, ow, oh, out0);
console.log('wrote', out, ow + 'x' + oh);