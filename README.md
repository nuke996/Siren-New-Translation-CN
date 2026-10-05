# SIREN: New Translation (BCJS30020) — Simplified-Chinese Localization

Source, translation data, tooling, reverse-engineering notes and a reproducible
build workflow for a Simplified-Chinese (zh-CN) localization of the PlayStation 3
game **SIREN: New Translation** (Japanese release, disc ID `BCJS30020`, 死魂曲：新解).

---

# Project

**Game:** SIREN: New Translation (PS3, Japanese release)
**Localized title:** 死魂曲：新解（简体中文汉化）
**Target locale:** `zh-CN` (Simplified Chinese)
**Platform:** PlayStation 3 — developed/verified primarily on the RPCS3 emulator
**Disc ID:** `BCJS30020`
**Supported version:** original Japanese disc release (`PARAM.SFO CATEGORY=DG`, DVD/BD game disc)
**Status:** initial localization complete and deployed for testing; in-game QA and
release packaging are still in progress. See `docs/KNOWN_ISSUES.md`.

> This project is an independent fan localization. It contains no original game
> assets. Users must supply their own legally obtained copy of the game.

---

# What This Localization Includes

Localized content (all channels below are implemented and have been deployed for
emulator testing):

- movie / cutscene dialogue subtitles
- chapter system text (in-game action prompts, messages)
- per-chapter GUIDE / TUTORIAL text
- archive video subtitles
- in-game documents (archive long-text pages)
- in-game manual
- menus and UI (baked textures: title / episode names, warnings, options, help,
  status, map, store, archive headers, results, mission lists)
- HUD mission text
- launcher labels
- global font atlas extension (12 added Simplified glyphs)
- UTF-8 plain-text containers (system text, install-archive headers)

Intentionally not translated: identifier-only data (product lists, ID/value
tables), Japanese comments in `render_setting.txt` that are never rendered, and
the deliberately preserved English sub-lines of the bilingual map/time textures.

---

# Supported Game Version

```text
Platform:      PlayStation 3
Region:        Japan
Distribution:  physical disc release (installs data to the HDD on first run)
Game version:  BCJS30020 (original Japanese disc)
Executable:    PS3_GAME/USRDIR/EBOOT.BIN
```

Exact hashes/sizes of the source executable and archives have **not** yet been
recorded in this repository (see `docs/KNOWN_ISSUES.md`). Binary patch tools must
verify the target version before modifying anything.

For build verification details see [`BUILDING.md`](BUILDING.md).

---

# Installation

1. Prepare a clean, supported copy of the original Japanese game.
2. Obtain a localization release (or build one — see `BUILDING.md`).
3. Copy the release's `USRDIR/sirenx/data/` files over the game's data, or
   install the release into the RPCS3 HDD install data directory:
   `dev_hdd0/game/BCJS30020/USRDIR/sirenx/data/`.
4. Start the game.

> The game is a disc title: on a fresh machine it installs its data from the
> source media to the HDD on first run. A redistributable release must therefore
> patch the **disc source data**, not only the HDD copy. See `BUILDING.md`.

---

# Uninstallation

- Files replaced: `sirenx/data/common.dat`, `common.hed` and per-chapter
  `sNN.dat` archives.
- Generated files: the build workspace (`build/`) and release output (`dist/`).
- No launcher, proxy DLL or runtime hook is used; the localization is a set of
  patched data files.
- To uninstall, restore the original `common.dat`/`common.hed`/`sNN.dat` files
  from a clean copy of the game.

---

# Technical Overview

The engine renders text through four independent channels, all localized here:

1. **Glyph-atlas text (FONTDATA)** — dialogue/subtitles/UI strings are stored as
   glyph indices into a DXT1 atlas; translating means rendering new glyphs into
   the atlas and rewriting the indices/lengths in `common.dat` and per-chapter
   `sNN.dat`.
2. **Baked image text (A8 / DXT1 / DXT5)** — many menus bake text directly into
   textures; these are re-rendered and written back into the DDS.
3. **UTF-8 plain-text containers** rendered through the global font
   (`font01.dds` + `fontidexu8.tbl`), which the localization extends with the
   missing Simplified glyphs.
4. **MSN_DATA** HUD mission atlases inside each chapter archive.

Archives use a big-endian container format (`.hed` index + `.dat` payload +
`.siz` manifest). Full details are in [`TECHNICAL.md`](TECHNICAL.md) and
[`docs/FILE_FORMATS.md`](docs/FILE_FORMATS.md).

---

# Repository Structure

```text
README.md
AGENTS.md
BUILDING.md
TRANSLATING.md
TECHNICAL.md
LICENSING.md
config.example.json
build.ps1                 # build / install entry point
导出汉化.bat / 导入汉化.bat  # thin wrappers for the translator workflow

docs/
  LOCALIZATION_STANDARD.md
  PITFALLS.md
  FILE_FORMATS.md
  KNOWN_ISSUES.md

locales/
  zh-CN/
    source/               # canonical translation/authoring data (tracked)

src/                      # reserved (framework code lives in tools/)
tools/                    # the working toolchain (Node.js + PowerShell)
tests/                    # reserved
assets/                   # reserved
```

Generated output (`build/`, `dist/`) and per-developer `config.local.json` are
excluded by `.gitignore`.

---

# Building From Source

```text
clean repository checkout
+ user-supplied original game directory
+ Node.js v24.x + Windows PowerShell (GDI+ text rendering)
        -> build.ps1
        -> validated localization data in dist/
        -> optional deployment to the RPCS3 HDD install
```

See [`BUILDING.md`](BUILDING.md) for requirements, commands and current
limitations.

---

# Translation

Translation/authoring data lives under:

```text
locales/zh-CN/source/
```

See [`TRANSLATING.md`](TRANSLATING.md) for the file layout, per-channel formats,
text-safety rules, capacity limits and the export/import workflow.

---

# Adding Another Language

The toolchain is locale-neutral in design (`config.local.json` carries a
`locale`, tools accept locale-scoped inputs). A new locale would add
`locales/<locale>/` and, if the target script has different font requirements,
extend the global font atlas. See `docs/LOCALIZATION_STANDARD.md` §19.

---

# Known Issues

Player-visible limitations and open defects are documented in
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

---

# Technical Research

Reverse-engineering findings, container/format documentation and design traps:

- [`TECHNICAL.md`](TECHNICAL.md)
- [`docs/FILE_FORMATS.md`](docs/FILE_FORMATS.md)
- [`docs/PITFALLS.md`](docs/PITFALLS.md)

These preserve both successful findings and meaningful failed approaches.

---

# Compatibility

- Primary test target: RPCS3 (any recent x86-64 build).
- The localization is data-only; it does not use a proxy DLL, runtime hook or
  loader, so there are no known loader conflicts.
- Retail PS3 / CFW: not verified (the release must be written into the disc
  source; see `BUILDING.md`).

---

# Development Status

```text
Text extraction:        complete
Font support:           complete (global atlas extended)
Glyph-atlas text:       complete (deployed for testing)
Baked image text:       complete (deployed for testing)
Subtitle QA:            partial (in-game review pending)
Release packaging:      partial (disc repack available; clean-repo rebuild pending)
Clean-repo rebuild:     partial — prepare/extract implemented; see BUILDING.md §21
```

---

# Contributing

Translation review, terminology, reverse-engineering, tooling and QA are all
welcome. Before contributing read `TRANSLATING.md`, `TECHNICAL.md` and
`LICENSING.md`.

---

# Licensing

This repository mixes material under different terms. See
[`LICENSING.md`](LICENSING.md) and `LICENSE` / `LICENSE-translations.md`.

The original game, its text, trademarks and assets remain the property of their
respective rights holders. Do not commit complete proprietary game files.

---

# Credits

- Original game: SCE Japan Studio / Team Siren, published by Sony Computer
  Entertainment.
- Project owner: nobina
- Localization tooling, reverse-engineering and translation: project
  contributors (see repository history).
