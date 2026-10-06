[English](TECHNICAL.md) | [简体中文](TECHNICAL.zh-CN.md)

# Technical Notes

Reverse-engineering findings, implementation details and unresolved technical
questions for the SIREN: New Translation (BCJS30020) zh-CN localization.

Knowledge is preserved so future contributors do not need to rediscover it.
**Confidence is classified** as Verified / High-confidence deduction / Unverified
hypothesis. Most of the on-disc behaviour below is *Verified* by loadable,
in-place artifacts (the localized data boots in RPCS3); structural reads are
labelled by how they were confirmed.

---

# 1. Evidence Classification

- **Verified** — confirmed by producing a working artifact or by inspecting the
  original data directly.
- **High-confidence deduction** — consistent across all observed records.
- **Unverified hypothesis** — plausible but not confirmed.

Where a claim was only inferred from the localization tooling (not from the
engine), it is marked as such.

---

# 2. Supported Game Build

```text
Game:         SIREN: New Translation
Platform:     PlayStation 3
Region:       Japan
Distribution: physical disc (installs data to HDD on first run)
Disc ID:      BCJS30020
Executable:   PS3_GAME/USRDIR/EBOOT.BIN
File size:    not yet recorded in-repo
SHA-256:      not yet recorded in-repo
```

All offsets/structures below are assumed valid only for this release. The
project does **not** patch the executable (see §15), so no code-offset table is
required; the risk is limited to data-format assumptions.

---

# 3. Text Resource Map

All user-visible text is data-driven; there is no hard-coded system text in the
executable that the localization needs to touch. Text lives in four channels,
spread over three archive groups.

| Resource | Purpose | Channel | Encoding | Editable | Notes |
|---|---|---|---|---|---|
| `common.dat` `hud/movie/*` | cutscene subtitles | glyph atlas | glyph-index | yes | FONTDATA records |
| `common.dat` `hud/launcher/jimaku/archive_*` | archive-video subtitles | glyph atlas | glyph-index | yes | FONTDATA |
| `common.dat` `hud/launcher/label` | launcher labels | glyph atlas | glyph-index | yes | FONTDATA + `label.dds` |
| `sNN.dat` (chapter) | chapter system text | glyph atlas | glyph-index | yes | `sNN0` FONTDATA |
| `sNN.dat` (chapter) | GUIDE/TUTORIAL | glyph atlas | glyph-index | yes | `sNN1` FONTDATA, different header |
| `sNN.dat` `hud/mission/sNN_mission` | HUD mission text | MSN_DATA + DXT1 | glyph atlas + names | yes | §6 |
| menus/UI textures (`menu/jp/**`, `hud/**`) | menus, warnings, options, map, status, store, manual, archive | baked image | A8 / DXT1 / DXT5 | yes | re-render texture |
| `text/system.dat`, `installarchive/header_*.txt` | system text, archive headers | UTF-8 plain text | UTF-8 | yes | rendered via global font §7 |
| `setting/render_setting.txt` | render settings | Shift-JIS | SJIS | no | JP only in `#` comments, never rendered |
| `productlist.txt`, `pjp_*_data.txt` | store/product ID/value tables | ASCII | no | identifiers, not translated |

Do not assume all visible text comes from one source; the four channels have
different encodings, capacities and rebuild paths.

---

# 4. Archive Container (SNTP) — high level

Verified. Game data archives are a three-file SNTP container:

```text
common.hed   index (entry table, sizes, names)
common.dat   payload (concatenated entries)
common.siz   secondary size manifest
```

The index is big-endian. Each chapter archive (`s01.dat` …) is an entry inside
`common.dat`, and each chapter itself contains two FONTDATA tables (`sNN0`,
`sNN1`) plus a mission atlas. Detailed field layout: `docs/FILE_FORMATS.md` §SNTP.

The localization uses a **zero-relocation** update strategy: replacement content
must not exceed the space available at the entry's original offset, so offsets
and the `.siz` manifest never change (only the entry `size` field in `.hed` is
updated). `sntp_pack.js` additionally permits growth up to the next entry's start
address. See `docs/PITFALLS.md`.

---

# 5. FONTDATA (glyph-index text) — Verified

Variable text is stored as **glyph indices** into a per-table DXT1 atlas.

Record header:

```text
u16 flag
u16 x N   width fields          (N = flag >> 8)
FF FD <ctl:u16> FF FC           (control sequence)
u16 tailA
body ... 0xFFFF                 (terminator)
```

- `N = flag >> 8`: `0x0101` → 1 width field (12-byte header), `0x0201` → 2
  (14-byte header), `0x0301`/`0x0401`/`0x0701` → 3/4/7 width fields.
- The control sequence is `FF FD <u16> FF FC`; the embedded `<u16>` depends on
  the table family: chapter `sNN0` / movie / archive = `0x181C`; `sNN1` =
  `0x1216`.
- `0x0201` records contain an extra `u16` inside the body equal to the second
  segment's width; it must be skipped when decoding (implemented in
  `msgdecode.readPayload` / `importsheet.readMsg`).
- Duplicate record names exist. `msgwrite.js` allocates same-named edits and
  same-named records **in order, 1:1**; the sXX1 draft disambiguates with the key
  `NAME@0x<flag>`.

Capacity (hard constraint, Verified):

```text
bodyLen = (style ? 4 : 0) + 2 * len + 2  <=  original record room
```

Exceeding it is a fit-failure and requires shortening the translation.

Atlas capacity:

```text
movie / archive / chapter sNN0 : 21 x 18 = 378 cells
chapter sNN1                   : 28 columns x (H / 22) rows
                                 (512x128 -> 140 ; 512x256 -> 308 cells)
cell 18x22, ink 16x16, advance 16 px
```

The real constraint is *number of glyphs not already present in the atlas* ≤
number of free cells — not the number of translated lines. Shortening
translations does not free cells; translating more messages can unlock protected
cells (a message with a protected glyph must be kept in Japanese if the glyph is
not yet in the atlas).

---

# 6. MSN_DATA (HUD mission atlases) — Verified

Per-chapter HUD mission text is a separate `hud/mission/sNN_mission.dat`
(MSN_DATA) plus `sNN_mission.dds` (256×2048 DXT1, text baked into the atlas).

```text
"MSN_DATA" (8 bytes)
u32 version (= 1)
u32 count   (= 67)
count x 12-byte records
count x 16-byte fixed-length names
```

Record = `u32 a` (y offset) `u16 b` (text pixel width) `u16 c` (line height;
MAIN=21, others=17) `u32 d` (name pointer). Names look like `SNN_OBJECT_MAIN`,
`SNN_OBJECT01_00`. The mission text reuses the `main_map/text_aim` /
`text_smallaim` translations (see §19).

---

# 7. Font System — Verified

Two independent font systems exist.

### 7.1 Per-table glyph atlases (channels A/B, §5)

Each FONTDATA table carries its own DXT1 atlas. New glyphs are rendered with
GDI+ (PowerShell `render_text.ps1`) and written into free cells; the glyph index
table in the message record is rewritten accordingly. **Glyph atlases are
rendered with 1-bit hinting** (`TextRenderingHint::SingleBitPerPixelGridFit`,
option `hint:'sbp'`) because anti-aliasing made 17–20 px CJK strokes grey/mushy
after DXT1 quantization — the original Japanese glyphs are near 1-bit.

### 7.2 Global font (UTF-8 plain-text channel)

```text
font01.dds       1024x4096 DXT1, 20x20 cells, 51 columns, 139 rows = 7089 slots
fontidexu8.tbl   character -> glyph index table
shader/system/font.fbin   runtime font shader
```

`fontidexu8.tbl` layout: from byte offset `2000` ("Table B"), each entry is
`char[4]` (the glyph's UTF-8 bytes stored **reversed**) followed by `u32BE
glyphIndex`. Cell coordinates: `col = g % 51`, `row = floor(g / 51)`,
`x = col*20`, `y = row*20 + 1`.

The table was a **Japanese** font and lacked 12 Simplified glyphs:
`载 请 戏 关 闭 电 盘 词 编 华 德 ·`. The localization injects SimHei glyphs into
free slots `7059–7070` and appends 12 records (table grows `58472 → 58568` B,
within the `59392` B allocation region for that entry, so no offsets move).

`main_hiragana.dds` / `launcher_title/element/hiragana.dds` / `*.epm` are glyph
sources and layout descriptors for the calligraphic titles; they contain no text
and are replaced via the bitmap channel.

---

# 8. Rendering Pipeline (as understood)

```text
FONTDATA record
  -> glyph-index stream
  -> per-table atlas lookup
  -> narrow/wide width fields + control sequence
  -> layout (segment widths) 
  -> renderer

UTF-8 container text
  -> fontidexu8.tbl lookup
  -> font01.dds atlas
  -> renderer

baked texture text
  -> pre-rasterized by the asset pipeline (nothing at runtime)
```

The localization does **not** hook or replace renderer code; it only changes data
(atlas pixels, glyph indices, record lengths, baked textures).

---

# 9. Control Codes

| Code | Meaning | Status |
|---|---|---|
| `FF FD <u16> FF FC` | in-record segment/format control sequence, `<u16>` = `0x181C` (sNN0/movie/archive) or `0x1216` (sNN1) | Verified |
| `0xFFFF` | record terminator | Verified |
| `u16 flag` high byte | count of width fields | Verified |
| `0x0201` embedded width `u16` | second-segment width stored in body | Verified |

Unknown recurring byte sequences must be preserved.

---

# 10. Text Encoding

- Channel A (glyph atlas): **glyph-index encoded** — not a character encoding.
- Chapter/tutorial decode tables ship as `chap_templates.json` and the
  `vocab*.json` dictionaries used by the custom Japanese decoder. The decoder is
  imperfect: `◇` marks a decode miss and `※` an uncertain note in drafts. Both are
  stripped on import and must not reach the game. `docs/PITFALLS.md` records the
  resulting mis-decodes (e.g. `鎌→備`, `猟銃→孤銃`).
- Channel C plain text: **UTF-8** (`text/system.dat`, `header_*.txt`).
  `render_setting.txt` is **Shift-JIS** but only its `#` comment lines are
  Japanese, and those are never rendered.
- Baked textures: pixels, not text.

---

# 11. Font Metrics / Layout

- Width fields are per-record, in table cells (see §5).
- `main_map` and the time axis are **bilingual by design**: `*_jp` = Japanese
  line, `*_other` = English line. The localization keeps `*_jp` in Chinese and
  restores the original English in `*_other`; mask regeneration can silently
  re-target `*_other` back to Chinese, so `_revertpatch.js "place_other"
  "time_other"` must run after every batch regeneration.
- A8/DXT baked-text layout is measured from the original texture with
  `_masklines.js` (row/column bands) before re-rendering.

---

# 12. Binary Patches

**None.** `EBOOT.BIN` and all executables are left untouched. The localization is
purely data (archives + textures + font table). This is a deliberate design
choice and removes a large class of version-compatibility risk.

---

# 13. Runtime Hooks

None. No proxy DLL, loader or trampoline is used.

---

# 14. Archive Formats / Secondary Manifests

- Container = SNTP (`.hed` + `.dat`), big-endian. Details in
  `docs/FILE_FORMATS.md`.
- `common.siz` is a secondary size manifest. Because the localization never
  changes offsets or sizes, `common.siz` is unchanged (`docs/PITFALLS.md`).

---

# 15. Compression / Checksums / Alignment

- Textures use **DDS** containers with **DXT1 / DXT5 / A8** payloads; the DDS
  header is preserved and only pixel blocks are rewritten (`build_mask.js`,
  `_dxt5a.js`). No block compression is applied to archive payloads by the
  localization.
- The tooling uses **MD5** internally to detect which files changed
  (`_depcheck.js`, `_repack_disc.js`). Whether the engine itself verifies a
  checksum is **Unverified**; the working builds imply it does not reject the
  patched data.
- Entry alignment is preserved by the zero-relocation strategy.

---

# 16. Linked / Mirrored Strings

- Item names exist in two parallel systems: `AC_CHANGENAME_*` ("switch to
  【…】") and `AC_PICK_UPNAME_*` ("pick up 【…】"), plus `GET_ITEMNAME_*`. All
  three must agree with the **authoritative** item names baked in
  `menu/jp/main_status/{weapon,item}_name/name_i_*.dds`
  (`_itemaudit.js` / `_itemfix.js`, 259 corrections across 24 chapters).
- Character names appear as base / prefixed / abbreviated variants; the archive
  names are used as internal keys, so a shared source is maintained in
  `zh_draft_common.json` (`archive_names`).
- `I_EV_*` records do **not** map 1:1 to `name_i_ev_*` textures; `_itemfix.js`
  deliberately skips them.

---

# 17. Hard-Coded Strings

No user-visible hard-coded system strings requiring translation were found in the
executable. Remaining hard-coded tables (`productlist.txt`, `pjp_*_data.txt`) are
identifiers/values and are intentionally untouched.

---

# 18. Save Data and Identifiers

No display string doubles as a save/quest/inventory identifier in a way the
localization changes: texture/message identifiers (`SNN_OBJECT_*`, `name_i_*`,
record names, `archive_names` keys) are preserved; only display text is changed.
The archive-name map keeps the Japanese original as the key precisely to avoid
breaking references.

---

# 19. Emulator and Runtime Testing

- Emulator: **RPCS3** (verified primarily with build
  `v0.0.17-12558-a06a93d5`). The game reads its **HDD install data**
  (`dev_hdd0/game/BCJS30020/USRDIR/sirenx/data/`), so deployment is dual-write:
  HDD install data **and** the `mirror` disc tree, then `dist` is refreshed by
  `_repack_disc.js`.
- Do not confuse emulator quirks with engine behaviour without verification.

---

# 20. Known Failures / Failed Approaches / Open Questions

Detailed traps are in `docs/PITFALLS.md`; user-visible limitations in
`docs/KNOWN_ISSUES.md`. Notable open items:

- 0x0201 subtitle centering is not always centred (needs in-game regression).
- Decoder mis-reads cause wrong item names unless aligned to the authoritative
  texture names (`_itemfix.js`).
- Long strings overflow fixed slots and must be shortened
  (`bodyLen <= room`).
- `ARCHIVE030` intentionally keeps the Japanese `ろ` (U+308D, a phonetic
  spelling of Uroboros) — audit whitelisted.

---

# 21. Upstream Research

No third-party localization framework or extracted archive library is used;
the container parser and glyph tools are project-authored Node.js scripts.
Runtime testing uses RPCS3 (upstream emulator). GDI+ text rendering is provided
by Windows PowerShell. Upstream attribution should be expanded if any external
tool is later reused.

---

# 22. Tool Inventory

| Tool | Purpose | Source |
|---|---|---|
| `sntp.js` / `sntp_pack.js` | SNTP archive list/extract/repack | project |
| `importsheet.js`, `glyphgen.js`, `msgwrite.js` | FONTDATA extraction, glyph rendering, message rewrite | project |
| `_s11gen.js`, `_s11write.js`, `_s11batch.js` | chapter GUIDE/TUTORIAL atlas generation | project |
| `_labelgen.js`, `_labelwrite.js` | launcher label atlas | project |
| `build_mask.js`, `_maskimport.js`, `_d5gen`…`_d13gen`, `_d12gen.js`, `_s99build.js`, `_manualbuild.js`, `_archivebuild.js`, `_manheadbuild.js`, `_iconbuild.js`, `_msnbuild.js` | baked-texture regeneration | project |
| `_tbladd.js`, `_tblcov.js`, `_fprobe2.js`, `_frender.js`, `_fontcrop.js` | global font atlas extension / verification | project |
| `_deploy.js`, `_chapterdeploy.js`, `_mirrorsync.js`, `_depcheck.js`, `_repack_disc.js` | deploy (HDD+mirror) and disc repack | project |
| `_i18n_export.js`, `_i18n_import.js`, `_i18n_lib.js`, `_pipeline.js` | translator round-trip and shared build pipeline | project |
| `_validate_i18n.js` | translator-view pre-flight validation (marks/kana/control/placeholder/missing-glyph) + build-diagnostic aggregation | project |
| `_subaudit.js`, `_itemaudit.js`, `_chapaudit.js`, `_jmkaudit.js`, `_magicscan.js`, `_finalaudit.js` | automated audits | project |
| `render_text.ps1` | GDI+ glyph rendering | project |
| RPCS3 | runtime verification | upstream (emulator) |
