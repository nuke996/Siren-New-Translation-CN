const __P = require('./_config.js');
// Translate the Japanese comments in setting/render_setting.txt (Shift-JIS) to
// Simplified Chinese, preserving the original tab/whitespace layout exactly.
// The value tokens are ASCII and untouched; only trailing/full-line comments change.
'use strict';
const fs = require('fs');
const src = `${__P.WORK}/txt_e/render_setting.txt`;
const dst = `${__P.WORK}/txt_e/render_setting.zh.txt`;
const raw = fs.readFileSync(src);
const text = new TextDecoder('shift-jis').decode(raw);
console.log('--- original (shift-jis decoded) ---');
console.log(text);
const rep = JSON.parse(fs.readFileSync(`${__P.WORK}/i18n_src/etxt.json`, 'utf8')).rep;
let out = text;
for (const [a, b] of rep) out = out.split(a).join(b);
// the comment-only lines indent with a full-width space (U+3000, 2B in shift-jis,
// 3B in UTF-8); swap for an ASCII space to stay inside the original entry size.
out = out.split('\u3000').join(' ');
const buf = Buffer.from(out, 'utf8');
console.log('--- translated ---');
console.log(out);
console.log(`original ${raw.length} B  ->  translated ${buf.length} B  (limit 744)`);
if (buf.length > 744) { console.error('TOO BIG'); process.exit(1); }
fs.writeFileSync(dst, buf);

// merge into the common.dat patch map
const patchPath = `${__P.WORK}/patch_common.json`;
const patch = fs.existsSync(patchPath) ? JSON.parse(fs.readFileSync(patchPath, 'utf8')) : {};
patch['setting/render_setting.txt'] = dst;
fs.writeFileSync(patchPath, JSON.stringify(patch, null, 1));
console.log(`merged setting/render_setting.txt -> patch_common.json (${Object.keys(patch).length} entries)`);