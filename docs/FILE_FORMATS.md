# File Formats

Concrete binary/structured format documentation for SIREN: New Translation
(BCJS30020). All multi-byte integers are **big-endian** unless stated otherwise.

Confidence labels: **Verified** (parser reproduces real data / artifact boots),
**High-confidence deduction**, **Unverified hypothesis**.

---

# 1. Documentation Rules

Every format below records: purpose, magic/header, field offsets, entry layout,
encoding, alignment, and the implementation that reads/writes it. Unknown fields
are marked unknown; do not invent explanations.

---

# 2. SNTP archive container — Verified

Implementation: [`tools/sntp.js`](../tools/sntp.js) (read),
[`tools/sntp_pack.js`](../tools/sntp_pack.js) (write).

Game data is stored as a three-file container:

```text
<name>.hed   index
<name>.dat   concatenated payload (2048-byte aligned entries)
<name>.siz   size manifest
```

`common.hed` indexes `common.dat`, whose entries include each chapter archive
(`s01.dat` …) and many texture/data resources. Chapter archives are themselves
SNTP-nested (their own `.hed` is inside `common.dat`).

### 2.1 `.hed` header

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0x00 | 4 | magic | ASCII `"SNTP"` |
| 0x04 | 4 | version | observed value not yet recorded |
| 0x08 | 4 | unknown | |
| 0x0C | 4 | unknown | |
| 0x10 | 4 | `nameBase` | absolute offset of the name blob |
| 0x14 | 4 | `entryTableOffset` | absolute offset of the entry table |
| 0x18 | 4 | unknown | |
| 0x1C | 4 | `entryCount` | may be 0 in some `sNN.hed`; derived as `(len - entryTableOffset) / 16` when so |

### 2.2 Name blob and entry table

- The name blob (null-terminated ASCII path strings) starts at `nameBase`.
- `entryCount × 16-byte` entries start at `entryTableOffset`.

Entry (16 bytes):

| Offset | Size | Field |
|---|---|---|
| +0 | 4 | `nameOffset` relative to `nameBase` |
| +4 | 4 | `dataOffset` into `.dat` |
| +8 | 4 | `size` (bytes) |
| +12 | 4 | `flags` |

### 2.3 `.dat` / `.siz`

- `.dat` holds entries at their `dataOffset`, entries 2048-byte aligned.
- `.siz` = `u32 hedSize` | `u32 datSize`.

### 2.4 Update strategy (localization)

Zero-relocation: replacement payloads are written **at the original offset** and
must not exceed the available room; only the `.hed` `size` field changes, so
`dataOffset`s and the `.siz` manifest stay valid. `sntp_pack.js` allows an entry
to grow up to the next entry's start address. This is why `common.siz` is
unchanged in releases.

---

# 3. FONTDATA (glyph-index text records) — Verified

Implementation: `msgdecode` / `msgwrite` / `importsheet.js` / `glyphgen.js`.

Variable text (movie subtitles, archive subtitles, labels, chapter system text,
GUIDE/TUTORIAL) is stored as **glyph indices** into a per-table DXT1 atlas.

### 3.1 Record layout

```text
u16 flag
u16 w1 .. u16 wN     width field(s), N = flag >> 8  (one per display segment)
FF FD <u16 ctl> FF FC
u16 tail             copy of w1
body ... 0xFFFF
```

| Element | Meaning |
|---|---|
| `flag` | high byte = number of width fields (display segments); low byte = record-class byte (`0x01` subtitle/message, `0x00` used by some sNN0 dialogue records) — preserved on rewrite |
| width fields | per-segment pixel widths (`w_i = advance * glyphCount`; advance 22 px for sNN0 / movie / archive) |
| `FF FD <ctl> FF FC` | control sequence; `ctl` = `0x181C` (sNN0 / movie / archive) or `0x1216` (sNN1) |
| `tail` | copy of `w1` |
| body | glyph indices; terminated by `0xFFFF` |

- `flag` `0x0101` → 1 width field (12-byte header); `0x0201` / `0x0200` → 2 (14-byte);
  `0x0301` / `0x0401` / `0x0701` → 3 / 4 / 7.
- Multi-segment bodies separate the segments with `FF FE FF FC` followed by the
  next segment's width, i.e. `seg1 | (FF FE FF FC | u16 w_i | seg_i) ... | FF FF`.
  A `0x0201` / `0x0200` decode must therefore skip the inline `u16` width (it is a
  layout value, not a glyph index).
- Duplicate record names exist; same-named edits map to same-named records in
  order (1:1). Disambiguation key for sXX1 drafts: `NAME@0x<flag>`.
- Capacity (style-less N-segment record): `header = 2N + 10`,
  `body = 2*Σlen + 6*(N-1) + 2`; `header + body ≤ original record room`.
  (Styled records add 4 bytes to the body.)

### 3.2 Per-table glyph atlas

DXT1 texture; cell grid:

```text
movie / archive / chapter sNN0 : 21 x 18 = 378 cells
chapter sNN1                   : 28 columns x (H / 22) rows
                                 (512x128 -> 140 ; 512x256 -> 308)
cell 18x22, ink 16x16, advance 16 px
```

New glyphs are rendered (1-bit hinting) into free cells; glyph indices in the
record body are rewritten. Constraint: glyphs-not-in-atlas ≤ free cells.

---

# 4. MSN_DATA (HUD mission atlases) — Verified

Implementation: `_msnbuild.js` / `_msnblocks.js` / `_msncov.js`.

```text
"MSN_DATA"       8 bytes
u32 version      (= 1)
u32 count        (= 67 in observed chapters)
count x 12-byte records
count x 16-byte fixed-length names
```

Record (12 bytes): `u32 a` (y offset) | `u16 b` (text pixel width) |
`u16 c` (line height; MAIN=21, others=17) | `u32 d` (name pointer).

Names: `SNN_OBJECT_MAIN`, `SNN_OBJECT01_00`, … Text is baked into
`sNN_mission.dds` (256×2048 DXT1).

---

# 5. Global font atlas + mapping table — Verified

Implementation: `glyphgen.js`, `_tbladd.js`, `_tblcov.js`, `_fprobe2.js`,
`_frender.js`, `_fontcrop.js`.

```text
font01.dds       1024x4096 DXT1, 20x20 cells, 51 columns, 139 rows = 7089 slots
fontidexu8.tbl   character -> glyph-index table
shader/system/font.fbin   runtime font shader (not modified)
```

`fontidexu8.tbl` — "Table B" begins at byte offset `2000`; each entry:

```text
char[4]   the glyph's UTF-8 bytes, stored in REVERSE order
u32BE     glyph index
```

Cell coordinates for glyph index `g`: `col = g % 51`, `row = floor(g / 51)`,
`x = col*20`, `y = row*20 + 1`.

Allocation: the entry's `size` field limits the region to `59392` bytes (the next
entry's start). The localization grew the table from `58472` to `58568` bytes
(12 added Simplified glyphs in free slots `7059–7070`), staying inside that
region, so no offsets move.

---

# 6. DDS texture variants — Verified

Implementation: `build_mask.js`, `_maskimport.js`, `_dxt5a.js`, `_texdump.js`,
`_a8png.js`, `dds2png.js`.

The localization rewrites **pixel data only** and preserves the original DDS
header.

| Format | Usage | Handling |
|---|---|---|
| **A8** | monochrome text masks | 8-bit alpha; render rule `grey = 255 - alpha` (white text ⇒ alpha 255). Re-rendered with anti-aliasing. |
| **DXT1** | colour text/texture atlases | re-encoded full image (e.g. cautions, NOW LOADING, archive art) |
| **DXT5** | textures whose alpha is the mask (e.g. `hud/font_02_icon_jp.dds`, 256×256) | only the alpha blocks are rewritten for partial edits; symbols/English labels preserved |

`build_mask.js` writes new pixels into the existing (decoded) surface and keeps
the header/format, so entry sizes stay within the SNTP zero-relocation rule.

---

# 7. Other containers observed

| Magic | Meaning | Text? |
|---|---|---|
| `FONTDATA` | glyph-index text table | yes — main channel |
| `MSN_DATA` | HUD mission atlas | yes |
| `JMK_DATA` | movie time-axis data | no (timing only) |
| `TCD_DATA` | UI layout data | no |

`_magicscan.js` enumerated all text containers in the library; only FONTDATA and
MSN_DATA carried translatable strings.

---

# 8. Unknown / open format questions

- Exact meaning of SNTP header fields at `0x04`, `0x08`, `0x0C`, `0x18`.
- Whether the engine verifies any checksum over the archives (Unverified; working
  builds suggest not).
- Full semantics of FONTDATA `tailA` and the `flag` low byte variants beyond the
  header size (Unverified beyond what the writers must preserve).
