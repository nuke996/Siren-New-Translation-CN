const __P = require('./_config.js');
'use strict';
// Render a CJK sample with different GDI+ text hints / gamma, output 4x PNGs.
// usage: node _hinttest.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { writePNG } = require('./dds2png.js');
const W = `${__P.WORK}/`;
const PS1 = path.join(__dirname, 'render_text.ps1');
const TEXT = '莱特调查关闭';

function readBMP(p) { const b = fs.readFileSync(p); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), rawH: b.readInt32LE(22), bpp: b.readUInt16LE(28) }; }
function lum(bmp, x, y) { const h = Math.abs(bmp.rawH); const yy = bmp.rawH > 0 ? (h - 1 - y) : y; const stride = Math.floor((bmp.bpp * bmp.w + 31) / 32) * 4; return bmp.b[bmp.off + yy * stride + x * (bmp.bpp / 8)]; }

function run(hint, gamma, out) {
  const job = { font: 'SimHei', size: 20, bold: 0, width: 1200, height: 120, hint, lines: [{ text: TEXT, out: W + '_hint_tmp.bmp' }] };
  const jp = W + '_hintjob.json';
  fs.writeFileSync(jp, '\uFEFF' + JSON.stringify(job), 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Job', jp], { stdio: 'inherit' });
  const bmp = readBMP(W + '_hint_tmp.bmp');
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < Math.abs(bmp.rawH); y++) for (let x = 0; x < bmp.w; x++) if (lum(bmp, x, y) > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, S = 8, ow = cw * S, oh = ch * S;
  const img = Buffer.alloc(ow * oh * 4, 255);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let v = lum(bmp, x0 + Math.floor(x / S), y0 + Math.floor(y / S));
    if (gamma !== 1) v = Math.round(255 * Math.pow(v / 255, gamma));
    const i = (y * ow + x) * 4; img[i] = img[i + 1] = img[i + 2] = 255 - v;
  }
  writePNG(out, ow, oh, img);
  console.log('wrote', out, ow + 'x' + oh);
}
run('aa', 1, W + '_hint_aa.png');
run('grid', 1, W + '_hint_grid.png');
run('sbp', 1, W + '_hint_sbp.png');
run('aa', 0.7, W + '_hint_aa_g07.png');
run('grid', 0.7, W + '_hint_grid_g07.png');
