# Building

How to rebuild the SIREN: New Translation (BCJS30020) zh-CN localization from a
clean repository checkout plus a user-supplied original game.

The process is intended to be reproducible and independent from the original
developer's machine. Read the "Current limitations" section before expecting a
one-command clean build: a few inputs are still machine-local and are being
migrated.

---

# 1. Supported Game Version

```text
Game:         SIREN: New Translation
Platform:     PlayStation 3
Region:       Japan
Distribution: physical disc release (installs data to the HDD on first run)
Disc ID:      BCJS30020
Executable:   PS3_GAME/USRDIR/EBOOT.BIN
Version:      original Japanese release only
File size:    not yet recorded  (TODO)
SHA-256:      not yet recorded  (TODO)
```

Only this release has been tested. The localization does not patch the
executable (data-only), so version risk is limited to archive/format layout, but
the required archive hashes should still be recorded (see
`docs/KNOWN_ISSUES.md`).

---

# 2. Requirements

- **Node.js v24.x** (the tools were written and tested on Node 24; older LTS may
  work but is untested).
- **Windows PowerShell 5.1+** with .NET/GDI+ for text rendering
  (`tools/render_text.ps1` renders glyphs with `System.Drawing`).
- A **font** containing the target glyphs, installed on the machine. The
  effective font is set by `.\build.ps1 -Task rebuild -Font "<name>"` (which
  writes `work/font_cfg.json`, default `SimHei`); see §13.
- A permitted decompression tool for the source disc image (7-Zip/WinRAR) to
  extract `PS3_GAME/`.
- The original game files (§3).

No Python, CMake, compiler or package manager is required; the toolchain is
self-contained Node.js + PowerShell.

---

# 3. Original Game Files

The user must provide a decrypted/extracted **disc root** — the folder that
contains `PS3_GAME/` and `PS3_DISC.SFB`. The tools read:

```text
<gameRoot>/PS3_GAME/USRDIR/sirenx/data/
    common.hed, common.dat, common.siz
    s01.dat … s08.dat, s09.dat, s10.dat … s23.dat, s25.dat
```

`s24.dat` does not exist in this release. **`s09.dat` is ~97 MB and, on the
original development disc tree, is missing** — it existed only in the RPCS3 HDD
install. For a complete disc rebuild you must supply a full disc that contains
`s09.dat` (see `docs/KNOWN_ISSUES.md`).

These files are copyrighted and are **not** stored in this repository.

---

# 4. Repository Preparation

```bash
git clone <repository-url>
cd Siren-New-Translation-CN
copy config.example.json config.local.json
```

Edit `config.local.json`:

```json
{
  "locale": "zh-CN",
  "gameRoot": "D:/path/to/disc-root",
  "hddData":  "D:/path/to/rpcs3/dev_hdd0/game/BCJS30020/USRDIR/sirenx/data",
  "font": "SimHei",
  "fontBold": 0
}
```

Leave `workDir`/`mirrorDir`/`distDir` empty to use repo-local `build/` and
`dist/`. `config.local.json` is git-ignored.

If **no** config file exists, the tools fall back to the original developer
paths ("legacy mode") — useful on the original machine, not portable.

---

# 5. Path Portability (how the tools find the game)

The toolchain resolves all roots natively from `tools/_config.js`:

- **JS tools** (`tools/*.js`) reference the roots via `require('./_config.js')`
  (e.g. `${__P.WORK}`, `${__P.DISC}`, `${__P.HDD}`); they contain **no** absolute
  developer paths.
- **Data files** with path values (`locales/<locale>/source/patch_common.json`,
  `patch_font.json`, `font01_zh.glyphspec.json`) store them **relative to the
  workspace** (`work/`); the consumers (`sntp_pack.js`, `glyphgen.js`) resolve a
  relative path against `WORK`.

Resolution order for the config: `$SNT_CONFIG` → `<repo>/config.local.json` →
legacy developer defaults (so an existing machine works with no config).
Consequences:

- the project can be placed at **any path** (verified by running `extract` from a
  relocated copy);
- with a config, the tools use your `gameRoot`, RPCS3 HDD data and repo-local
  `work`/`dist`; with no config, behaviour matches the original machine.

Roots: `DISC` = `<gameRoot>/PS3_GAME/USRDIR/sirenx/data`, `HDD` from `hddData`,
`WORK` = `<repo>/work` (the sibling of `tools/` — required by
`glyphgen.js` / `render_text.ps1`).

---

# 6. Preferred Build Entry Point

`build.ps1` is the single entry point:

```powershell
# stage locales/<locale>/source into work (portable mode)
.\build.ps1 -Task prepare -GameDir "D:\game"

# + pull game-derived base assets from the game (needs a CLEAN game)
.\build.ps1 -Task extract -GameDir "D:\game"

# regenerate translation data -> localize -> deploy -> refresh dist
.\build.ps1 -Task build  -GameDir "D:\game" -HddDir "D:\rpcs3\...\sirenx\data"

# translator round-trip
.\build.ps1 -Task export                     # dump jp/zh to locales/zh-CN/translator-view
.\build.ps1 -Task import -GameDir ... -HddDir ...

# switch font and regenerate everything
.\build.ps1 -Task rebuild -GameDir ... -Font "Microsoft YaHei" -Bold 0
```

`-Task build|import|rebuild` automatically run `prepare` first when a
`config.local.json` exists. `-Task extract` additionally pulls base assets from
the game (see §3.1). `导出汉化.bat` / `导入汉化.bat` are thin wrappers around
`-Task export` / `-Task import`.

Parameters may instead be put in `config.local.json`; then omit `-GameDir`/`-HddDir`.

### 3.1 Game-derived base assets (extract)

The build pipeline needs a few original inputs that cannot be committed. `-Task
extract` produces them from the user's **clean** game directory via
`tools/_extract_base.js`:

| Output (in `work`) | Source |
|---|---|
| `font01.dds`, `fontidexu8.tbl` | `common.dat` entries (global font base) |
| `label.dat`, `label.dds` | `common.dat` `hud/launcher/label.*` |
| `txt_e/render_setting.txt` | `common.dat` `setting/render_setting.txt` |
| `system_jp.dat`, `header_music.txt`, `header_photo.txt` | `common.dat` plain-text originals (export reference) |
| `archdds/*.dds`, `archlayout.json` | regenerated from the disc by `_archlayout.js` |
| `manualpng/*.dds`, `rd_index.json`, `rr_index.json` | regenerated from the disc by `_manual_extract.js` |

> The game directory **must be unmodified**. If it was already overwritten by a
> localized build, `extract` would capture localized data as if it were original.

Per-table `fontdata` originals (`work/import/*.orig.*`) are produced on demand by
`importsheet.js` from the disc, so they do not need pre-extraction — **provided a
complete, clean disc (including `s09.dat`) is supplied**.

---

# 7. Recommended Build Pipeline (what `-Task build`/`import` does)

`tools/_pipeline.js` drives, in order:

1. global font extension — `glyphgen.js`, `_tbladd.js`
2. FONTDATA atlases — `importsheet.js --all`, `--chapters`, archive videos
3. chapter 9 (from its saved original base) — `_s09base.js`, `importsheet`,
   `_s11batch.js`
4. baked textures — `_d5gen`…`_d13gen`, `_d12gen`, `_labelgen`/`_labelwrite`,
   `_manualbuild`, `_archivebuild`, `_manheadbuild`, `_iconbuild`, `_msnbuild`,
   `_s11batch`, standalone mask jobs
5. `_revertpatch.js place_other time_other` (restore bilingual English lines)
6. plaintext — `_e_txt.js` + merge into `patch_common.json`
7. deploy — `_deploy.js` (HDD + mirror), `_chapterdeploy.js`, `_msnbuild
   --deploy`, `_mirrorsync.js`
8. `_repack_disc.js --apply` → `dist`

Validation/audits available separately: `_subaudit.js`, `_itemaudit.js`,
`_chapaudit.js`, `_jmkaudit.js`, `_magicscan.js`, `_finalaudit.js`, `_depcheck.js`.

---

# 8. Build Output

```text
work/     intermediate workspace (source copies + generated specs)
build/mirror/   disc-tree mirror used for dual-write deployment
dist/           repacked disc data (USRDIR/sirenx/data/*) for release
```

All are git-ignored. To build the final disc image, overlay `dist/` onto a copy
of the original `PS3_GAME` (movie/stream/voice/zzdat/EBOOT are unchanged).

---

# 9. Version Verification

The project is **data-only** and does not apply binary patches, so no byte-level
version gate is currently implemented. Before a release, record and check:

- `EBOOT.BIN` size / SHA-256
- `common.hed`, `common.dat`, `common.siz` hashes
- presence of the expected chapter archives

If a release tool is added that modifies executables, it must verify the target
version and fail on mismatch.

---

# 10. Validation

Because there is no compiler, "validation" is the audit tooling plus in-game
testing. Before release:

- `_subaudit.js` → no unmapped glyphs / residual Japanese (whitelist for
  intentional kana such as `ARCHIVE030`)
- `_chapaudit.js`, `_jmkaudit.js`, `_magicscan.js`, `_finalaudit.js` → no missing
  records
- `_depcheck.js` → HDD-only 0 / mirror-only 0
- in-game smoke test in RPCS3 (menus, dialogue, subtitles, saves, chapter
  transitions)

---

# 11. Locale Selection

`config.local.json` carries `locale`. Presently only `zh-CN` is implemented; the
pipeline and data layout are locale-scoped so a second locale can be added.

---

# 12. Dependency Management

No `package.json`: the tools use only the Node standard library and Windows
PowerShell/.NET. Node.js v24.x is the only runtime dependency. Record the exact
Node version used for a release in the release notes when practicable.

---

# 13. Fonts

- Font selection is centralized in `work/font_cfg.json`, written by
  `.\build.ps1 -Task rebuild -Font "<name>"` (or `tools/_setfont.js "<name>"`),
  and can be overridden per run with the `ZH_FONT` environment variable. All
  generators render through `render_text.ps1`, which reads it.
- (`config.local.json` records `font`/`fontBold` for reference only; the
  effective switch is the one above.)
- Default: `SimHei` (a Windows system CJK font). Verify the font's license for
  distribution; do not commit proprietary OS fonts.
- Glyph atlases render with 1-bit hinting; A8 masks use anti-aliasing. After a
  large font change, visually re-check `_s11gen`/`_labelgen` alignment and the
  longest lines (mission objectives, manual headings).

---

# 14. Archive and Resource Tools

Custom, project-authored Node.js tools (§22 of `TECHNICAL.md`). The SNTP
container parser (`sntp.js` / `sntp_pack.js`) is the critical one; its format is
documented in `docs/FILE_FORMATS.md`.

---

# 15. Binary Patching

Not used. See `TECHNICAL.md` §12.

---

# 16. Build Logs

`_pipeline.js` prints each step and a final `ok/failed` count. A failed step does
not abort the run (to allow partial regeneration), so **always check the final
count and the audits**, not just the absence of a stack trace.

---

# 17. Release Build

There is no separate release task yet. A release is:

1. run `-Task build` against a clean game directory;
2. run the audits (§10);
3. package `dist/USRDIR/sirenx/data/` together with installation instructions.

Do not store release archives in the repository root.

---

# 18. Clean Build Test

Procedure (currently **not passing** — see next section):

1. fresh clone into a new directory;
2. `config.local.json` pointing at a clean disc + RPCS3 HDD;
3. `.\build.ps1 -Task build`;
4. compare `dist/` against a known-good release.

---

# 19. Reproducibility Notes

Byte-identical output is **not** verified. Likely sources of difference: GDI+
rasterization across Windows/font versions, and DDS encoding. Expect
*functionally identical* output; document any release-to-release differences.

---

# 20. Troubleshooting

See `docs/PITFALLS.md` for the full list. Common cases:

- "changed but no effect" → deployment must reach **both** HDD and mirror, then
  `dist`; use `_depcheck.js`.
- `_other` (English) map/time lines reverted to Chinese → rerun `_revertpatch.js`.
- Fit failure / capacity error → translation too long for a record slot or the
  atlas has too few free cells; see `docs/PITFALLS.md` and the `_cap_*.txt`
  diagnostics.
- Cannot write the RPCS3 HDD directory → permission/sandbox issue; granted write
  access is required for deployment (build-only mode still produces `dist`).
- Chapter 9 fails to regenerate → its saved original base
  (`work/import/s090.orig.*`) is missing; on the HDD-only `s09.dat` this base is
  required.

---

# 21. Current Limitations (clean-repo rebuild is NOT yet complete)

The build entry point can now stage sources and extract the game-derived base
assets for every text channel (§3.1). A truly clean `checkout + game -> rebuild`
now depends only on:

1. **A clean, complete game source.** The development disc tree was missing
   `s09.dat` (it only lived in the RPCS3 HDD install) and the local `PS3_GAME`
   was later overwritten by a localized build. A pristine disc that includes
   `s09.dat` is required; otherwise chapter 9 cannot be rebuilt from source and
   `extract` would capture localized font/label/manual data. `-Task extract`
   reports the `s09.dat` status.
2. **Path portability relies on the load-time shim** (§5). The ~159 tools still
   contain absolute paths and should eventually be refactored to use
   `tools/_config.js` natively.
3. **No version hashes** are recorded (§1).
4. **Byte-identical output is not guaranteed** (§19).

See `docs/KNOWN_ISSUES.md` for the tracked state of each item.
