// Hex-dump FONTDATA records. usage: node fd_hex.js <msg.dat> <idx>[,...] [maxBytes]
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
const idxs = process.argv[3].split(',').map(Number);
const maxB = process.argv[4] ? parseInt(process.argv[4]) : 64;
const count = buf.readUInt32BE(12);
const offs = [];
for (let i = 0; i < count; i++) offs.push(buf.readUInt32BE(16 + i * 8 + 4) + 16);
function u16s(abs, n) { const a = []; for (let k = 0; k < n; k++) a.push(buf.readUInt16BE(abs + k * 2)); return a; }
for (const i of idxs) {
  const abs = offs[i];
  const end = i + 1 < count ? offs[i + 1] : buf.length;
  const n = Math.min(end - abs, maxB);
  console.log(`[${i}] abs=${abs} size=${end - abs}`);
  console.log('  hex: ' + buf.subarray(abs, abs + n).toString('hex').match(/../g).join(' '));
  console.log('  u16: ' + u16s(abs, Math.floor(n / 2)).map(v => v.toString(16).padStart(4, '0')).join(' '));
}