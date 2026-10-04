#!/usr/bin/env node
const __P = require('./_config.js');
// For a given label char, show the CONTEXT of every message that references each
// distinct sig carrying that label. Lets us decide a correction per SIG (a label
// can be right on one cell and wrong on another), using the Japanese word as the
// authority.
//
// usage: node sigsites.js <char[,char...]> [maxCtx]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseHed } = require('./sntp_pack.js');
const { parseDDS, decodeDXT1 } = require('./dds2png.js');
const { parseFontdata, readPayload } = require('./msgdecode.js');

const BASE = `${__P.DISC}/`;
const WORK = `${__P.WORK}`;
const CW = 24, CH = 28, BLKW = 6, BLKH = 7;

function load(f) { try { return JSON.parse(fs.readFileSync(path.join(WORK, f), 'utf8')); } catch (e) { return null; } }
function buildDb() {
  const tpl = load('chap_templates.json') || {};
  const vb = load('vocab.json') || [], vc = load('vocab_chars.json') || {};
  const sv = load('subvocab.json') || [], sc = load('subvocab_chars.json') || {};
  const eff = {};
  for (const k in tpl) if (!eff[k]) eff[k] = { ch: tpl[k], from: 'tpl', id: '-' };
  for (const v of vb) { const ch = vc[String(v.id)]; if (ch && !eff[v.sig]) eff[v.sig] = { ch, from: 'vocab', id: v.id }; }
  for (const v of sv) { const ch = sc[String(v.id)]; if (ch && !eff[v.sig]) eff[v.sig] = { ch, from: 'subvocab', id: v.id }; }
  return eff;
}
function cellSig(buf, dof, width, col, row) {
  const bpr = (width / 4) * 8;
  const b0 = dof + row * BLKH * bpr + col * BLKW * 8;
  const parts = [];
  for (let by = 0; by < BLKH; by++) { const base = b0 + by * bpr; parts.push(buf.subarray(base, base + BLKW * 8)); }
  return Buffer.concat(parts).toString('hex');
}
function readCStr(buf, off) { let e = off; while (e < buf.length && buf[e] !== 0) e++; return buf.toString('utf8', off, e); }

const cdat = fs.readFileSync(BASE + 'common.dat');
const cidx = parseHed(fs.readFileSync(BASE + 'common.hed'));

// gather {label, ddsBuf, datBuf} pairs
function gather() {
  const pairs = [];
  for (const e of cidx.entries) {
    if (/^s\d\d\.hed$/.test(e.name)) {
      let inner; try { inner = parseHed(cdat.subarray(e.off, e.off + e.size)); } catch (x) { continue; }
      const tag = e.name.slice(0, 3);
      let dbuf; try { dbuf = fs.readFileSync(BASE + tag + '.dat'); } catch (x) { continue; }
      for (const x of inner.entries) {
        if (!x.name.endsWith('.dds')) continue;
        const stem = x.name.slice(0, -4);
        const d = inner.entries.find(y => y.name === stem + '.dat');
        if (d) pairs.push({ label: tag + '/' + stem.split('/').pop(), dds: dbuf.subarray(x.off, x.off + x.size), dat: dbuf.subarray(d.off, d.off + d.size) });
      }
    } else if (e.name.endsWith('.dds') && e.size < 400000 && /movie|jimaku|msg/.test(e.name)) {
      const stem = e.name.slice(0, -4);
      const d = cidx.entries.find(y => y.name === stem + '.dat');
      if (d) pairs.push({ label: stem.replace(/^.*\//, ''), dds: cdat.subarray(e.off, e.off + e.size), dat: cdat.subarray(d.off, d.off + d.size) });
    }
  }
  return pairs;
}

const chars = (process.argv[2] || '').split(',').filter(Boolean);
const maxCtx = +(process.argv[3] || 6);
if (!chars.length) { console.log('usage: node sigsites.js <char[,char...]> [maxCtx]'); process.exit(1); }

const db = buildDb();
const want = new Set(chars);
const targets = new Map();       // sig -> {ch, from, ctx:[]}
for (const s in db) if (want.has(db[s].ch)) targets.set(s, { ch: db[s].ch, from: db[s].from, id: db[s].id, ctx: [] });

const pairs = gather();
console.log('pairs:', pairs.length, ' target sigs:', targets.size);

for (const p of pairs) {
  let hdr; try { hdr = parseDDS(p.dds); } catch (x) { continue; }
  if (hdr.fourCC.replace(/\0/g, '').trim() !== 'DXT1') continue;
  const cols = Math.floor(hdr.width / CW), rows = Math.floor(hdr.height / CH);
  const sigArr = new Array(cols * rows);
  for (let c = 0; c < cols * rows; c++) sigArr[c] = cellSig(p.dds, hdr.dataOffset, hdr.width, c % cols, Math.floor(c / cols));
  const rgba = decodeDXT1(p.dds, hdr.width, hdr.height, hdr.dataOffset);
  const isBlank = (g) => {
    const col = g % cols, row = Math.floor(g / cols);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = (((row * CH + y) * hdr.width) + (col * CW + x)) * 4;
      if ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 >= 40) return false;
    }
    return true;
  };
  const dat = Buffer.from(p.dat);
  let fd; try { fd = parseFontdata(dat); } catch (x) { continue; }
  for (let i = 0; i < fd.count; i++) {
    const name = readCStr(dat, fd.entries[i].nameOff + 16);
    let idxs; try { idxs = readPayload(dat, fd.entries[i].dataOff + 16).glyphs; } catch (x) { continue; }
    // rebuild text
    let text = '', hit = false;
    for (const g of idxs) {
      const sig = sigArr[g];
      const t = sig && targets.get(sig);
      if (t) hit = true;
      const c = (sig && db[sig]) ? db[sig].ch : (isBlank(g) ? ' ' : '\u25c7');
      text += c;
    }
    if (!hit) continue;
    // mark which target sigs are present
    const used = new Set();
    for (const g of idxs) { const sig = sigArr[g]; if (sig && targets.get(sig)) used.add(sig); }
    for (const sig of used) {
      const t = targets.get(sig);
      if (t.ctx.length < maxCtx) t.ctx.push(p.label + ' | ' + name + ' | ' + text.slice(0, 60));
    }
  }
}

let n = 0;
for (const [sig, t] of targets) {
  n++;
  console.log('\n=== [' + n + '] label "' + t.ch + '"  from=' + t.from + '  id=' + t.id + '  sig=' + sig.slice(0, 18) + '... ===');
  if (!t.ctx.length) console.log('   (no referencing message found)');
  for (const c of t.ctx) console.log('   ' + c);
}