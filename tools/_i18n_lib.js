'use strict';
// Shared registry for the localisation export/import round-trip.
//
// Every translatable unit is described by an adapter with:
//   file    : the translator-facing JSON file under _hanhua/i18n/
//   kind    : 'fontdata' (glyph-atlas text) | 'texture' (baked image text) | 'plaintext'
//   note    : human description shown at the top of the exported file
//   read()  : -> [{ id, jp, zh, ref?, refName?, meta? }]   (current canonical text)
//   write(entries) : entries [{id, jp, zh}] -> write the polished text back to the
//                    canonical source file(s) in _hanhua/work/
//
// `id` is stable and unique; export and import both derive it the same way, so a
// translator may reorder / add commas / leave comments and the import still maps
// each row back to its origin.  Only `zh` is written back (jp is reference only).
const fs = require('fs');
const path = require('path');

// Roots are resolved centrally (config.local.json / config.example.json,
// falling back to the original legacy paths).  See tools/_config.js.
const _paths = require('./_config.js');
const ROOT = _paths.gameRoot;
const WORK = _paths.WORK;
const I18N = _paths.I18N;
const TOOLS = _paths.TOOLS;
const DISC = _paths.DISC;
const HDD = _paths.HDD;

function RD(p) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return JSON.parse(s);
}
function WR(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
const safeName = s => s.replace(/[^A-Za-z0-9_]+/g, '_');

// ---------------------------------------------------------------------------
// font-atlas line drafts  { note, glossary, lines:[{name,src,text}] }
// ---------------------------------------------------------------------------
function draftUnit(file, paths, jpKey, zhKey) {
  return {
    file, kind: 'fontdata', note: paths.note,
    read() {
      const out = [];
      for (const { p, prefix } of paths.list) {
        if (!fs.existsSync(p)) continue;
        const d = RD(p); const occ = {};
        for (const l of (d.lines || [])) {
          const o = occ[l.name] || 0; occ[l.name] = o + 1;
          out.push({ id: `${prefix}::${l.name}::${o}`, jp: l[jpKey] || '', zh: l[zhKey] || '', file: prefix, name: l.name, occ: o });
        }
      }
      return out;
    },
    write(entries) {
      const byId = new Map(entries.map(e => [e.id, e.zh]));
      for (const { p, prefix } of paths.list) {
        if (!fs.existsSync(p)) continue;
        const d = RD(p); const occ = {}; const src = fs.readFileSync(p, 'utf8');
        let changed = false;
        for (const l of (d.lines || [])) {
          const o = occ[l.name] || 0; occ[l.name] = o + 1;
          const id = `${prefix}::${l.name}::${o}`;
          if (byId.has(id) && byId.get(id) !== l[zhKey]) { l[zhKey] = byId.get(id); changed = true; }
        }
        if (changed) fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
      }
    }
  };
}

function moviePaths() {
  const list = [];
  for (let i = 1; i <= 12; i++) { const ep = String(i).padStart(2, '0'); list.push({ p: `${WORK}/zh_draft_ep${ep}.json`, prefix: `ep${ep}` }); }
  return { list, note: '电影过场对白字幕（字库图集 FONTDATA）。jp=解码出的日文原文(◇/空格为解码缺字)，zh=现用译文。改 zh 即可。' };
}
function chapterPaths() {
  const list = [];
  for (let i = 1; i <= 25; i++) { const s = 's' + String(i).padStart(2, '0'); list.push({ p: `${WORK}/zh_draft_chapter_${s}.json`, prefix: s }); }
  return { list, note: '章节系统文本 sXX0（字库图集 FONTDATA）。jp=日文原文，zh=现用译文。改 zh 即可。' };
}

// ---------------------------------------------------------------------------
// zh_draft_common.json  (archive names / episodes)
// ---------------------------------------------------------------------------
function commonUnit() {
  const p = `${WORK}/zh_draft_common.json`;
  return {
    file: '05_common_names.json', kind: 'fontdata',
    note: '共享档案物品名/档案章节名。archive_names 的 jp 为日文原名(同时是工具内部键，请勿改 jp)，zh=现用中文名。',
    read() {
      const d = RD(p); const out = [];
      for (const [jp, zh] of Object.entries(d.archive_names || {})) out.push({ id: `common::archive_names::${jp}`, jp, zh });
      for (const [name, zh] of Object.entries(d.archive_episodes || {})) out.push({ id: `common::archive_episodes::${name}`, jp: '', zh });
      return out;
    },
    write(entries) {
      const d = RD(p);
      for (const e of entries) {
        const m = /^common::(archive_names|archive_episodes)::(.+)$/.exec(e.id);
        if (!m) continue;
        if (m[1] === 'archive_names' && d.archive_names[m[2]] !== undefined) d.archive_names[m[2]] = e.zh;
        else if (m[1] === 'archive_episodes' && d.archive_episodes && d.archive_episodes[m[2]] !== undefined) d.archive_episodes[m[2]] = e.zh;
      }
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
    }
  };
}

// ---------------------------------------------------------------------------
// zh_draft_sxx1.json  (GUIDE / TUTORIAL, runs nested)
// ---------------------------------------------------------------------------
const RUNSEP = '\u241F', SEGSEP = '\n';
function sxx1Unit() {
  const p = `${WORK}/zh_draft_sxx1.json`;
  const enc = segs => segs.map(runs => runs.join(RUNSEP)).join(SEGSEP);
  const dec = zh => zh === '' ? [] : zh.split(SEGSEP).map(s => s === '' ? [] : s.split(RUNSEP));
  return {
    file: '06_guide_tutorial.json', kind: 'fontdata',
    note: `章节操作指南/教程（sXX1，字库图集 FONTDATA）。此表原始日文未以文本形式保存，jp 留空；如需对照请在游戏内查看。` +
      `zh 内：段与段之间用换行分隔，同一段内的字形分段用「␟」(U+241F) 分隔；按钮图标由写入器自动保留，不要手写图标。`,
    read() {
      const d = RD(p); const out = [];
      for (const [scope, obj] of Object.entries(d)) {
        if (scope.startsWith('_') || typeof obj !== 'object' || obj === null) continue;
        for (const [name, segs] of Object.entries(obj)) out.push({ id: `sxx1::${scope}::${name}`, jp: '', zh: enc(segs) });
      }
      return out;
    },
    write(entries) {
      const d = RD(p);
      for (const e of entries) {
        const m = /^sxx1::([^:]+)::(.+)$/.exec(e.id);
        if (!m) continue;
        if (d[m[1]] && d[m[1]][m[2]] !== undefined) d[m[1]][m[2]] = dec(e.zh);
      }
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
    }
  };
}

// ---------------------------------------------------------------------------
// archive_zh.json  (archive document pages, {entry:[{jp,zh}]})
// ---------------------------------------------------------------------------
function archiveDocUnit() {
  const p = `${WORK}/archive_zh.json`;
  return {
    file: '07_archive_documents.json', kind: 'texture',
    note: '档案正文长文档（A8 掩膜图片）。jp=日文原文，zh=现用译文。改 zh 即可（注意行宽，过长会触发缩字号）。',
    read() {
      const d = RD(p); const out = [];
      for (const [entry, arr] of Object.entries(d)) arr.forEach((ln, i) => out.push({ id: `${entry}::${i}`, jp: ln.jp || '', zh: ln.zh || '', entry }));
      return out;
    },
    write(entries) {
      const d = RD(p);
      for (const e of entries) {
        const k = e.id.lastIndexOf('::'); const entry = e.id.slice(0, k), i = +e.id.slice(k + 2);
        if (d[entry] && d[entry][i]) d[entry][i].zh = e.zh;
      }
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
    }
  };
}

// ---------------------------------------------------------------------------
// manual_zh.json  ({pages:[{id,lines:[{jp,zh}]}]})
// ---------------------------------------------------------------------------
function manualUnit() {
  const p = `${WORK}/manual_zh.json`;
  return {
    file: '08_manual.json', kind: 'texture',
    note: '游戏内说明书（A8 掩膜图片）。jp=日文原文，zh=现用译文。改 zh 即可。',
    read() {
      const d = RD(p); const out = [];
      for (const page of d.pages) page.lines.forEach((ln, i) => out.push({ id: `${page.id}::${i}`, jp: ln.jp || '', zh: ln.zh || '' }));
      return out;
    },
    write(entries) {
      const d = RD(p);
      for (const e of entries) {
        const k = e.id.lastIndexOf('::'); const id = e.id.slice(0, k), i = +e.id.slice(k + 2);
        const page = d.pages.find(x => x.id === id);
        if (page && page.lines[i]) page.lines[i].zh = e.zh;
      }
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
    }
  };
}

// ---------------------------------------------------------------------------
// d12/trans.json  (menu/jp/main_status|main_map, {defaults,items})
// ---------------------------------------------------------------------------
function d12Unit() {
  const p = `${WORK}/d12/trans.json`;
  return {
    file: '09_menu_d12.json', kind: 'texture',
    note: '状态/地图界面文字（A8 掩膜图片，menu/jp/main_status、main_map）。jp 无文本原文，请对照 refs/ 下同名原图 PNG。' +
      '多行用换行 \\n 分隔；size/align/x/y 为排版参数（改 zh 不要改它们）。',
    read() {
      const d = RD(p); const out = [];
      for (const [name, spec] of Object.entries(d.items || {})) {
        const zh = spec.text !== undefined ? spec.text : (spec.lines ? spec.lines.join('\n') : '');
        const meta = {};
        for (const k of ['size', 'bold', 'align', 'x', 'y', 'lh']) if (spec[k] !== undefined) meta[k] = spec[k];
        out.push({ id: `d12::${name}`, jp: '', zh, refName: name, meta });
      }
      return out;
    },
    write(entries) {
      const d = RD(p);
      for (const e of entries) {
        const name = e.id.slice('d12::'.length); const spec = d.items[name];
        if (!spec) continue;
        if (e.zh.includes('\n')) { spec.lines = e.zh.split('\n'); delete spec.text; }
        else { spec.text = e.zh; delete spec.lines; }
      }
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
    }
  };
}

// ---------------------------------------------------------------------------
// UI masks: externalised i18n_src/*.json + standalone job files
// ---------------------------------------------------------------------------
function uiMaskUnit() {
  const SRC = f => `${WORK}/i18n_src/${f}`;
  return {
    file: '10_ui_masks.json', kind: 'texture',
    note: '菜单/UI 掩膜图片文字（A8/DXT 贴图）。jp 无文本原文处请对照 refs/ 下同名原图 PNG。改 zh 即可。',
    read() {
      const out = [];
      const push = (id, zh, refName) => out.push({ id, jp: '', zh: zh || '', refName });
      // ---- externalised small sets ----
      let j = RD(SRC('d5.json'));
      for (const [k, lines] of Object.entries(j.brief)) lines.forEach((t, i) => push(`ui::d5::brief::${k}::${i}`, t, `menu/jp/main_archive/story_brief/archive_${String(k).padStart(2, '0')}_chr.dds`));
      for (const [k, t] of Object.entries(j.category)) push(`ui::d5::cat::${k}`, t, `menu/jp/main_archive/category/menu_archive_group_${k}.dds`);

      j = RD(SRC('d6.json'));
      for (const [k, t] of Object.entries(j.place)) {
        push(`ui::d6::place_jp::${k}`, t, `menu/jp/etc_timecount/place_jp/menu_timecount_s${String(k).padStart(2, '0')}_spot1.dds`);
        push(`ui::d6::place_other::${k}`, t, `menu/jp/etc_timecount/place_other/menu_timecount_s${String(k).padStart(2, '0')}_spot2.dds`);
      }
      for (const [base, t] of j.names) push(`ui::d6::name::${base}`, t, `menu/jp/etc_timecount/name/${base}.dds`);

      j = RD(SRC('d8.json'));
      for (const [k, v] of Object.entries(j.D)) {
        const g = k === 'full' ? 'pjp_full' : 'pjp_' + k;
        push(`ui::d8::title::${k}`, v[0], `menu/jp/launcher_store/products/${g}/${g}_title.dds`);
        v[1].forEach((t, i) => push(`ui::d8::text::${k}::${i}`, t, `menu/jp/launcher_store/products/${g}/${g}_text.dds`));
      }

      j = RD(SRC('d9.json'));
      for (const [k, conf] of Object.entries(j.C)) conf.lines.forEach((ln, i) => push(`ui::d9::${k}::${i}`, ln.text, `menu/jp/caution/caution_${k}.dds`));

      j = RD(SRC('d10.json'));
      for (const [k, t] of Object.entries(j.T)) push(`ui::d10::${k}`, t, `menu/jp/main_option/big_choice/menu_option_${k}.dds`);

      j = RD(SRC('d11.json'));
      for (const dir of ['rdown', 'rright']) j[dir].forEach(([base, t]) => push(`ui::d11::${dir}::${base}`, t, `menu/jp/common/${dir}/menu_linehelp_${base}.dds`));

      j = RD(SRC('d13.json'));
      push(`ui::d13::text`, j.text, 'hud/s99/now_loading.dds');

      j = RD(SRC('manhead.json'));
      for (const [base, t] of Object.entries(j.small)) push(`ui::manhead::small::${base}`, t, `menu/jp/main_manual/small_subject/${base}.dds`);
      j.head.forEach((t, i) => push(`ui::manhead::head::${i}`, t, 'menu/jp/main_manual/big_subject/menu_manual_head_control.dds'));

      j = RD(SRC('icon.json'));
      j.labels.forEach((l, i) => push(`ui::icon::${i}`, l.zh, 'hud/font_02_icon_jp.dds'));
      // ---- standalone job files ----
      for (const jb of JOB_FILES) {
        const jp = `${WORK}/${jb}.json`;
        if (!fs.existsSync(jp)) continue;
        const d = RD(jp);
        (d.items || []).forEach(it => (it.lines || []).forEach((ln, i) => push(`ui_job::${jb}::${it.name}::${i}`, ln.text, it.name)));
      }
      return out;
    },
    write(entries) {
      const byId = new Map(entries.map(e => [e.id, e.zh]));
      // externalised small sets
      let j = RD(SRC('d5.json'));
      for (const [k, lines] of Object.entries(j.brief)) lines.forEach((t, i) => { const id = `ui::d5::brief::${k}::${i}`; if (byId.has(id)) lines[i] = byId.get(id); });
      for (const k of Object.keys(j.category)) { const id = `ui::d5::cat::${k}`; if (byId.has(id)) j.category[k] = byId.get(id); }
      WR(SRC('d5.json'), j);

      j = RD(SRC('d6.json'));
      for (const k of Object.keys(j.place)) { const id = `ui::d6::place_jp::${k}`; if (byId.has(id)) j.place[k] = byId.get(id); }
      j.names.forEach((row, i) => { const id = `ui::d6::name::${row[0]}`; if (byId.has(id)) j.names[i][1] = byId.get(id); });
      WR(SRC('d6.json'), j);

      j = RD(SRC('d8.json'));
      for (const [k, v] of Object.entries(j.D)) {
        const idT = `ui::d8::title::${k}`; if (byId.has(idT)) v[0] = byId.get(idT);
        v[1].forEach((t, i) => { const id = `ui::d8::text::${k}::${i}`; if (byId.has(id)) v[1][i] = byId.get(id); });
      }
      WR(SRC('d8.json'), j);

      j = RD(SRC('d9.json'));
      for (const [k, conf] of Object.entries(j.C)) conf.lines.forEach((ln, i) => { const id = `ui::d9::${k}::${i}`; if (byId.has(id)) ln.text = byId.get(id); });
      WR(SRC('d9.json'), j);

      j = RD(SRC('d10.json'));
      for (const k of Object.keys(j.T)) { const id = `ui::d10::${k}`; if (byId.has(id)) j.T[k] = byId.get(id); }
      WR(SRC('d10.json'), j);

      j = RD(SRC('d11.json'));
      for (const dir of ['rdown', 'rright']) j[dir].forEach((row, i) => { const id = `ui::d11::${dir}::${row[0]}`; if (byId.has(id)) j[dir][i][1] = byId.get(id); });
      WR(SRC('d11.json'), j);

      j = RD(SRC('d13.json'));
      if (byId.has('ui::d13::text')) j.text = byId.get('ui::d13::text');
      WR(SRC('d13.json'), j);

      j = RD(SRC('manhead.json'));
      for (const base of Object.keys(j.small)) { const id = `ui::manhead::small::${base}`; if (byId.has(id)) j.small[base] = byId.get(id); }
      j.head.forEach((t, i) => { const id = `ui::manhead::head::${i}`; if (byId.has(id)) j.head[i] = byId.get(id); });
      WR(SRC('manhead.json'), j);

      j = RD(SRC('icon.json'));
      j.labels.forEach((l, i) => { const id = `ui::icon::${i}`; if (byId.has(id)) l.zh = byId.get(id); });
      WR(SRC('icon.json'), j);
      // standalone job files
      for (const jb of JOB_FILES) {
        const jp = `${WORK}/${jb}.json`;
        if (!fs.existsSync(jp)) continue;
        const d = RD(jp); let changed = false;
        (d.items || []).forEach(it => (it.lines || []).forEach((ln, i) => {
          const id = `ui_job::${jb}::${it.name}::${i}`;
          if (byId.has(id) && byId.get(id) !== ln.text) { ln.text = byId.get(id); changed = true; }
        }));
        if (changed) WR(jp, d);
      }
    }
  };
}
const JOB_FILES = ['mask_job_mission', 'mask_job_pause', 'mask_job_results', 'mask_job_ui2', 'mask_job_archhead', '_d7_job'];

// ---------------------------------------------------------------------------
// plaintext UTF-8 containers
// ---------------------------------------------------------------------------
function plaintextUnit() {
  const jpLines = p => { try { let s = fs.readFileSync(p, 'utf8'); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return s.replace(/\r\n/g, '\n').split('\n'); } catch (e) { return []; } };
  const readBlob = p => { try { let s = fs.readFileSync(p, 'utf8'); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); return s; } catch (e) { return ''; } };
  return {
    file: '11_plaintext.json', kind: 'plaintext',
    note: 'UTF-8 纯文本容器（走全局字库 font01.dds 渲染，不是图集）。jp=原文，zh=现用译文。改 zh 即可；行数请保持一致。',
    read() {
      const out = [];
      const pair = (key, jpPath, zhPath, entry) => {
        const jp = jpLines(jpPath), zh = jpLines(zhPath);
        const n = Math.max(jp.length, zh.length);
        for (let i = 0; i < n; i++) {
          if (i === n - 1 && (zh[i] === '' && jp[i] === '')) continue;
          out.push({ id: `pt::${key}::${i}`, jp: jp[i] || '', zh: zh[i] || '', refName: entry });
        }
      };
      pair('system', `${WORK}/system_jp.dat`, `${WORK}/system_zh.dat`, 'text/system.dat');
      pair('music', `${WORK}/header_music.txt`, `${WORK}/header_music_zh.txt`, 'installarchive/header_music.txt');
      pair('photo', `${WORK}/header_photo.txt`, `${WORK}/header_photo_zh.txt`, 'installarchive/header_photo.txt');
      const rep = RD(`${WORK}/i18n_src/etxt.json`).rep;
      rep.forEach((r, i) => out.push({ id: `pt::etxt::${i}`, jp: r[0], zh: r[1] }));
      return out;
    },
    write(entries) {
      const byId = new Map(entries.map(e => [e.id, e.zh]));
      const rebuild = (key, zhPath, tailCRLF) => {
        const rows = entries.filter(e => e.id.startsWith(`pt::${key}::`))
          .sort((a, b) => (+a.id.split('::')[2]) - (+b.id.split('::')[2]));
        const txt = rows.map(r => r.zh).join('\r\n') + (tailCRLF ? '\r\n' : '');
        fs.writeFileSync(zhPath, txt, 'utf8');
      };
      rebuild('system', `${WORK}/system_zh.dat`, true);
      rebuild('music', `${WORK}/header_music_zh.txt`, true);
      rebuild('photo', `${WORK}/header_photo_zh.txt`, true);
      const j = RD(`${WORK}/i18n_src/etxt.json`);
      j.rep.forEach((r, i) => { const v = byId.get(`pt::etxt::${i}`); if (v !== undefined) r[1] = v; });
      WR(`${WORK}/i18n_src/etxt.json`, j);
    }
  };
}

// ---------------------------------------------------------------------------
const UNITS = [
  draftUnit('01_movie_subtitles.json', moviePaths(), 'src', 'text'),
  draftUnit('02_archive_subtitles.json', { list: [{ p: `${WORK}/zh_draft_archive.json`, prefix: 'jimaku' }], note: '档案影片对白字幕（字库图集 FONTDATA）。jp=日文原文，zh=现用译文。' }, 'src', 'text'),
  draftUnit('03_label.json', { list: [{ p: `${WORK}/zh_draft_label.json`, prefix: 'label' }], note: '启动器标签（hud/launcher/label，字库图集 FONTDATA）。jp=日文原文，zh=现用译文；zh 内 \\n 分段。' }, 'src', 'text'),
  draftUnit('04_chapters.json', chapterPaths(), 'src', 'text'),
  commonUnit(),
  sxx1Unit(),
  archiveDocUnit(),
  manualUnit(),
  d12Unit(),
  uiMaskUnit(),
  plaintextUnit(),
];

module.exports = { ROOT, WORK, I18N, TOOLS, DISC, HDD, RD, WR, safeName, UNITS, RUNSEP, SEGSEP, JOB_FILES };
