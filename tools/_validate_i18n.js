#!/usr/bin/env node
'use strict';
// Unified pre-flight validator for the translator-facing JSON files, plus an
// aggregator for the build-time diagnostics the import pipeline writes.
//
//   node _validate_i18n.js            # validate locales/<locale>/translator-view
//   node _validate_i18n.js --quiet    # only the summary line
//
// Every finding names the VIEW FILE, the entry id and the offending sentence:
//   [ERROR] 09_menu_d12.json :: d12::menu/jp/main_map/text_smallaim/s15_object01_02.dds
//           :: JP_KANA :: "解除「人类」的封印" :: 译文残留日文假名
//
// Used by _i18n_export.js (after export) and _i18n_import.js (before writing;
// aborts on ERROR unless --force).
const fs = require('fs');
const path = require('path');
const { I18N, WORK, UNITS, RD } = require('./_i18n_lib.js');

// Kana letters only. U+30FB (・) is a punctuation mark the translation uses
// intentionally; both it and any kana that the original JP also contains are
// handled by the "not present in jp" test below.
const KANA = /[\u3040-\u309f\u30a0-\u30fa\u30fc-\u30ff]/;
const PENDING = /[\u25c7\u203b]/;
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/;
const TOKEN = /\{[^{}]*\}|%[0-9]*(?:\$)?[sd]/g;
const OTHER_SCRIPT = /[\u0400-\u04ff\u0530-\u058f\u05d0-\u05ea\u0600-\u06ff\uac00-\ud7af\u0e00-\u0e7f]/;
// Records allowed to keep a kana on purpose (see docs/PITFALLS.md, _subaudit.js).
const KANA_ALLOW = /ARCHIVE030/;

const tokensOf = s => (String(s).match(TOKEN) || []).sort();

function loadGlobalFontChars() {
  const extendedPath = WORK + '/fontidexu8_new.tbl';
  const extended = fs.existsSync(extendedPath);
  const p = extended ? extendedPath : WORK + '/fontidexu8.tbl';
  const chars = new Set();
  if (!fs.existsSync(p)) return { chars, extended: false, present: false };
  const tb = fs.readFileSync(p);
  for (let o = 2000; o + 8 <= tb.length; o += 8) {
    const raw = Buffer.from([tb[o], tb[o + 1], tb[o + 2], tb[o + 3]]).reverse();
    const s = raw.toString('utf8');
    if (s.includes('\ufffd')) continue;
    const t = s.replace(/\0+$/g, '');
    if (t) for (const ch of t) chars.add(ch);
  }
  return { chars, extended, present: true };
}

function preflight() {
  const errors = [], warns = [];
  let total = 0, files = 0, fontChecked = false;
  const gf = loadGlobalFontChars();
  for (const u of UNITS) {
    const p = path.join(I18N, u.file);
    if (!fs.existsSync(p)) continue;
    files++;
    let doc;
    try { doc = RD(p); } catch (e) {
      errors.push({ file: u.file, id: '-', zh: '', rule: 'BAD_JSON', detail: e.message });
      continue;
    }
    const entries = Array.isArray(doc.entries) ? doc.entries : [];
    for (const e of entries) {
      total++;
      const zh = e.zh === undefined || e.zh === null ? '' : String(e.zh);
      const jp = e.jp === undefined || e.jp === null ? '' : String(e.jp);
      const at = (rule, detail) => ({ file: u.file, id: e.id, zh, rule, detail });
      if (u.kind === 'fontdata' && PENDING.test(zh)) errors.push(at('PENDING_MARK', '译文仍含 ◇/※（字库渠道导入时会被剥离，改变文意）'));
      if (CTRL.test(zh)) errors.push(at('CTRL_CHAR', '译文含控制字符/替换字符'));
      const kanaLeak = [...new Set([...zh])].filter(c => KANA.test(c) && !jp.includes(c) && !KANA_ALLOW.test(e.id));
      if (kanaLeak.length) errors.push(at('JP_KANA', '译文残留日文假名: ' + kanaLeak.join('')));
      const tj = tokensOf(jp), tz = tokensOf(zh);
      if (jp && tj.join('\u0001') !== tz.join('\u0001')) {
        errors.push(at('TOKEN_MISMATCH', `占位符不一致 jp=[${tj.join(' ')}] zh=[${tz.join(' ')}]`));
      }
      if (OTHER_SCRIPT.test(zh)) warns.push(at('OTHER_SCRIPT', '译文含非中日文脚本字符'));
      if (!zh && jp) warns.push(at('EMPTY', '未翻译（zh 为空，保留原文）'));
      if (u.kind === 'plaintext' && gf.extended && !e.id.startsWith('pt::etxt::')) {
        fontChecked = true;
        const miss = [...new Set([...zh])].filter(c => c.charCodeAt(0) > 0x7f && !gf.chars.has(c));
        if (miss.length) errors.push(at('MISSING_GLYPH', '全局字库缺字: ' + miss.join('')));
      }
    }
  }
  return { errors, warns, total, files, fontChecked, fontExtended: gf.extended };
}

// Build-time diagnostics written by importsheet.js during the just-finished run.
function collectBuildDiagnostics(sinceMs) {
  const OUT = WORK + '/import';
  const out = [];
  const push = (f, label) => {
    try {
      const st = fs.statSync(f);
      if (st.mtimeMs < sinceMs - 1500) return;
      const txt = fs.readFileSync(f, 'utf8').trim();
      if (txt) out.push({ file: path.basename(f), label, txt });
    } catch (e) { /* absent */ }
  };
  push(OUT + '/_fitfail.txt', '字库图集放不下（记录名 : 需求/可用 : 句子）');
  push(OUT + '/_capskip.txt', '字库图集跳过');
  try {
    for (const f of fs.readdirSync(OUT)) if (/^_cap_.+\.txt$/.test(f)) push(OUT + '/' + f, '图集容量不足');
  } catch (e) { /* no import dir */ }
  return out;
}

function printReport(pf, diag, quiet) {
  const L = [];
  if (pf) {
    L.push('==== 译文校验（translator-view） ====');
    L.push(`文件 ${pf.files} 个，条目 ${pf.total} 条，错误 ${pf.errors.length}，警告 ${pf.warns.length}`
      + `（全局字库缺字检查：${pf.fontExtended ? '已启用' : '跳过（未找到 fontidexu8_new.tbl）'}）`);
    const show = arr => {
      const byFile = {};
      for (const x of arr) (byFile[x.file] = byFile[x.file] || []).push(x);
      for (const f of Object.keys(byFile)) {
        L.push(`  -- ${f} (${byFile[f].length}) --`);
        for (const x of byFile[f].slice(0, 60)) {
          L.push(`     [${x.rule}] ${x.id} ${x.detail}`);
          if (x.zh) L.push(`         zh: ${JSON.stringify(x.zh)}`);
        }
        if (byFile[f].length > 60) L.push(`     ... +${byFile[f].length - 60} more`);
      }
    };
    if (pf.errors.length) { L.push('  == 错误（会导致打包中止/游戏异常）=='); show(pf.errors); }
    if (!quiet && pf.warns.length) { L.push('  == 警告 =='); show(pf.warns); }
  }
  if (diag && diag.length) {
    L.push(''); L.push('==== 构建诊断（本次打包） ====');
    for (const d of diag) { L.push(`  -- ${d.file} :: ${d.label} --`); for (const ln of d.txt.split('\n')) L.push('     ' + ln); }
  }
  const text = L.join('\n');
  console.log(text);
  return text;
}

module.exports = { preflight, collectBuildDiagnostics, printReport };

if (require.main === module) {
  const quiet = process.argv.includes('--quiet');
  const pf = preflight();
  printReport(pf, [], quiet);
  const nErr = pf.errors.length;
  console.log(`\nvalidation: errors ${nErr}, warns ${pf.warns.length}`);
  process.exit(nErr ? 1 : 0);
}
