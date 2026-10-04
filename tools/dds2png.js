#!/usr/bin/env node
// DDS -> PNG converter (no npm / no Python needed).
// Supports uncompressed RGBA/BGRA and DXT1 (BC1). Decodes mip level 0 only.
//
// Usage:
//   node dds2png.js <input.dds> [output.png]
//   node dds2png.js <input.dds> --header        (only print header)

'use strict';
const fs = require('fs');
const zlib = require('zlib');

// ---------------- CRC32 / PNG writer ----------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function writePNG(file, w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // no filter
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  fs.writeFileSync(file, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]));
}

// ---------------- DDS parsing ----------------
function parseDDS(buf) {
  if (buf.toString('ascii', 0, 4) !== 'DDS ') throw new Error('not a DDS file');
  const h = {
    size: buf.readUInt32LE(4),
    flags: buf.readUInt32LE(8),
    height: buf.readUInt32LE(12),
    width: buf.readUInt32LE(16),
    pitchOrLinear: buf.readUInt32LE(20),
    depth: buf.readUInt32LE(24),
    mipCount: buf.readUInt32LE(28),
    pfSize: buf.readUInt32LE(76),
    pfFlags: buf.readUInt32LE(80),
    fourCC: buf.toString('ascii', 84, 88),
    rgbBitCount: buf.readUInt32LE(88),
    rMask: buf.readUInt32LE(92),
    gMask: buf.readUInt32LE(96),
    bMask: buf.readUInt32LE(100),
    aMask: buf.readUInt32LE(104),
    dataOffset: 128,
  };
  return h;
}

// ---------------- DXT1 (BC1) ----------------
function decodeDXT1(buf, w, h, off) {
  const out = Buffer.alloc(w * h * 4);
  const bw = Math.max(1, Math.ceil(w / 4));
  const bh = Math.max(1, Math.ceil(h / 4));
  const col = new Array(4);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const c0 = buf.readUInt16LE(off); off += 2;
      const c1 = buf.readUInt16LE(off); off += 2;
      let bits = buf.readUInt32LE(off); off += 4;

      col[0] = unpack565(c0);
      col[1] = unpack565(c1);
      if (c0 > c1) {
        col[2] = mix(col[0], col[1], 1, 2);
        col[3] = mix(col[0], col[1], 2, 1);
      } else {
        col[2] = mix(col[0], col[1], 1, 1);
        col[3] = [0, 0, 0, 0];
      }
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const idx = bits & 3;
          bits >>>= 2;
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const dst = (y * w + x) * 4;
          out[dst] = col[idx][0];
          out[dst + 1] = col[idx][1];
          out[dst + 2] = col[idx][2];
          out[dst + 3] = col[idx][3];
        }
      }
    }
  }
  return out;
}

function unpack565(c) {
  let r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  r = (r << 3) | (r >> 2);
  g = (g << 2) | (g >> 4);
  b = (b << 3) | (b >> 2);
  return [r, g, b, 255];
}

function mix(a, b, wa, wb) {
  const s = wa + wb;
  return [
    Math.round((a[0] * wa + b[0] * wb) / s),
    Math.round((a[1] * wa + b[1] * wb) / s),
    Math.round((a[2] * wa + b[2] * wb) / s),
    255,
  ];
}

// ---------------- uncompressed ----------------
function maskShift(mask) {
  if (mask === 0) return { shift: 0, max: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  const max = mask >>> shift;
  return { shift, max };
}
function extract(v, mask) {
  if (mask === 0) return 255;
  const { shift, max } = maskShift(mask);
  const raw = (v & mask) >>> shift;
  return Math.round((raw * 255) / max);
}
function decodeRaw(buf, w, h, off, bpp, hdr) {
  const out = Buffer.alloc(w * h * 4);
  const bytes = bpp / 8;
  for (let i = 0; i < w * h; i++) {
    const p = off + i * bytes;
    let v;
    if (bytes === 4) v = buf.readUInt32LE(p);
    else if (bytes === 3) v = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
    else if (bytes === 2) v = buf.readUInt16LE(p);
    else v = buf[p];
    const dst = i * 4;
    if (bytes === 4 && hdr.rMask === 0xFF && hdr.gMask === 0xFF00 && hdr.bMask === 0xFF0000) {
      out[dst] = buf[p]; out[dst + 1] = buf[p + 1]; out[dst + 2] = buf[p + 2]; out[dst + 3] = 255;
      continue;
    }
    if (bytes === 4 && hdr.rMask === 0xFF0000 && hdr.gMask === 0xFF00 && hdr.bMask === 0xFF) {
      out[dst] = buf[p + 2]; out[dst + 1] = buf[p + 1]; out[dst + 2] = buf[p]; out[dst + 3] = 255;
      continue;
    }
    out[dst] = extract(v, hdr.rMask);
    out[dst + 1] = extract(v, hdr.gMask);
    out[dst + 2] = extract(v, hdr.bMask);
    out[dst + 3] = hdr.aMask ? extract(v, hdr.aMask) : 255;
  }
  return out;
}

// ---------------- main ----------------
function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node dds2png.js <input.dds> [output.png] [--header]');
    process.exit(2);
  }
  const buf = fs.readFileSync(src);
  const hdr = parseDDS(buf);
  console.log('DDS header:', JSON.stringify(hdr));

  const fourCC = hdr.fourCC.replace(/\0/g, '').trim();
  if (process.argv.includes('--header')) return;

  let rgba;
  if (fourCC === 'DXT1' || hdr.fourCC === '1TXD') {
    rgba = decodeDXT1(buf, hdr.width, hdr.height, hdr.dataOffset);
  } else {
    rgba = decodeRaw(buf, hdr.width, hdr.height, hdr.dataOffset, hdr.rgbBitCount || 32, hdr);
  }

  const dst = process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : src.replace(/\.[^.\\/]+$/, '') + '.png';
  writePNG(dst, hdr.width, hdr.height, rgba);
  console.log('wrote', dst, hdr.width + 'x' + hdr.height);
}

if (require.main === module) main();

module.exports = { parseDDS, decodeDXT1, decodeRaw, writePNG, unpack565, mix };