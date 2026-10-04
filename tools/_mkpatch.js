const __P = require('./_config.js');
// Build patch.json for common.dat from work/import outputs and run sntp_pack.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const OUT = path.join(WORK, 'import');
const PACK = path.join(WORK, 'pack');
const { parseHed } = require(path.join(`${__P.TOOLS}`, 'sntp_pack.js'));

const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const patch = {};
let n = 0;
for (const e of cidx.entries) {
  if (!/^hud\/movie\/ep\d+_cp\d+\.(dat|dds)$/.test(e.name)) continue;
  const ext = e.name.endsWith('.dds') ? '.dds' : '.dat';
  const safe = e.name.replace(/\.(dat|dds)$/, '').replace(/[^A-Za-z0-9_]+/g, '_') + ext;
  const f = path.join(OUT, safe);
  if (fs.existsSync(f) && fs.statSync(f).size === e.size) { patch[e.name] = f; n++; }
  else if (fs.existsSync(f)) console.log('SKIP size mismatch', e.name, fs.statSync(f).size, e.size);
}
fs.writeFileSync(path.join(WORK, 'patch_common.json'), JSON.stringify(patch, null, 1));
console.log('patched entries:', n, '/', Object.keys(patch).length);
fs.mkdirSync(PACK, { recursive: true });
execFileSync(process.execPath, [path.join(`${__P.TOOLS}`, 'sntp_pack.js'),
  BASE + 'common.hed', BASE + 'common.dat', path.join(WORK, 'patch_common.json'), PACK], { stdio: 'inherit' });
console.log('packed ->', PACK);