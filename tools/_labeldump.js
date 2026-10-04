const __P = require('./_config.js');
'use strict';
const fs = require('fs');
const D = `${__P.WORK}/`;
const dat = fs.readFileSync(D + 'label.dat');
function dump(a, b) {
  for (let p = a; p < b; p += 2) {
    const v = dat.readUInt16BE(p);
    let tag = '';
    if (v === 0xffff) tag = ' <END>';
    else if (v === 0xfffd) tag = ' FFFD';
    else if (v === 0xfffb) tag = ' FFFB';
    else if (v === 0xfffe) tag = ' FFFE';
    else if (v === 0xfffc) tag = ' FFFC';
    console.log(String(p).padStart(5), '0x' + v.toString(16).padStart(4, '0'), String(v).padStart(5), tag);
  }
}
console.log('=== record [0] DLG_CP_ENTER  136..244 ===');
dump(136, 244);
console.log('=== record [8] REGIST_XMB 1432..1502 ===');
dump(1432, 1502);
console.log('=== names block 2350..2561 ===');
console.log(dat.toString('utf8', 2350, 2561));