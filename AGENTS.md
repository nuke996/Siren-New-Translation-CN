[English](AGENTS.md) | [简体中文](AGENTS.zh-CN.md)

# Game Localization Project Instructions

This repository is a game localization project.

The current target language may be Simplified Chinese or another locale, but the project should be designed as a reusable localization framework whenever reasonably possible.

The goal is not merely to make one game display one target language. The goal is to preserve translation data, reverse-engineering knowledge, build tools, and technical infrastructure so future contributors can maintain the project or adapt it to other languages.

## Required Reading

Before making localization-related architectural or technical changes, read:

- `docs/LOCALIZATION_STANDARD.md`

Also read the following files if they exist:

- `BUILDING.md`
- `TRANSLATING.md`
- `TECHNICAL.md`
- `LICENSING.md`
- `docs/PITFALLS.md`
- `docs/FILE_FORMATS.md`
- `docs/KNOWN_ISSUES.md`

Repository-specific documentation takes precedence over generic assumptions.

## Core Principles

1. Keep generic localization technology separate from language-specific data.

2. Do not hard-code Chinese-specific names, paths, encodings, or behavior into generic tooling unless the original game engine requires it.

3. Prefer locale-based structures such as:

   `locales/<locale>/`

4. Prefer reproducible extraction, validation, font generation, patching, rebuilding, and packaging workflows over manual editing.

5. A clean repository checkout plus user-supplied original game files should be sufficient to rebuild the localization whenever technically possible.

6. Do not depend on undocumented local files, private work directories, manual intermediate edits, or files that exist only on one developer's machine.

7. Preserve reverse-engineering findings in documentation.

8. Important technical findings must be distinguished as:

   - Verified
   - High-confidence deduction
   - Unverified hypothesis

9. Do not present speculation as verified fact.

10. Preserve source identifiers, control codes, placeholders, format markers, and other machine-readable data unless their behavior has been verified.

11. Before large-scale translation work, establish a minimal working localization proof of concept.

12. Validate original game versions before applying binary patches.

13. Binary patch tools should verify expected original bytes, file size, version metadata, or hashes before modifying files.

14. Do not silently patch unknown or unsupported game versions.

15. Avoid committing copyrighted original game executables, archives, audio, video, textures, models, fonts, or other complete proprietary assets unless redistribution is explicitly permitted.

16. Prefer patch files, scripts, structured translation data, documentation, and reproducible build tools.

17. Keep generated build output separate from source files.

18. Generic tools should use locale-neutral names where practical.

Prefer:

- `build_font.py`
- `patch_text_renderer.py`
- `extract_strings.py`
- `import_strings.py`
- `build_locale.py`
- `validate_translations.py`

Avoid generic infrastructure names such as:

- `build_cn_font.py`
- `patch_chinese_renderer.py`
- `cn_strings.bin`

unless the implementation is genuinely specific to that locale.

## Recommended Repository Layout

Use this structure when appropriate:

```text
README.md
AGENTS.md
BUILDING.md
TRANSLATING.md
TECHNICAL.md
LICENSING.md

docs/
  LOCALIZATION_STANDARD.md
  PITFALLS.md
  FILE_FORMATS.md
  KNOWN_ISSUES.md

locales/
  <locale>/

src/
tools/
tests/
assets/
```

The exact structure may be adjusted when the game's technical requirements make another layout more appropriate.

Do not force abstraction or directory structure that provides no practical benefit.

## Localization Workflow

Prefer the following order:

1. Identify and verify the supported game version.
2. Locate text resources.
3. Determine text encoding.
4. Analyze the font system.
5. Analyze resource/archive formats.
6. Analyze text rendering behavior.
7. Build a minimal localization proof of concept.
8. Create reusable extraction and rebuilding tools.
9. Add automated validation.
10. Begin large-scale translation.
11. Perform in-game QA.
12. Build reproducible release packages.

Do not start by translating the entire game before the technical pipeline has been validated.

## Multi-Language Reuse

Whenever reasonably possible, design the project so another contributor can add locales such as:

```text
locales/zh-CN/
locales/zh-TW/
locales/ja-JP/
locales/ko-KR/
```

without rewriting the entire localization framework.

If another language requires technical changes, determine whether the cause is:

1. a limitation of the original game engine, or
2. an unnecessary limitation of the current localization implementation.

If the limitation belongs to the localization implementation and can reasonably be generalized, prefer improving the generic implementation.

## Translation Safety

Treat all systematic non-language tokens as protected until verified.

Examples include:

- placeholders such as `{0}`, `{1}`, `%s`, `%d`
- control codes such as `$n`, `\n`, `^xx`
- markup such as `<tag>`
- script tokens
- resource identifiers
- file paths
- null terminators or binary markers

Do not translate, remove, reorder, or normalize them unless their behavior has been verified.

Where possible, validation should detect:

- missing placeholders
- added placeholders
- broken control codes
- malformed markup
- unsupported characters
- missing glyphs
- encoding failures
- fixed-slot overflow
- linked-string inconsistencies
- duplicate IDs
- unexpected empty translations

## Font and Encoding Work

Do not assume replacing a font file or texture alone is sufficient.

Investigate, where applicable:

- text encoding
- multibyte handling
- character mapping
- glyph atlas layout
- advance widths
- kerning
- line height
- baseline
- fallback behavior
- text measurement
- UI wrapping
- clipping
- renderer assumptions

Whenever possible, make font generation reproducible from translation data.

Preferred pipeline:

```text
translation data
    ↓
collect required characters
    ↓
font coverage check
    ↓
glyph rendering
    ↓
atlas generation
    ↓
character mapping
    ↓
metrics generation
    ↓
validation
```

## Binary and Resource Patching

Binary and archive modification must be defensive and reproducible.

Before modification:

- verify the original version
- verify expected bytes, size, or hashes where practical

During modification:

- change only intended data
- fail clearly on mismatch
- avoid silent fallback

After modification:

- validate output
- verify changed bytes or resource structure
- detect malformed archives where possible

Do not rely on blind fixed-offset patching for unknown builds.

## Reverse-Engineering Preservation

Document discoveries that future contributors would otherwise have to rediscover.

Examples:

- file structures
- magic values
- offsets
- field meanings
- string tables
- pointer tables
- size tables
- checksums
- archive manifests
- font structures
- text-rendering behavior
- linked resource relationships
- executable patch locations
- known hard-coded strings

If an approach fails in a meaningful way, record it in `docs/PITFALLS.md`.

If a custom format is understood, record it in `docs/FILE_FORMATS.md`.

Do not delete useful failed research merely because the final implementation uses another method.

## Documentation Responsibilities

When important discoveries are made, update the appropriate documentation.

Examples:

- build process changes → `BUILDING.md`
- translation rules → `TRANSLATING.md`
- reverse-engineering findings → `TECHNICAL.md`
- file structures → `docs/FILE_FORMATS.md`
- failed approaches and traps → `docs/PITFALLS.md`
- user-visible limitations → `docs/KNOWN_ISSUES.md`
- licensing boundaries → `LICENSING.md`

Do not leave important project knowledge only in chat history, temporary notes, commit messages, issue comments, or local files.

## Copyright and Repository Hygiene

Do not commit complete proprietary game files unless redistribution is explicitly permitted.

This includes, where applicable:

- executables
- ELF files
- DLLs
- full archives
- videos
- audio
- textures
- models
- proprietary fonts
- complete original game data directories

Prefer distributing:

- source code
- scripts
- translation data
- patch files
- diffs
- build tools
- technical documentation

Generated output should normally go under directories such as:

- `build/`
- `dist/`
- `out/`

and should be excluded from version control unless there is a clear reason to track it.

Avoid permanent clutter such as:

- `final/`
- `final2/`
- `new/`
- `old/`
- `backup/`
- `test/`
- `temp/`

## Upstream Work

If this project builds on prior work such as:

- fan translations
- undub projects
- reverse-engineering projects
- source ports
- modernizer mods
- extraction tools
- archive libraries

then:

1. record the upstream project
2. record the author
3. record the relevant commit, tag, or release where possible
4. document what was reused
5. document what was independently verified
6. preserve upstream licensing requirements
7. avoid presenting upstream discoveries as original work

If this repository is a fork, keep the history reasonably compatible with upstream when practical.

## Final Project Standard

A mature localization project should ideally allow:

- players to download a ready-to-use release
- developers to rebuild the patch from source
- translators to edit structured translation data
- researchers to understand the technical implementation
- future maintainers to reproduce previous discoveries
- contributors to adapt the framework to another language when feasible

When choosing between a one-off workaround and a reasonably achievable reusable solution, prefer the reusable solution.
