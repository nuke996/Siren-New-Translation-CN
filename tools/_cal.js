const __P = require('./_config.js');
'use strict';
// Calibrate fixed crop window for SimHei size 17 rendered at (20,20) in a 120x120 canvas.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const D = `${__P.WORK}/`;
const PS1 = path.join(__dirname, 'render_text.ps1');
const chars = ['国', '：', '、', '。', '一', '日', 'Ａ', 'g'];
const job = { font: 'SimHei', size: 17, bold: 0, width: 120, height: 120, lines: [] };
chars.forEach((c, i) => job.lines.push({ text: c, out: D + `_cal${i}.bmp` }));
fs.writeFileSync(D + '_cal.json', '\uFEFF' + JSON.stringify(job), 'utf8');
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', D + '_cal.json'], { stdio: 'inherit' });
function readBMP(p) { const b = fs.readFileSync(p); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) }; }
function lum(bmp, x, y) { const h = Math.abs(bmp.rawH); const yy = bmp.rawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4; return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)]; }
chars.forEach((c, i) => {
  const bmp = readBMP(D + `_cal${i}.bmp`);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) if (lum(bmp, x, y) > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  console.log(`${c}  bbox x${x0}..${x1} (w${x1 - x0 + 1})  y${y0}..${y1} (h${y1 - y0 + 1})`);
  try { fs.unlinkSync(D + `_cal${i}.bmp`); } catch (e) { }
});
try { fs.unlinkSync(D + '_cal.json'); } catch (e) { }