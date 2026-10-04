const fs = require('fs');
const p = process.argv[2];
const b = fs.readFileSync(p);
console.log('file:', p, 'size:', b.length);
console.log('magic:', JSON.stringify(b.toString('latin1', 0, 16)));
console.log('hex[0..255]:', b.subarray(0, 256).toString('hex').match(/../g).join(' '));

// scan printable ascii runs
function asciiRuns(buf, min = 4) {
  const out = []; let s = -1;
  for (let i = 0; i <= buf.length; i++) {
    const c = buf[i];
    const ok = i < buf.length && c >= 0x20 && c < 0x7f;
    if (ok && s < 0) s = i;
    else if (!ok && s >= 0) { if (i - s >= min) out.push({ off: s, len: i - s, str: buf.toString('latin1', s, i) }); s = -1; }
  }
  return out;
}
// scan UTF-8 CJK runs (E0-EF lead)
function cjkRuns(buf, minChars = 2) {
  const out = []; let i = 0;
  while (i < buf.length - 2) {
    const a = buf[i];
    if (a >= 0xe0 && a <= 0xef && (buf[i+1] & 0xc0) === 0x80 && (buf[i+2] & 0xc0) === 0x80) {
      let s = i;
      while (i < buf.length - 2 && buf[i] >= 0xe0 && buf[i] <= 0xef && (buf[i+1] & 0xc0) === 0x80 && (buf[i+2] & 0xc0) === 0x80) i += 3;
      const n = (i - s) / 3;
      if (n >= minChars) out.push({ off: s, chars: n, str: buf.toString('utf8', s, i) });
    } else i++;
  }
  return out;
}
const ar = asciiRuns(b, 4);
console.log('\nASCII runs:', ar.length);
for (const r of ar.slice(0, 40)) console.log(`  @${r.off} (${r.len}) ${JSON.stringify(r.str)}`);
const cr = cjkRuns(b, 2);
console.log('\nUTF-8 CJK runs:', cr.length);
for (const r of cr.slice(0, 60)) console.log(`  @${r.off} x${r.chars} ${r.str}`);

// scan Shift-JIS japanese runs
function sjisRuns(buf, min = 3) {
  const out = []; let i = 0;
  const isLead = c => (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xef);
  const isTrail = c => (c >= 0x40 && c <= 0x7e) || (c >= 0x80 && c <= 0xfc);
  while (i < buf.length - 1) {
    if (isLead(buf[i]) && isTrail(buf[i+1])) {
      let s = i, cnt = 0;
      while (i < buf.length - 1 && isLead(buf[i]) && isTrail(buf[i+1])) { i += 2; cnt++; }
      if (cnt >= min) { const dec = Buffer.from(buf.subarray(s, i)); out.push({ off: s, chars: cnt }); }
    } else i++;
  }
  return out;
}
const sr = sjisRuns(b, 3);
console.log('\nShift-JIS 2-byte runs:', sr.length, 'first 10 offsets:', sr.slice(0,10).map(r=>r.off+':x'+r.chars).join(' '));
// decode first sjis run
if (sr.length) {
  const r = sr[0];
  // find run end
  let i = r.off; const isLead = c => (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xef);
  const isTrail = c => (c >= 0x40 && c <= 0x7e) || (c >= 0x80 && c <= 0xfc);
  while (i < b.length - 1 && isLead(b[i]) && isTrail(b[i+1])) i += 2;
  let out = '';
  for (let k = r.off; k < i; k += 2) {
    try { out += require('iconv-lite').decode(b.subarray(k, k+2), 'shift_jis'); } catch(e) {}
  }
  // iconv-lite may be absent; fallback:
  console.log('  (sjis decode via iconv-lite if available)');
}