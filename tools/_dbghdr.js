#!/usr/bin/env node
const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const { parseHed } = require('./sntp_pack.js');
const { parseFontdata } = require('./msgdecode.js');
const BASE = `${__P.DISC}/`;
const cdat = fs.readFileSync(BASE + 'common.dat'), cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
function readCStr(b, o) { let e = o; while (e < b.length && b[e] !== 0) e++; return b.toString('utf8', o, e); }
const MARK = Buffer.from('fffd181cfffc', 'hex');
for (const stem of ['hud/launcher/jimaku/archive_06', 'hud/launcher/jimaku/archive_38']) {
  const datE = cidx.entries.find(e => e.name === stem + '.dat');
  const buf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
  const fd = parseFontdata(buf);
  console.log('\n### ' + stem + '  count=' + fd.count);
  let shown = 0;
  for (let i = 0; i < fd.count && shown < 6; i++) {
    const abs = fd.entries[i].dataOff + 16;
    const name = readCStr(buf, fd.entries[i].nameOff + 16);
    const mi = buf.indexOf(MARK, abs);
    const flag = buf.readUInt16BE(abs), A = buf.readUInt16BE(abs + 2), B = buf.readUInt16BE(abs + 4);
    const tailA = buf.readUInt16BE(abs + 10);
    // scan glyphs the way readPayload does
    let p = mi + MARK.length + 2, vals = [];
    while (p + 1 < buf.length) { const v = buf.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { p += 2; continue; } if (v >= 0xff00) continue; vals.push(v); }
    const oor = vals.filter(v => v >= 189);
    if (!oor.length) continue;
    shown++;
    console.log('  ' + name + '  abs=' + abs + '  flag=0x' + flag.toString(16) + ' A=' + A + ' B=' + B + ' tailA@10=' + tailA + ' markAt=' + (mi - abs));
    console.log('    bytes: ' + buf.subarray(abs, abs + 20).toString('hex'));
    console.log('    vals(all): ' + vals.join(',') + '   OOR=' + oor.join(','));
  }
}