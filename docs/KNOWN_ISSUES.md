# Known Issues

User-visible limitations, compatibility problems and unresolved defects for the
zh-CN localization.

Status values: Open / Investigating / Workaround available / Partially fixed /
Fixed in development / Fixed in release / Won't fix / Upstream issue /
Emulator-specific / Version-specific. Severity: Critical / High / Medium / Low /
Cosmetic.

---

# 1. In-game QA not yet complete (High)

**Status:** Open · **Severity:** High

The localization has been generated and deployed for testing, but a full in-game
pass has not been completed for: `sXX1` GUIDE/TUTORIAL, the A8/DXT1 Chinese
masks, subtitle centering, and the 12 added global-font glyphs. A release must
not ship until these are reviewed in RPCS3.

---

# 2. `0x0201` subtitle centering / lost line breaks (Medium)

**Status:** Fixed in development · **Severity:** Medium

User feedback: some two-segment (`flag=0x0201` / `0x0200`) subtitles were not
centred on screen, and some cutscene/in-game subtitles showed a single long line.

**Cause:** the writer collapsed every style-less multi-segment record to a single
width field (`0x0101`), discarding the original line split.

**Fix:** a draft `text` may now carry `\n`; `importsheet.js` splits it into
segments and `msgwrite.js` rewrites the exact multi-segment layout (one width
field per segment, preserving the flag's low byte). The line breaks were
re-derived from the saved originals (`work/import/*.orig.dat`) and baked into the
drafts. Needs an in-game regression in RPCS3.

---

# 3. Five unresolved glyph labels (Low)

**Status:** Open · **Severity:** Low

Characters `詆 / 燗 / 尸 / 并 / 寨` could not be conclusively decoded; `寨` should
be `素`. These are decode-side labels derived from original glyphs and need
per-glyph review (`_glyphview.js`).

---

# 4. Archive-name wording not yet unified (Low)

**Status:** Open · **Severity:** Low

Two open style decisions:

- `手帳` rendered inconsistently as `警察手册` vs `警察手帐` (affects s01 drafts,
  `zh_draft_common.json` system strings, s04/s08 descriptions).
- The long vowel `ー` used as a dash in some archive titles is rendered with a
  half-width `-`; whether to switch to `—`.

---

# 5. Remaining uncertain archive names (Low)

**Status:** Partially fixed · **Severity:** Low

Of the 16 archive names originally flagged uncertain, the per-glyph review
(`_archmont.js`, `_glyphview.js`) resolved nearly all (including `ARCHIVE032`
missing "キング/之王"). A small number of wording choices remain open (§4).

---

# 6. Chapter 9 missing from the disc source (High)

**Status:** Open · **Severity:** High

The original disc tree used during development lacks `s09.dat` (~97 MB); it
existed only in the RPCS3 HDD install. A redistributable disc rebuild therefore
needs a complete disc source containing `s09.dat`, otherwise a fresh install
misses chapter 9.

---

# 7. Clean-repo rebuild is not yet possible end-to-end (High)

**Status:** Partially fixed · **Severity:** High

The build entry point now stages `locales/<locale>/source` into `work`
(`-Task prepare`) and extracts the game-derived base assets for every text
channel from a clean game (`-Task extract`: `font01.dds`, `fontidexu8.tbl`,
`label.*`, `txt_e/render_setting.txt`, plain-text originals, plus `archdds/*` via
`_archlayout.js` and `manualpng/*` + `rd_index.json`/`rr_index.json` via
`_manual_extract.js`). See `BUILDING.md` §3.1/§6/§21.

Still blocking a fully clean rebuild:

- **A pristine, complete disc** (including `s09.dat`) is required; the
  development source was incomplete and the local `PS3_GAME` was later
  overwritten by a localized build (see §6).

Path handling is no longer a blocker: the toolchain was refactored to resolve all
roots natively from `tools/_config.js` (the load-time shim was removed), and the
project has been verified to run from a relocated directory.

---

# 8. No recorded version hashes (Medium)

**Status:** Open · **Severity:** Medium

The supported `EBOOT.BIN` and archive hashes/sizes are not recorded, so the build
cannot verify that a user supplied the expected game version. The project is
data-only (no executable patch), which limits the risk, but the hashes should be
recorded for reproducibility.

---

# 9. Deployment requires write access to the RPCS3 HDD (Medium)

**Status:** Workaround available · **Severity:** Medium

Dual-write deployment nees write access to `dev_hdd0/game/BCJS30020/USRDIR/sirenx/data`.
In restricted environments deployment fails; a build-only run (`dist`) still
works, and `_deploy.js` tolerates an unlink failure.

---

# 10. Output is not byte-for-byte reproducible (Low)

**Status:** Won't fix (documented) · **Severity:** Low

GDI+ rasterization and DDS encoding can differ across Windows/font versions.
Expect functionally identical output. See `BUILDING.md` §19.

---

# 11. Bilingual textures keep an English sub-line (Low)

**Status:** Won't fix (by design) · **Severity:** Low

`main_map` / time-axis textures are bilingual; the `*_other` line is intentionally
the original English, so these textures show Chinese + English. This is the
original design, not a bug.

---

# 12. Japanese comments in `render_setting.txt` (Low)

**Status:** Won't fix (by design) · **Severity:** Low

Japanese in `setting/render_setting.txt` lives only in `#` comment lines that the
engine never renders, so it is left as-is.

---

# 13. `ARCHIVE030` keeps a Japanese kana (Low)

**Status:** Won't fix (intentional) · **Severity:** Low

`ARCHIVE030` renders as `圣画 -虚母ろ主-`; the `ろ` is the original's phonetic
spelling (Uroboros) and is kept deliberately. It is whitelisted in `_subaudit.js`.

---

# 14. `I_EV_*` item-name namespace does not match textures (Low)

**Status:** Won't fix (documented) · **Severity:** Low

`name_i_ev_*` textures do not correspond 1:1 to `I_EV_*` records, so `_itemfix.js`
skips them; their display names keep the earlier translation. Review manually if
players report mismatches.

---

# 15. Mis-transcribed JP decode dictionary poisoned the source (High)

**Status:** Partially fixed · **Severity:** High

**Cause:** the hand-transcribed `vocab_chars.json` (595 cells) mis-read a large
number of glyphs, so the exported Japanese originals (and translations made from
them) were wrong in meaning-changing ways (e.g. `傷`→`悔`, `屍`→`民`,
`鎌`→`備`, `卑`→`車`, `散`→`敵`, `聴`→`豚`). See `docs/PITFALLS.md` #23.

**Fix:** 121 cells corrected via
`locales/<locale>/source/jp_decode_fixes.json` (`node tools/_jpaudit.js apply`),
then the drafts were re-synced from a fresh decode — `_redecode.js` (chapters),
subdecode for the movie/archive sheets, and `syncsrc.js` (now also refreshes
`zh_draft_archive.json`) — and the drafts were copied back to
`locales/<locale>/source/`; `_i18n_export.js` regenerated `translator-view/*.json`.
`node tools/_jpaudit.js report` lists every affected record
(`work/jp_audit_report.txt`, 512 records).

Note: `hud/launcher/label.dds` uses a different glyph layout and is **not**
decoded by this DB (0/84 cells match); `zh_draft_label.json` is left untouched.

**Dictionary status:** the machine table `chap_templates.json` (409 cells) was
fully reviewed (`tools/_jpaudit.js montage chap`) and is clean; the hand `vocab`
table was corrected (~127 cells, incl. `猟`, `鍬`, `覚`, `恐`, `馳`, `盗`, `遺`),
`subvocab` 1 cell. Drafts re-decoded/re-synced and `translator-view/*.json`
regenerated; the clearly mis-translated lines were rewritten (names, `尸人`,
`伤口消失了`, `桥`, `狮子/公牛`, …). `dist` rebuilt via `build.ps1 -Task build`.

**Re-translation:** all 543 affected lines (`work/jp_retranslate.tsv`) were
reviewed against the corrected Japanese; ~46 had a genuinely wrong `zh` and were
rewritten (e.g. `腹いっぱい` "累死了"→"吃得好饱", `楽シイ` "好可怕"→"好开心",
`俺は生きているのか` "那家伙…"→"我…", `鼠` "顽固"→"顽固的老鼠",
`ご馳走`/`遺言`/`楽園`/`ウロボロスの贄` etc.). The rest already matched.
`dist` rebuilt (see `docs/PITFALLS.md` #24).

**Still required (partial):**

- per-glyph review of the remaining `review` ids (`70`, `462`) — a few unverified
  residuals may remain (`返ぜ`→`返せ`, `遭競`→`遭遇`, `デジャグ`→`デジャヴ`,
  `鳴り総わる`→`鳴り終わる`);
- re-check item prompts (`AC_CHANGENAME_*`, `AC_PICK_UPNAME_*`,
  `GET_ITEMNAME_*`) via `_itemaudit.js` / `_itemfix.js`.

---

# 16. GUIDE/TUTORIAL button-name labels stay Japanese (Low / Cosmetic)

**Status:** Won't fix (data-only limit) · **Severity:** Low · **Confirmed in RPCS3**

In the in-game GUIDE / TUTORIAL overlays (e.g. record `S02_GUIDE_002`), the
leading *button-name* labels still render in Japanese, while the rest of the line
is Chinese. Example (s02 opening guide):

```
左スティック：移动
右スティック：视角操作
SELECT：地图·主菜单
```

Only the button-name part is Japanese; `：移动` / `：视角操作` / `：地图·主菜单`
come from the (localized) `sNN1` chapter glyph atlas. `方向キー` / `左スティック`
/ `右スティック` / `SELECT` are **graphics drawn by the engine**, not text in any
editable container.

**What was ruled out (all verified in RPCS3 or by exhaustive search):**

- **Not a text string** — `glyphseq.js` searched `common.dat` and all 24
  `sNN.dat` for the glyph-index sequence of `左スティック` / `スティック`
  (u8/u16BE/u16LE): no hits. No UTF-8 / UTF-16 / Shift-JIS `スティック` either.
- **Not `hud/font_02_icon_jp.dds`** — that sheet *is* localized (its
  direction / stick / D-pad label cells → `方向键` / `左摇杆` / `右摇杆`; used by
  menus), but a **marker test** (painting its three label rows to a solid block,
  then deploying to HDD + mirror + dist and restarting RPCS3) left the GUIDE
  unchanged. So the GUIDE does not sample this sheet.
- **Not the global font `font01.dds`** — replacing the kana glyph cells the names
  use (`ス`=411→`摇`, `テ`=424→`杆`, `キ`=399→`键`,
  `ィ/ッ/ク/ー`=389/421/401/122→blank, keeping `左/右/方/向`) and redeploying also
  left the GUIDE unchanged.
- **Not a reachable texture** — a whole-archive bitmap template match (every
  `common.dat` DDS + every chapter DDS; A8/DXT1/DXT5/RGBA; both ink polarities;
  multi-scale) found the label art **only** in `font_02_icon_jp.dds`.

**Conclusion:** the labels are produced by the engine from a source that is not
reachable by data-only patching — most likely a glyph sequence hard-coded in the
**encrypted `EBOOT.BIN`** (a `SCE`/SELF, not searchable here) drawn through a font
atlas outside the accessible data. Fixing it would require executable patching or
reverse-engineering the engine's button-prompt table, both out of scope for this
data-only project. Kept open as a documented, low-severity residual.

See `docs/PITFALLS.md` #30 for the exact diagnostic steps (so it is not
re-investigated from scratch).

**Where the engine *might* get them (UNVERIFIED HYPOTHESES — speculation, not
confirmed):**

- The **glyphs** may be rasterized at runtime from the **PS3 system font**
  (`dev_flash/data/font/SCE-PS3-NR-*-JPN.TTF`, family `SCE-PS3 NewRodin JPN`).
  Reason to suspect it: the labels render in that typeface, and replacing the
  game's own font atlases (`font_02`, and the `font01` glyph cells) had no effect
  — which is what you would expect if the engine draws these from a runtime system
  font. It is **not** confirmed that the engine reads `dev_flash`.
- The **strings** (`左スティック` / `右スティック` / `方向キー` / `SELECT`) are
  most likely **hard-coded in the encrypted `EBOOT.BIN`**. Not confirmed — the
  executable is a `SCE`/SELF and could not be inspected here.

**Read-only checks done for the above (these are facts, not speculation):**

- A full scan of `dev_flash` (1075 files / ~194 MB; UTF-8 / UTF-16LE / UTF-16BE /
  Shift-JIS) for `左スティック` and `方向キー` found **no** such resource; the only
  `スティック` hit is inside `webbrowser_plugin.rco` / `webrender_plugin.rco`
  (unrelated browser internals). So the *string* is not a firmware resource.
- `dev_flash/data/font/SCE-PS3-NR-R-JPN.TTF` does render `左スティック 方向キー`
  in a typeface visually matching the GUIDE labels.

If it ever matters: decrypt/analyse `EBOOT.BIN`, or compare against another game
that uses the same NewRodin system font. Both are outside this project's data-only
scope.

---

# 17. Fade in / fade out screen effects are lost after patching (Low)

**Status:** Open · **Severity:** Low · **Cause unknown**

**Symptom:** after applying the localization patch, the game no longer shows some
of its fade-in / fade-out screen transitions (the original's gradual
dimming/brightening between scenes or states is gone).

**Cause:** not known. This is a user-observed symptom only; no root cause has been
identified. It was reported during in-game testing but was never recorded in the
project docs at the time, so there is no prior investigation to build on.

**Impact:** low — there is no substantive effect on gameplay (no crash, no
progression blocker, no missing text). It is a cosmetic/visual regression, so it
is tracked but not treated as a release blocker.

**Not yet investigated.** Nothing below is verified; these are only candidate
directions for a future investigation, not conclusions:

- Whether the lost fades correlate with any particular patched container
  (`common.dat` / `sNN.dat` / baked masks) or appear globally.
- Whether an overlay texture whose alpha the engine animates (e.g. an A8/DXT5
  mask) was altered in a way that removes the transition rather than the text.
- Whether the symptom reproduces on an unmodified build at the same spot (to rule
  out an emulator-side or version-side cause before attributing it to the patch).

**Next step:** reproduce in RPCS3, narrow down which patch entry (if any)
correlates with the missing fade, then record findings here or in
`docs/PITFALLS.md`.
