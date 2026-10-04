const fs = require('fs');
const p = process.argv[2];
const b = fs.readFileSync(p);
console.log('file:', p, 'size:', b.length);
console.log('size%8=', b.length % 8, 'size%4=', b.length % 4, 'size%2=', b.length % 2);
console.log('hex[0..127]:', b.subarray(0, 128).toString('hex').match(/../g).join(' '));
console.log('ascii[0..63]:', JSON.stringify(b.toString('latin1', 0, 64)));

// try u32 array
const n32 = Math.floor(b.length / 4);
const u32 = [];
for (let i = 0; i < Math.min(n32, 40); i++) u32.push(b.readUInt32BE(i * 4));
console.log('u32BE[0..39]:', u32.join(' '));
const u32le = [];
for (let i = 0; i < Math.min(n32, 40); i++) u32le.push(b.readUInt32LE(i * 4));
console.log('u32LE[0..39]:', u32le.join(' '));

// try u16 array
const u16 = [];
for (let i = 0; i < Math.min(Math.floor(b.length/2), 80); i++) u16.push(b.readUInt16BE(i * 2));
console.log('u16BE[0..79]:', u16.join(' '));

// look for monotonic increasing u32 sequences (offsets)
const arr = []; for (let i = 0; i < n32; i++) arr.push(b.readUInt32BE(i * 4));
let best = 0, bestAt = -1;
for (let i = 0; i < n32; i++) { let j = i; while (j + 1 < n32 && arr[j + 1] > arr[j] && arr[j + 1] - arr[j] < 0x10000) j++; if (j - i > best) { best = j - i; bestAt = i; } }
console.log('longest increasing u32 run: len', best, 'at index', bestAt, 'values', arr.slice(bestAt, bestAt + 8));

// scan for plausible CJK codepoint values (u32 <= 0xFFFF and in CJK ranges)
let cjkCount = 0, sample = [];
for (let i = 0; i < n32; i++) { const v = arr[i]; if ((v >= 0x3000 && v <= 0x30ff) || (v >= 0x4e00 && v <= 0x9fff) || (v >= 0xff00 && v <= 0xffef)) { cjkCount++; if (sample.length < 15) sample.push(i + ':' + v.toString(16)); } }
console.log('u32 values in CJK ranges:', cjkCount, sample.join(' '));

let cjk16 = 0, s16 = [];
for (let i = 0; i < Math.floor(b.length/2); i++) { const v = b.readUInt16BE(i*2); if ((v >= 0x3000 && v <= 0x30ff) || (v >= 0x4e00 && v <= 0x9fff) || (v >= 0xff00 && v <= 0xffef)) { cjk16++; if (s16.length < 20) s16.push(i + ':' + v.toString(16)); } }
console.log('u16 values in CJK ranges:', cjk16, s16.join(' '));