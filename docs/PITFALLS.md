# Pitfalls

Failed approaches, fragile workflows and technical traps discovered while
building the zh-CN localization. Preserve negative knowledge: these cost real
investigation time.

Status: **Verified** unless noted.

---

# 1. "I changed it but the game still shows Japanese" — dual-write

**Symptom:** a patch is present in the HDD install data but the game is unchanged
(or vice versa).

**Cause:** the game reads the RPCS3 **HDD install data**
(`dev_hdd0/game/BCJS30020/USRDIR/sirenx/data/`), while the disc tree
(`PS3_GAME/`) and the `mirror` hardlink tree are separate copies. `common.dat`
must be written to **both** the HDD and the mirror.

**Rule:** deploy with `_deploy.js` (HDD + mirror), verify with `_depcheck.js`
(expect HDD-only 0 / mirror-only 0). Chapters additionally need
`_chapterdeploy.js` + `_mirrorsync.js`.

---

# 2. "It works on my machine but a fresh install is Japanese" — disc install

**Symptom:** the localization works in the current RPCS3 profile but reverts to
Japanese after reinstalling the game.

**Cause:** this is a disc title (`PARAM.SFO CATEGORY=DG`). First run installs data
from the **disc source** to the HDD. Patching only the HDD is invisible to a new
install.

**Rule:** a release must patch the disc source. `_repack_disc.js --apply` copies
the changed data files into `dist/`, which is overlaid on `PS3_GAME`.

---

# 3. The mirror uses hard links — writing in place corrupts the original

**Symptom:** editing a mirror file also changes the disc original.

**Cause:** `_hanhua/mirror/**` files are hard links to the originals.

**Rule:** `fs.unlinkSync` the link first, then write a new file
(`_deploy.js` and `_mirrorsync.js` do this, with a fallback overwrite when the
sandbox forbids deletion).

---

# 4. Bilingual map/time textures: `*_other` silently becomes Chinese

**Symptom:** after regenerating menu masks, the English sub-line of the map/time
UI turns Chinese, so both lines are identical.

**Cause:** mask regeneration re-targets the `*_other` patch entries to the
Chinese rendering.

**Rule:** after any batch mask regeneration, run
`node _revertpatch.js "place_other" "time_other"` before `_deploy.js`. This is
part of `_pipeline.js`; run it manually if you regenerate outside the pipeline.

---

# 5. FONTDATA capacity is a hard fail, not a warning

**Symptom:** import aborts with a fit failure; a record will not fit.

**Cause:** `bodyLen = (style ? 4 : 0) + 2*len + 2` must be `≤` the original
record room. Separately, the number of glyphs **not already in the atlas** must
not exceed the free cells.

**Rule:** shorten the translation. Note that **deleting translations does not
free atlas cells** — only adding glyph coverage that was previously protected
helps. The importer writes `work/import/_cap_*.txt` / `_fitfail.txt` diagnostics.

---

# 6. `0x0201` / `0x0200` records hide a width field inside the body

**Symptom:** a two-segment subtitle decodes/renders with a stray glyph or wrong
centering.

**Cause:** `0x0201` / `0x0200` record bodies embed a `u16` equal to the second
segment's width that is not a glyph index.

**Rule:** skip it on decode (`msgdecode.readPayload` / `importsheet.readMsg`);
when writing, emit one width field per segment and re-insert the `FF FE FF FC` +
width separator between segments (`msgwrite.js`).

### 6a. Multi-line records were collapsed to a single line

**Symptom:** cutscene / in-game subtitles and multi-line system messages render
as one long, off-centre line — the line break present in the Japanese original is
gone (e.g. `章节5 chapter2` = `s08` `CHA_ST08EVENT*`).

**Cause:** the writer always rebuilt style-less records with a single width field
(`0x0101`), discarding the original segment split (`flag` `0x0201` / `0x0200`).

**Fix:** a draft `text` may now carry `\n`. `importsheet.js` splits it into
segments and `msgwrite.js` rebuilds the multi-segment layout
(`flag = (N << 8) | lowByte`), falling back to one line only if the restored
layout does not fit. The breaks were re-derived from the saved originals
(`work/import/*.orig.dat`) and baked into the drafts, so the line structure
survives an export/import round-trip.

### 6b. A space glyph can leak a stale atlas glyph

**Symptom:** a subtitle shows a single stray kanji — e.g. a lone `役` in the
Episode 1 Chapter 1 cutscene — with no matching draft text.

**Cause:** the draft translation was just a space (`" "`), and no atlas cell was
labelled with a space, so the importer reserved a *free* cell for it. The second
half of the free-cell list still holds cells with old ink (the original Japanese
glyphs); since spaces were never drawn, that old bitmap survived and the record
pointed at it. (`EP01_CP1_32` referenced a cell holding `役`.)

**Fix:** `importsheet.js` now also *renders* the space cells (an inkless draw
clears them), so a space can never expose a leftover glyph. The same change also
removed a phantom `\n` cell: the edit `text` is stored without the segment
separator, so `\n` is no longer treated as a needed glyph.

**Note:** an over-length translation is a separate leftover-Japanese source — the
importer keeps the Japanese original when a record cannot fit its slot. Five such
records (`EP07_CP3_02`, `s09`/`s11 CHA_CAUTION2_DOS_0`, `s09 EP06_CP2_3_03`,
`s13 CHA_ST13EVENT1_GAK_1`) were shortened by 1–2 characters to fit.

---

# 7. Duplicate record names — "only the first was translated"

**Symptom:** some in-game lines stay Japanese even though the draft has a
translation (e.g. `s220 GET_ITEMNAME_I_SP_04`).

**Cause:** some tables contain several records with the same name; the old writer
matched only the first.

**Rule:** same-named edits map to same-named records **in order, 1:1**
(`msgwrite.js`). For sXX1 drafts use `NAME@0x<flag>` to disambiguate.

---

# 8. The Japanese decoder mis-reads characters

**Symptom:** an item prompt says "switch to 【备】" but you receive a 镰刀
(sickle) — the name is wrong.

**Cause:** the custom Japanese decoder mis-identifies some glyphs
(`鎌→備`, `猟銃→孤銃`, `寝室→环室`, `祈祷所→诊所`, …). Translating the mis-read
produced a wrong item name.

**Rule:** never trust the decoded JP for item names. Align to the **authoritative**
names baked in `menu/jp/main_status/{weapon,item}_name/name_i_*.dds` via
`_itemaudit.js` / `_itemfix.js`, and keep `AC_CHANGENAME_*`, `AC_PICK_UPNAME_*`
and `GET_ITEMNAME_*` in agreement. `I_EV_*` is deliberately skipped (`name_i_ev_*`
does not map 1:1 to the record id).

---

# 9. `◇` and `※` in drafts are not punctuation

**Symptom:** a `◇` appears where a real character should be, or an uncertain note
leaks into a translation.

**Cause:** `◇` marks a decoder miss (sometimes a real missing glyph, sometimes a
line marker); `※` marks an uncertain note.

**Rule:** clean drafts before review (`_unkclean.js`); the importer strips both so
they never reach the game, but leaving them hurts reviewability. A handful of `◇`
were genuine missing characters and were restored from the original glyphs
(`_glyphview.js`).

---

# 10. Anti-aliased CJK glyphs look mushy after DXT1

**Symptom:** Simplified glyphs in atlases look grey/fuzzy while baked-texture
text looks fine.

**Cause:** `render_text.ps1` used anti-aliasing; at 17–20 px, CJK hairline strokes
become grey, then DXT1 quantization washes them out. The original Japanese glyphs
are essentially 1-bit.

**Rule:** render **atlases** with `hint:'sbp'` (SingleBitPerPixelGridFit); keep
anti-aliasing for A8 masks (large text).

---

# 11. Chapter 9 exists only on the HDD

**Symptom:** `s09` cannot be regenerated; `importsheet` reports no reference
glyphs.

**Cause:** the development disc tree is missing `s09.dat` (~97 MB); it lives only
in the HDD install. The HDD `s090` is already all-Chinese, so there are no
original Japanese glyphs to diff against.

**Rule:** restore the original `s090` base once (`_s09base.js` →
`work/import/s090.orig.*`), then rebuild with
`SNT_BASE=work/base_s09_orig importsheet --chapter s09`. `_pipeline.js` automates
this and warns if the base is missing.

---

# 12. The old font pipeline missed steps

**Symptom:** after `_setfont --rebuild`, only the font changed; menus/masks were
not updated and `dist` was stale.

**Cause:** the old pipeline ran `_d12full` (preview only) instead of `_d12gen`,
and omitted standalone mask jobs, `_labelwrite`, the global font atlas, `s09`,
and `_repack_disc`.

**Rule:** both `_setfont --rebuild` and import use the shared `_pipeline.js`; if
you write a new pipeline, mirror its step list.

---

# 13. `0xFF` padding overwrites the trailing name block

**Symptom:** the last FONTDATA record corrupts a following name string.

**Cause:** when editing the final record, `0xFF` alignment padding overwrote the
name block that follows.

**Rule:** clamp the record range to `nameStart` when writing.

---

# 14. Merging archive lines causes cascading page shift

**Symptom:** archive No.18 ends with No.19's text; No.19 starts with No.20's
header; a two-line cascade.

**Cause:** an archive batch file merged rows 6/7 of page a18 into one line; the
freed slot let a19's first line move up, shifting every following page.

**Rule:** keep the original per-page line counts. Verify with `_archpage.js`
(re-render the original page) and `_archaudit.js` (cross-page/adjacent-boundary
duplicate detection).

---

# 15. Zero-relocation is mandatory for archive writes

**Symptom:** a repacked archive loads with missing/truncated resources.

**Cause:** changing an entry's size/offset desynchronizes the `.hed` table and the
`.siz` manifest (and possibly the engine's expectations).

**Rule:** replacement content must fit at the original offset; only the entry
`size` may change, and growth is allowed only up to the next entry's start
(`sntp_pack.js`). `common.siz` must remain unchanged.

---

# 16. Hard-coded absolute paths

**Symptom:** tools fail on any machine other than the original developer's.

**Cause:** ~159 tools embed `d:/MYFILE/ps3/BCJS30020/...` and a fixed RPCS3 path.

**Rule (current):** `tools/_bootstrap.js` rewrites these literals at load time
from `tools/_config.js` (config.local.json). With no config, legacy paths are
used. The proper long-term fix is to fold the roots into the sources natively.

---

# 17. Sandbox / permissions on the HDD directory

**Symptom:** deployment fails with permission errors writing
`dev_hdd0/game/BCJS30020/...`.

**Cause:** the RPCS3 HDD path is outside the repo, and some restricted
environments forbid writing there.

**Rule:** grant write access for deployment, or build only (`dist` still
produced). `_deploy.js` tolerates an unlink failure and overwrites in place.

---

# 18. PowerShell quoting in generated commands

**Symptom:** multi-line Node snippets passed inline through PowerShell get
mangled by escaping.

**Cause:** PowerShell expands `$` / `${}` inside double-quoted strings.

**Rule:** write scripts to `.js` files and execute those, or use single-quoted
here-strings; do not rely on inline multi-line Node via PowerShell.

---

# 19. Reproducibility is functional, not byte-identical

**Symptom:** rebuilding produces archives that differ at the byte level from a
previous release.

**Cause:** GDI+ rasterization varies with Windows/font versions; DDS encoding is
not guaranteed identical.

**Rule:** document the expected reproducibility level ("functionally identical");
do not claim byte-identical output.

---

# 20. Injected paths must use forward slashes

**Symptom:** after pointing the tools at a new directory, they silently read/write
the wrong place (or a directory named like `MYFILEps3...` appears under `tools/`).

**Cause:** Node's `NODE_OPTIONS` parser consumes backslashes (so
`--require "D:\x\y.js"` breaks), and `tools/_bootstrap.js` / `_extract_base.js`
inject resolved roots into JavaScript and JSON **string literals**, where Windows
backslashes are either swallowed (`\M` → `M`) or create invalid escapes.

**Rule:** every path produced by `tools/_config.js` (especially `REPO`) must use
**forward slashes**; `_config.js` normalizes `REPO` and `norm()` converts config
values. `build.ps1` converts `-GameDir`/`-HddDir` to forward slashes and passes
the shim path with forward slashes. Do not reintroduce `path.resolve`-style
backslash roots into the config module.

---

# 21. Path substitutions must be single-pass

**Symptom:** with a game directory other than the original developer path, tools
fail with `EPERM: ... mkdir '<gameDir>\_hanhua\Siren-New-Translation-CN\work\...'`
— i.e. the resolved `WORK` got the *game directory* prepended to it.

**Cause:** the shim applied its substitutions **sequentially** over the whole
text. Because the repository itself lives under the legacy root, the replacement
value for `WORK`
(`…/BCJS30020/_hanhua/Siren-New-Translation-CN/work`) still contained the
legacy prefix `d:/MYFILE/ps3/BCJS30020`, which a **later** rule
(`legacy root -> gameRoot`) then matched and rewrote, yielding
`<gameDir>/_hanhua/…`.

**Rule:** apply all substitutions in a **single pass** (one alternation regex,
longest needle first), so replacement values are never re-scanned. This is
implemented once in `_config.js` (`substitute()`) and used by both
`_bootstrap.js` and `_extract_base.js`. This bug is invisible when
`gameRoot === legacy root` (identity), which is why it only appeared with an
external game directory.

---

# 22. The build workspace must be the sibling of `tools/`

**Symptom:** `glyphgen.js` (and `render_text.ps1`) fail with
`ENOENT: ... open '<repo>\work\_glyphjob.json'` (or write to the wrong place),
even though `WORK` is configured.

**Cause:** `glyphgen.js` uses `path.join(__dirname, '..', 'work')` and
`render_text.ps1` uses `$PSScriptRoot '..\work\font_cfg.json'` — both assume the
original layout where `tools/` and `work/` are siblings. An earlier default
(`<repo>/build/work`) broke that assumption.

**Rule:** the default `WORK` is `<repo>/work`, the sibling of `tools/`
(`_config.js`). Any alternate `workDir` must preserve the `tools/../work`
relationship or those two tools will look in the wrong place.

> **Resolved.** The load-time shim described in #20–#22 has since been removed:
> every tool now resolves its roots **natively** from `tools/_config.js`, and the
> path values in the few data files are stored workspace-relative. These entries
> are kept as history/lessons (and because a stray absolute path could
> reintroduce them).

---

# 23. The hand-transcribed decoder dictionary is broadly mis-transcribed

**Symptom:** a record's exported Japanese original (and the translation made from
it) is wrong in a way that changes the meaning. Reported example:
`s08::CHA_STARTST08_REP_1::0` decoded as `「悔が消えてる……」` ("the regret has
vanished") while the English audio says *"My wound, it's healed."* — the true
Japanese is `「傷が消えてる……」`. `docs/KNOWN_ISSUES.md` §14 and `#8` record the
same failure class (`鎌→備`, `猟銃→孤銃`, `寝室→环室`, `祈祷所→诊所`).

**Cause:** the Japanese text channels store **glyph-cell indices**, not characters
(see `TECHNICAL.md`). A cell is turned into a character by
`chap_templates.json` (matched) plus the **hand-transcribed** `vocab_chars.json`
(595 entries) and `subvocab_chars.json` (69). Every `vocab` cell is referenced by
real records. The hand transcription was read off the original glyph atlas and is
wrong for a large fraction of cells — especially complex kanji and dakuten kana.
`node tools/_jpaudit.js report` (with the fixes reverted) changed **685** of 6989
records; conflicts like `民人` (should be `屍人`), `車怯` (`卑怯`),
`狩孤用敵弾銃` (`狩狐用散弾銃`), `視豚者` (`視聴者`), `曇後` (`最後`) confirm the
bad decodes propagated into the drafts and therefore into the translations
(e.g. `屍人` was mistranslated as `村民`).

**Rule:** never trust a `vocab`/`subvocab` transcription by default. A cell's
`sig` *is* the raw 24x28 DXT1 atlas cell, so it can be decoded standalone; compare
it, side by side, against the game global font atlas (`font01.dds` +
`fontidexu8.tbl`) with `node tools/_jpaudit.js montage`, then correct
`jp_decode_fixes.json` and run `node tools/_jpaudit.js apply` + `report`.
Pure pixel/correlation matching against `font01.dds` is **not** reliable here (the
two atlases use different cell sizes/DXT artifacts, and thin glyphs like `一`
score negatively), so the comparison must be reviewed by eye.

**Status (2026):** 121 cells corrected
(`locales/<locale>/source/jp_decode_fixes.json`); the drafts were re-decoded,
re-synced (`syncsrc.js`, now covering `zh_draft_archive.json`) and re-exported, so
the corrected Japanese is baked into `locales/<locale>/source/zh_draft_*.json`
and `translator-view/*.json`. The remaining `review` ids (`70`, `462`) still need
a per-glyph pass; `subvocab` was largely correct (1 fix). `hud/launcher/label.dds`
is exempt (different glyph layout). The machine table `chap_templates.json`
(409 cells) was reviewed in full and is clean. All affected lines were reviewed
against the corrected Japanese and the wrong ones rewritten; `dist` rebuilt.

---

# 24. `dist` is derived from the RPCS3 HDD install, which must exist

**Symptom:** `build.ps1 -Task build` reports success ("copied -> dist/...") but
`dist/USRDIR/sirenx/data/*.dat` timestamps do not change.

**Cause:** `_deploy.js`/`_chapterdeploy.js` write the patched data to the RPCS3
**HDD install** (`_config.js` `HDD`, `config.local.json → hddData`), and
`_repack_disc.js --apply` then copies the files that differ from the disc source
out of that HDD directory into `dist/`. If the configured `hddData` path does not
exist (or is not writable), the deploy has nowhere to write and the repack has
nothing new to copy — so `dist` silently stays stale.

**Fix:** the deploy tools (`_deploy.js`, `_chapterdeploy.js`, `_msnbuild.js
--deploy`) now write to `__P.DATA_TARGETS` = **dist first**, then the mirror, then
the live HDD (included only when it exists), and read their base from `__P.BASE`
(live HDD if present, else the disc source). `_repack_disc.js` falls back to the
mirror when the HDD is absent. A patched archive is seeded from the base before
in-place patching, and the seed target is unlinked first so a hard-linked mirror
copy never writes through to the original disc.

So a clean checkout + original disc now rebuilds `dist/USRDIR/sirenx/data` with
**no RPCS3 profile required**; `dist/` is overlaid on the original `PS3_GAME`.
To also refresh a live install, keep `config.local.json → hddData` pointing at it.

---

# 25. Baked-mask font sizes must match the original ink height (and never auto-shrink per line)

**Symptom:** the tutorial/manual section titles (`small_subject`, 512x32) and the
big tab list (`big_subject/menu_manual_head_control.dds`, 512x256, 7 lines @32px
pitch) overflow their UI slot and overlap the body text; archive pages
(`main_archive`, 1024x2048, 26px pitch) are too large and mix font sizes on one
page (a short line renders larger than a long one).

**Cause:** the CJK sizes were not tied to the Japanese originals, and
`_archivebuild.js` **auto-shrank** any line whose estimated width exceeded the
box, so lines on the same page ended up at different sizes. Measured originals:
`small_subject` ink is top-aligned at `y0` with ~16px height (all 24 masks);
`big_subject` ink is ~20-21px tall at a 32px pitch; archive ink is ~20-21px at a
26px pitch. The Chinese was rendered at 24 / 30 / 26 respectively.

**Rule:** pin the sizes to the original ink height and apply the base size to
**every** line. Current values (kept when switching typefaces — `render_text.ps1`
only overrides the font, not the size):
`_manheadbuild.js` `SMALL_SIZE = 16` (y0), `HEAD_SIZE = 21`;
`_archivebuild.js` `SIZE = 20` (no auto-shrink; an over-long line is logged as
`WIDE` instead). Verified ink heights after the change: 16 / 21 / 20-21px.
Snapshot for rollback: `work/_snap_manual_arch_v1/` (pre-change tools + masks).

---

# 26. Deploy tools clobber each other when seeded from the base (no-HDD builds)

**Symptom:** a chapter FONTDATA edit is applied to `sNN.dat` and `_chapterdeploy.js`
reports success, yet the shipped `dist/` still renders the original Japanese. Seen
with `S02_GUIDE_011` ("攻击镜子" → "攻击挂锁") and `CHA_WAITLONG_MIY_1`.

**Cause:** `_chapterdeploy.js` and `_msnbuild.js` each rebuilt every non-HDD target
(`dist`, `mirror`) from `BASE`. With the live HDD present `BASE` = HDD, which
already holds the earlier patch, so they compose. On a clean checkout without an
HDD `BASE` = the disc original, so the later tool (`_msnbuild --deploy`, which runs
after `_chapterdeploy` in `_pipeline.js`) reset `sNN.dat` to the Japanese original
and only re-applied the mission atlas — silently discarding every chapter glyph.

**Rule:** seed a non-HDD target from `BASE` **only when the file is absent**; if it
exists, keep its bytes (unlink first to break the hard link, then write a private
copy) so consecutive deploy tools accumulate. Both tools now do this.

**Verification trap:** a translation that swaps characters 1:1 in the same cells
(e.g. 镜子 → 挂锁) leaves the `.dat` glyph indices **byte-identical** — only the
`.dds` atlas changes. Comparing only the message `.dat` (or rendering with a stale
atlas) will wrongly suggest the patch is already deployed; always check the atlas
entry too.

---

# 27. Non-ASCII `.bat` wrappers break under `cmd.exe`

**Symptom:** running `导出汉化.bat` / `导入汉化.bat` from `cmd` prints a pile of
`'…' 不是内部或外部命令` — fragments such as `获`, `slator-view\`,
`build.ps1" -Task import` are executed as commands and the PowerShell call never
runs.

**Cause:** two independent traps that were both present.

1. **Encoding.** The wrappers were UTF-8 (no BOM) with `chcp 65001`. `cmd.exe`
   parses batch files using the active code page, so under cp936 a UTF-8
   multibyte character's bytes mis-align with the next ASCII byte; and (verified
   on Windows 10 zh-CN) the batch reader also mis-splits **long** lines while
   cp 65001 is active — lines get cut and the fragments run as commands.
   Verified matrix (identical long-Chinese content, run via `cmd /c`):

   | file encoding | `chcp` | result |
   |---|---|---|
   | UTF-8, no BOM | 65001 | broken (line split) |
   | UTF-8, with BOM | 65001 | broken (line split) **and** the BOM fuses to `@echo off`, so `'@echo' 不是…` |
   | GBK / cp936 | 936 | clean |

2. **ASCII punctuation.** Translating the prompts to ASCII introduced `->` (its
   `>` becomes a redirection operator → `系统找不到指定的路径`) and an ASCII
   `(...)` inside an `if errorlevel 1 (...)` block (the `)` closes the block
   early → `此时不应有 .`). The original full-width `（）` and the word `到`
   avoided both.

**Fix (current):** the two `.bat` are **pure ASCII** (English prompts, no `chcp`);
the Chinese task banners now live in `build.ps1`, which is saved **UTF-8 with
BOM** so Windows PowerShell 5.1 decodes them. Both launchers run with 0 stderr
bytes.

**Rule:** keep `.bat` files **ASCII-only** (no BOM, CRLF line endings) and put any
localized text in a PowerShell/Node layer saved as UTF-8 **with** BOM. Inside
ASCII batch text, escape or avoid `><|&^()`; in particular `echo a -> b` will try
to redirect to a file named `b`.
