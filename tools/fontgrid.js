#!/usr/bin/env node
// Font atlas grid analyzer.
//
// Usage:
//   node fontgrid.js <atlas.dds>                     -> analyze grid geometry
//   node fontgrid.js <atlas.dds> crop x y w h out.png [scale]
//
'use strict';
const fs = require('fs');
const { parseDDS, decodeDXT1, decodeRaw, writePNG } = require('./dds2png.js');

function loadRGBA(file) {
  const buf = fs.readFileSync(file);
  const hdr = parseDDS(buf);
  const fourCC = hdr.fourCC.replace(/\0/g, '').trim();
  const rgba = (fourCC === 'DXT1' || hdr.fourCC === '1TXD')
    ? decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset)
    : decodeRaw(buf, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 32, hdr);
  return { hdr, rgba };
}

function analyze(file) {
  const { hdr, rgba } = loadRGBA(file);
  const W = hdr.width, H = hdr.height;

  const alphaHist = {};
  let opaque = 0, darkOpaque = 0, lightOpaque = 0;
  for (let i = 0; i < W * H; i++) {
    const a = rgba[i * 4 + 3];
    alphaHist[a] = (alphaHist[a] || 0) + 1;
    if (a > 0) {
      opaque++;
      const lum = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
      if (lum < 128) darkOpaque++; else lightOpaque++;
    }
  }
  console.log('size', W + 'x' + H);
  console.log('alpha histogram (value:count)', JSON.stringify(alphaHist));
  console.log('opaque px', opaque, 'dark', darkOpaque, 'light', lightOpaque);
  // ink polarity: count of dark px vs light px among opaque
  const darkIsInk = darkOpaque <= lightOpaque;
  console.log('assumed ink polarity:', darkIsInk ? 'dark-on-light' : 'light-on-dark');

  const isInk = (i) => {
    const a = rgba[i * 4 + 3];
    if (a === 0) return false;
    const lum = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
    return darkIsInk ? lum < 128 : lum > 128;
  };

  // row ink profile
  const rowInk = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) if (isInk(y * W + x)) c++;
    rowInk[y] = c;
  }
  // detect bands (runs of rows with ink > 0 separated by blank rows)
  const bands = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    const has = y < H && rowInk[y] > 0;
    if (has && start < 0) start = y;
    if (!has && start >= 0) { bands.push([start, y - 1]); start = -1; }
  }
  console.log('row bands:', bands.length);
  const gaps = [];
  for (let i = 1; i < bands.length; i++) gaps.push(bands[i][0] - bands[i - 1][1] - 1);
  console.log('first 20 bands:', JSON.stringify(bands.slice(0, 20)));
  const heights = {};
  bands.forEach(([a, b]) => { const h = b - a + 1; heights[h] = (heights[h] || 0) + 1; });
  console.log('band height histogram (height:count):', JSON.stringify(heights));
  const gapHist = {};
  gaps.forEach(g => { gapHist[g] = (gapHist[g] || 0) + 1; });
  console.log('gap histogram (gap:count):', JSON.stringify(gapHist));

  // ---- column analysis over the whole content region ----
  const lastBand = bands.length ? bands[bands.length - 1][1] : 0;
  const colInk = new Int32Array(W);
  for (let y = 0; y <= lastBand; y++) {
    for (let x = 0; x < W; x++) if (isInk(y * W + x)) colInk[x]++;
  }
  // column gap runs
  const colGaps = [];
  let s2 = -1;
  for (let x = 0; x <= W; x++) {
    const has = x < W && colInk[x] > 0;
    if (!has && s2 < 0) s2 = x;
    if (has && s2 >= 0) { colGaps.push([s2, x - 1, x - s2]); s2 = -1; }
  }
  console.log('content rows 0..' + lastBand);
  console.log('column gap runs (first 30):', JSON.stringify(colGaps.slice(0, 30)));
  const colPitch = {};
  for (let i = 1; i < colGaps.length; i++) {
    const d = colGaps[i][0] - colGaps[i - 1][0];
    colPitch[d] = (colPitch[d] || 0) + 1;
  }
  console.log('column pitch histogram:', JSON.stringify(colPitch));
  console.log('total column gaps:', colGaps.length);
}

function crop(file, x, y, w, h, out, scale) {
  const { hdr, rgba } = loadRGBA(file);
  const s = scale || 1;
  const ow = w * s, oh = h * s;
  const outBuf = Buffer.alloc(ow * oh * 4);
  for (let yy = 0; yy < oh; yy++) {
    for (let xx = 0; xx < ow; xx++) {
      const sx = x + Math.floor(xx / s);
      const sy = y + Math.floor(yy / s);
      let r = 255, g = 255, b = 255, a = 255;
      if (sx >= 0 && sy >= 0 && sx < hdr.width && sy < hdr.height) {
        const i = (sy * hdr.width + sx) * 4;
        r = rgba[i]; g = rgba[i + 1]; b = rgba[i + 2]; a = rgba[i + 3];
      }
      const d = (yy * ow + xx) * 4;
      // flatten onto white so dark glyphs are visible
      outBuf[d] = Math.round(r * (a / 255) + 255 * (1 - a / 255));
      outBuf[d + 1] = Math.round(g * (a / 255) + 255 * (1 - a / 255));
      outBuf[d + 2] = Math.round(b * (a / 255) + 255 * (1 - a / 255));
      outBuf[d + 3] = 255;
    }
  }
  writePNG(out, ow, oh, outBuf);
  console.log('wrote', out, ow + 'x' + oh);
}

const args = process.argv.slice(2);
if (args[0] === 'crop') {
  crop(args[1], +args[2], +args[3], +args[4], +args[5], args[6], +args[7] || 1);
} else if (args[0]) {
  analyze(args[0]);
} else {
  console.error('usage: node fontgrid.js <atlas.dds> | crop <dds> x y w h out.png [scale]');
  process.exit(2);
}