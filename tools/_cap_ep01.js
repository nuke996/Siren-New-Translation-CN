const __P = require('./_config.js');
// Capacity breakdown for hud/movie/ep01_cp1 (mirrors importsheet allocation logic).
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CW = 24, CH = 28, BLKW = 6, BLKH = 7;
const MARK = Buffer.from('fffd181cfffc', 'hex');
function loadDb() {
  const db = JSON.parse(fs.readFileSync(path.join(WORK, 'chap_templates.json'), 'utf8'));
  const add = (n, c) => { try { const v = JSON.parse(fs.readFileSync(path.join(WORK, n), 'utf8')); const cc = JSON.parse(fs.readFileSync(path.join(WORK, c), 'utf8')); for (const it of v) { const ch = cc[String(it.id)]; if (ch && !db[it.sig]) db[it.sig] = ch; } } catch (e) { } };
  add('vocab.json', 'vocab_chars.json'); add('subvocab.json', 'subvocab_chars.json'); return db;
}
const stem = 'hud/movie/ep01_cp1';
const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));
const db = loadDb();
const ddsE = cidx.entries.find(e => e.name === stem + '.dds');
const datE = cidx.entries.find(e => e.name === stem + '.dat');
const sheet = Buffer.from(cdat.subarray(ddsE.off, ddsE.off + ddsE.size));
const hdr = parseDDS(sheet); const cols = Math.floor(hdr.width / CW); const rows = Math.floor(hdr.height / CH); const N = cols * rows;
const rgba = decodeDXT1(sheet, hdr.width, hdr.height, hdr.dataOffset);
const bpr = (hdr.width / 4) * 8;
const sig = c => { const col = c % cols, row = Math.floor(c / cols); const b0 = hdr.dataOffset + row * BLKH * bpr + col * BLKW * 8; const p = []; for (let by = 0; by < BLKH; by++) { const b = b0 + by * bpr; p.push(sheet.subarray(b, b + BLKW * 8)); } return Buffer.concat(p).toString('hex'); };
const glyphs = new Array(N).fill(''); const blank = new Array(N).fill(false);
for (let c = 0; c < N; c++) { const col = c % cols, row = Math.floor(c / cols); if (db[sig(c)]) glyphs[c] = db[sig(c)]; else { let mx = 0; for (let y = 0; y < CH && mx < 40; y++) for (let x = 0; x < CW; x++) { const i = (((row * CH + y) * hdr.width) + (col * CW + x)) * 4; if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) { mx = 40; break; } } blank[c] = mx < 40; } }
const mbuf = Buffer.from(cdat.subarray(datE.off, datE.off + datE.size));
const count = mbuf.readUInt32BE(12); const ent = [];
for (let i = 0; i < count; i++) { const p = 16 + i * 8; ent.push({ nameOff: mbuf.readUInt32BE(p), dataOff: mbuf.readUInt32BE(p + 4) }); }
const nameStart = Math.min(...ent.map(e => e.nameOff + 16));
const abs = ent.map(e => e.dataOff + 16); const order = abs.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a); const endOf = new Map();
order.forEach((o, k) => endOf.set(o.i, Math.min(k + 1 < order.length ? order[k + 1].a : mbuf.length, nameStart)));
function headerEnd(a) { const i = mbuf.indexOf(MARK, a); return i + MARK.length + 2; }
function readMsg(a) { let p = headerEnd(a), style = null; const o = []; while (p + 1 < mbuf.length) { const v = mbuf.readUInt16BE(p); p += 2; if (v === 0xffff) break; if (v === 0xfffb) { style = mbuf.readUInt16BE(p); p += 2; continue; } if (v >= 0xff00) continue; o.push(v); } return { style, glyphs: o }; }
const msgs = [];
for (let i = 0; i < count; i++) { let e = ent[i].nameOff + 16, s = e; while (mbuf[s] !== 0) s++; const name = mbuf.toString('utf8', e, s); const { style, glyphs: gi } = readMsg(abs[i]); msgs.push({ i, name, style, idx: gi, start: abs[i], end: endOf.get(i), hdrEnd: headerEnd(abs[i]) }); }
const common = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_common.json'), 'utf8'));
const d = JSON.parse(fs.readFileSync(path.join(WORK, 'zh_draft_ep01.json'), 'utf8'));
const targets = new Map();
if (common.templates && common.templates.ARCHIVE_ADDED) {
  const keys = Object.keys(common.archive_names);
  for (let n = 1; n <= keys.length; n++) targets.set('ARCHIVE' + String(n).padStart(3, '0'), common.templates.ARCHIVE_ADDED.replace('{item}', common.archive_names[keys[n - 1]]));
}
for (const l of d.lines) targets.set(l.name, l.text);
const noTarget = msgs.filter(m => !targets.has(m.name));
const charCell = new Map(); glyphs.forEach((c, i) => { if (c && !charCell.has(c)) charCell.set(c, i); });
const clean = s => s.replace(/[\u25c7\u203b]/g, '');
const needed = new Set(); for (const t of targets.values()) for (const c of clean(t)) needed.add(c);
const editedNames = new Set(msgs.filter(m => targets.has(m.name)).map(m => m.name));
const protectedCells = new Set(); for (const m of msgs) if (!editedNames.has(m.name)) for (const g of m.idx) protectedCells.add(g);
const keepCells = new Set(); for (const c of needed) { const cc = charCell.get(c); if (cc !== undefined) keepCells.add(cc); }
const newChars = [...needed].filter(c => !charCell.has(c));
const out = [];
out.push(`N=${N} cols=${cols} rows=${rows} known=${glyphs.filter(Boolean).length} blank=${blank.filter(Boolean).length}`);
out.push(`msgs=${count} edited=${editedNames.size} noTarget=${noTarget.length} protectedCells=${protectedCells.size} keepCells=${keepCells.size}`);
out.push(`neededUnique=${needed.size} alreadyInAtlas=${needed.size - newChars.length} newChars=${newChars.length}`);
const freeBlank = [], freeGlyph = [];
for (let c = 0; c < N; c++) if (!protectedCells.has(c) && !keepCells.has(c)) (blank[c] ? freeBlank : freeGlyph).push(c);
out.push(`free: blank=${freeBlank.length} glyph=${freeGlyph.length} total=${freeBlank.length + freeGlyph.length}  shortfall=${newChars.length - (freeBlank.length + freeGlyph.length)}`);
out.push(`noTarget msgs: ${noTarget.map(m => m.name + '(g=' + m.idx.length + ',cells=' + new Set(m.idx).size + ')').join(', ')}`);
out.push(`newChars list: ${newChars.join('')}`);
fs.writeFileSync(path.join(WORK, 'import', '_cap_ep01.txt'), out.join('\n'));
console.log('wrote _cap_ep01.txt');