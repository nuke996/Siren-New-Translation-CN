[English](TECHNICAL.md) | [简体中文](TECHNICAL.zh-CN.md)

# 技术说明

针对 SIREN: New Translation（BCJS30020）zh-CN 本地化的逆向工程发现、实现细节
与未解决的技术问题。

这些知识被保留下来，以便未来的贡献者不必重新发掘。
**置信度被分级**为已验证 / 高置信度推断 / 未验证假设。下文中的大多数光盘行为
通过可加载的原地产物而判定为*已验证*（本地化数据能在 RPCS3 中启动）；结构性读取
则按其确认方式加以标注。

---

# 1. 证据分级

- **已验证**——通过产出可正常工作的产物，或直接检查原始数据而确认。
- **高置信度推断**——在所有已观察记录中保持一致。
- **未验证假设**——看似合理但尚未确认。

若某项论断仅由本地化工具链（而非引擎）推断得出，则会明确标注。

---

# 2. 受支持的游戏版本

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

下文的全部偏移/结构仅假定对本发行版有效。本项目**不**对可执行文件打补丁
（见 §15），因此无需代码偏移表；风险仅限于数据格式方面的假设。

---

# 3. 文本资源映射

所有用户可见文本均由数据驱动；可执行文件中不存在本地化需要触及的硬编码系统
文本。文本分布在四个通道中，横跨三个归档组。

| 资源 | 用途 | 通道 | 编码 | 可编辑 | 备注 |
|---|---|---|---|---|---|
| `common.dat` `hud/movie/*` | 过场动画字幕 | 字形图集 | 字形索引 | 是 | FONTDATA 记录 |
| `common.dat` `hud/launcher/jimaku/archive_*` | 归档视频字幕 | 字形图集 | 字形索引 | 是 | FONTDATA |
| `common.dat` `hud/launcher/label` | 启动器标签 | 字形图集 | 字形索引 | 是 | FONTDATA + `label.dds` |
| `sNN.dat`（章节） | 章节系统文本 | 字形图集 | 字形索引 | 是 | `sNN0` FONTDATA |
| `sNN.dat`（章节） | 指南/教程 | 字形图集 | 字形索引 | 是 | `sNN1` FONTDATA，不同的头部 |
| `sNN.dat` `hud/mission/sNN_mission` | HUD 任务文本 | MSN_DATA + DXT1 | 字形图集 + 名称 | 是 | §6 |
| 菜单/UI 纹理（`menu/jp/**`、`hud/**`） | 菜单、警告、选项、地图、状态、商店、说明书、归档 | 烘焙图像 | A8 / DXT1 / DXT5 | 是 | 重新渲染纹理 |
| `text/system.dat`, `installarchive/header_*.txt` | 系统文本、归档头部 | UTF-8 纯文本 | UTF-8 | 是 | 通过全局字体渲染 §7 |
| `setting/render_setting.txt` | 渲染设置 | Shift-JIS | SJIS | 不 | 仅 `#` 注释中含日文，从不渲染 |
| `productlist.txt`, `pjp_*_data.txt` | 商店/产品 ID/值表 | ASCII | 不 | 标识符，不翻译 |

不要假设所有可见文本都来自同一来源；这四个通道具有不同的编码、容量与重建路径。

---

# 4. 归档容器（SNTP）——高层概览

已验证。游戏数据归档是由三个文件构成的 SNTP 容器：

```text
common.hed   index (entry table, sizes, names)
common.dat   payload (concatenated entries)
common.siz   secondary size manifest
```

索引为大端序。每个章节归档（`s01.dat` …）都是 `common.dat` 内部的一个条目，
而每个章节自身包含两个 FONTDATA 表（`sNN0`、`sNN1`）外加一个任务图集。详细的
字段布局见 `docs/FILE_FORMATS.md` §SNTP。

本地化采用**零重定位**更新策略：替换内容不得超过该条目原始偏移处可用的空间，
因此偏移量与 `.siz` 清单永不改变（仅更新 `.hed` 中条目的 `size` 字段）。
`sntp_pack.js` 另外允许增长到下一个条目的起始地址为止。参见 `docs/PITFALLS.md`。

---

# 5. FONTDATA（字形索引文本）——已验证

可变文本以**字形索引**的形式存储，指向每张表各自的 DXT1 图集。

记录头部：

```text
u16 flag
u16 x N   width fields          (N = flag >> 8)
FF FD <ctl:u16> FF FC           (control sequence)
u16 tailA
body ... 0xFFFF                 (terminator)
```

- `N = flag >> 8`：`0x0101` → 1 个宽度字段（12 字节头部），`0x0201` → 2 个
  （14 字节头部），`0x0301`/`0x0401`/`0x0701` → 3/4/7 个宽度字段。
- 控制序列为 `FF FD <u16> FF FC`；其中内嵌的 `<u16>` 取决于表族：章节 `sNN0` /
  电影 / 归档 = `0x181C`；`sNN1` = `0x1216`。
- `0x0201` 记录在主体内部含有一个额外的 `u16`，其值等于第二个分段的宽度；
  解码时必须跳过它（已在 `msgdecode.readPayload` / `importsheet.readMsg` 中实现）。
- 存在重名记录。`msgwrite.js` 将同名编辑与同名记录**按顺序 1:1** 分配；sXX1
  草稿用键 `NAME@0x<flag>` 加以区分。

容量（硬性约束，已验证）：

```text
bodyLen = (style ? 4 : 0) + 2 * len + 2  <=  original record room
```

超出该值即为适配失败，需要缩短译文。

图集容量：

```text
movie / archive / chapter sNN0 : 21 x 18 = 378 cells
chapter sNN1                   : 28 columns x (H / 22) rows
                                 (512x128 -> 140 ; 512x256 -> 308 cells)
cell 18x22, ink 16x16, advance 16 px
```

真正的约束是*尚未存在于图集中的字形数量* ≤ 空闲单元数量——而非译文的行数。
缩短译文并不会释放单元；翻译更多消息反而可能解锁受保护的单元（若某个受保护
字形尚未进入图集，则含有该字形的消息必须保留日文）。

---

# 6. MSN_DATA（HUD 任务图集）——已验证

每个章节的 HUD 任务文本是一个独立的 `hud/mission/sNN_mission.dat`（MSN_DATA）
加上 `sNN_mission.dds`（256×2048 DXT1，文本被烘焙进图集）。

```text
"MSN_DATA" (8 bytes)
u32 version (= 1)
u32 count   (= 67)
count x 12-byte records
count x 16-byte fixed-length names
```

记录 = `u32 a`（y 偏移）`u16 b`（文本像素宽度）`u16 c`（行高；MAIN=21，其他=17）
`u32 d`（名称指针）。名称形如 `SNN_OBJECT_MAIN`、`SNN_OBJECT01_00`。任务文本复用
`main_map/text_aim` / `text_smallaim` 的译文（见 §19）。

---

# 7. 字体系统——已验证

存在两套相互独立的字体系统。

### 7.1 逐表字形图集（通道 A/B，§5）

每张 FONTDATA 表都自带一张 DXT1 图集。新字形使用 GDI+（PowerShell
`render_text.ps1`）渲染并写入空闲单元；消息记录中的字形索引表也随之被改写。
**字形图集以 1 位 hinting 渲染**（`TextRenderingHint::SingleBitPerPixelGridFit`，
选项 `hint:'sbp'`），因为在 DXT1 量化之后抗锯齿会让 17–20 px 的 CJK 笔画变得
灰暗/模糊——原始日文字形接近 1 位。

### 7.2 全局字体（UTF-8 纯文本通道）

```text
font01.dds       1024x4096 DXT1, 20x20 cells, 51 columns, 139 rows = 7089 slots
fontidexu8.tbl   character -> glyph index table
shader/system/font.fbin   runtime font shader
```

`fontidexu8.tbl` 布局：从字节偏移 `2000`（"Table B"）开始，每个条目为 `char[4]`
（该字形的 UTF-8 字节，**逆序**存储）后跟 `u32BE glyphIndex`。单元坐标：
`col = g % 51`，`row = floor(g / 51)`，`x = col*20`，`y = row*20 + 1`。

该表原本是一款**日文**字体，缺少 12 个简体字形：
`载 请 戏 关 闭 电 盘 词 编 华 德 ·`。本地化将 SimHei 字形注入空闲槽位
`7059–7070`，并追加 12 条记录（表从 `58472 → 58568` B 增长，仍处于该条目
`59392` B 的分配区间内，因此偏移量不会移动）。

`main_hiragana.dds` / `launcher_title/element/hiragana.dds` / `*.epm` 是书法标题的
字形来源与布局描述文件；它们不含文本，经由位图通道替换。

---

# 8. 渲染管线（当前的理解）

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

本地化**不**挂钩或替换渲染器代码；它只改变数据（图集像素、字形索引、记录长度、
烘焙纹理）。

---

# 9. 控制码

| 控制码 | 含义 | 状态 |
|---|---|---|
| `FF FD <u16> FF FC` | 记录内的分段/格式控制序列，`<u16>` = `0x181C`（sNN0/电影/归档）或 `0x1216`（sNN1） | 已验证 |
| `0xFFFF` | 记录终止符 | 已验证 |
| `u16 flag` 高位字节 | 宽度字段的数量 | 已验证 |
| `0x0201` 内嵌宽度 `u16` | 存储于主体中的第二分段宽度 | 已验证 |

未知的重复出现的字节序列必须予以保留。

---

# 10. 文本编码

- 通道 A（字形图集）：**以字形索引编码**——并非字符编码。
- 章节/教程解码表以 `chap_templates.json` 的形式发布，自定义日文解码器还使用
  `vocab*.json` 词典。该解码器并不完善：`◇` 标记解码未命中，`※` 在草稿中标记
  不确定的注释。二者都会在导入时被剥离，且不得进入游戏。`docs/PITFALLS.md`
  记录了由此产生的误解码（例如 `鎌→備`、`猟銃→孤銃`）。
- 通道 C 纯文本：**UTF-8**（`text/system.dat`、`header_*.txt`）。
  `render_setting.txt` 为 **Shift-JIS**，但仅其 `#` 注释行是日文，而这些行
  从不渲染。
- 烘焙纹理：是像素，不是文本。

---

# 11. 字体度量 / 布局

- 宽度字段是逐记录的，单位为表格单元（见 §5）。
- `main_map` 与时间轴**按设计是双语的**：`*_jp` = 日文行，`*_other` = 英文行。
  本地化让 `*_jp` 保持中文，并在 `*_other` 中恢复原始英文；掩码重新生成可能会
  悄无声息地把 `*_other` 重新定向回中文，因此每次批量重新生成后都必须运行
  `_revertpatch.js "place_other" "time_other"`。
- 在重新渲染之前，A8/DXT 烘焙文本的布局通过 `_masklines.js` 从原始纹理中测量
  得出（行/列带）。

---

# 12. 二进制补丁

**无。** `EBOOT.BIN` 及所有可执行文件均保持原样。本地化纯粹是数据（归档 + 纹理
+ 字体表）。这是刻意做出的设计选择，并消除了一大类版本兼容性风险。

---

# 13. 运行时钩子

无。不使用任何代理 DLL、加载器或跳板。

---

# 14. 归档格式 / 次级清单

- 容器 = SNTP（`.hed` + `.dat`），大端序。详见 `docs/FILE_FORMATS.md`。
- `common.siz` 是次级大小清单。由于本地化从不改变偏移量或大小，`common.siz`
  保持不变（`docs/PITFALLS.md`）。

---

# 15. 压缩 / 校验和 / 对齐

- 纹理使用 **DDS** 容器承载 **DXT1 / DXT5 / A8** 载荷；DDS 头部被保留，仅重写
  像素块（`build_mask.js`、`_dxt5a.js`）。本地化不对归档载荷应用块压缩。
- 工具链内部使用 **MD5** 来检测哪些文件发生了更改（`_depcheck.js`、
  `_repack_disc.js`）。引擎自身是否校验校验和**尚未验证**；可正常运行的构建
  表明它不会拒绝打过补丁的数据。
- 条目对齐由零重定位策略保持不变。

---

# 16. 关联 / 镜像字符串

- 物品名称存在于两个平行的系统中：`AC_CHANGENAME_*`（“切换到
  【…】”）和 `AC_PICK_UPNAME_*`（“拾取 【…】”），外加 `GET_ITEMNAME_*`。三者
  都必须与烘焙在
  `menu/jp/main_status/{weapon,item}_name/name_i_*.dds`
  中的**权威**物品名称保持一致
  （`_itemaudit.js` / `_itemfix.js`，跨 24 个章节共 259 处修正）。
- 角色名称以基础 / 带前缀 / 缩写等变体出现；由于归档名称被用作内部键，因此在
  `zh_draft_common.json`（`archive_names`）中维护了一份共享来源。
- `I_EV_*` 记录**并不**与 `name_i_ev_*` 纹理一一对应；`_itemfix.js`
  有意跳过它们。

---

# 17. 硬编码字符串

在可执行文件中未发现需要翻译的用户可见硬编码系统字符串。其余硬编码表
（`productlist.txt`、`pjp_*_data.txt`）是标识符/值，有意保持原样。

---

# 18. 存档数据与标识符

没有任何显示字符串在本地化会改变的方面同时充当存档/任务/物品栏标识符：纹理/消息
标识符（`SNN_OBJECT_*`、`name_i_*`、记录名、`archive_names` 键）均被保留；仅更改
显示文本。归档名称映射特意保留日文原文作为键，正是为了避免破坏引用。

---

# 19. 模拟器与运行时测试

- 模拟器：**RPCS3**（主要在构建版
  `v0.0.17-12558-a06a93d5` 上验证）。游戏读取其 **HDD 安装数据**
  （`dev_hdd0/game/BCJS30020/USRDIR/sirenx/data/`），因此部署是双写的：
  HDD 安装数据**和** `mirror` 光盘目录树，然后由 `dist` 经 `_repack_disc.js`
  刷新。
- 未经验证，不要将模拟器的怪癖与引擎行为混为一谈。

---

# 20. 已知故障 / 失败的方法 / 待解问题

详细的陷阱见 `docs/PITFALLS.md`；用户可见的限制见
`docs/KNOWN_ISSUES.md`。值得注意的待解事项：

- 0x0201 字幕居中并不总是居中（需要进行游戏内回归测试）。
- 解码器的误读会导致物品名称错误，除非对齐到权威纹理名称（`_itemfix.js`）。
- 长字符串会溢出固定槽位，必须缩短
  （`bodyLen <= room`）。
- `ARCHIVE030` 有意保留日文 `ろ`（U+308D，Uroboros 的谐音拼法）——已列入
  审计白名单。

---

# 21. 上游研究

未使用任何第三方本地化框架或已提取的归档库；容器解析器与字形工具均为本项目自行
编写的 Node.js 脚本。运行时测试使用 RPCS3（上游模拟器）。GDI+ 文本渲染由
Windows PowerShell 提供。若日后复用任何外部工具，应扩充上游署名。

---

# 22. 工具清单

| 工具 | 用途 | 来源 |
|---|---|---|
| `sntp.js` / `sntp_pack.js` | SNTP 归档列出/提取/重新打包 | 本项目 |
| `importsheet.js`, `glyphgen.js`, `msgwrite.js` | FONTDATA 提取、字形渲染、消息重写 | 本项目 |
| `_s11gen.js`, `_s11write.js`, `_s11batch.js` | 章节 指南/教程 图集生成 | 本项目 |
| `_labelgen.js`, `_labelwrite.js` | 启动器标签图集 | 本项目 |
| `build_mask.js`, `_maskimport.js`, `_d5gen`…`_d13gen`, `_d12gen.js`, `_manualbuild.js`, `_archivebuild.js`, `_manheadbuild.js`, `_iconbuild.js`, `_msnbuild.js` | 烘焙纹理重新生成 | 本项目 |
| `_tbladd.js`, `_tblcov.js`, `_fprobe2.js`, `_frender.js`, `_fontcrop.js` | 全局字体图集扩展 / 验证 | 本项目 |
| `_deploy.js`, `_chapterdeploy.js`, `_mirrorsync.js`, `_depcheck.js`, `_repack_disc.js` | 部署（HDD+mirror）与光盘重新打包 | 本项目 |
| `_i18n_export.js`, `_i18n_import.js`, `_i18n_lib.js`, `_pipeline.js` | 译者往返与共享构建流水线 | 本项目 |
| `_validate_i18n.js` | 译者视图预检校验（标记/假名/控制/占位符/缺失字形）+ 构建诊断汇总 | 本项目 |
| `_subaudit.js`, `_itemaudit.js`, `_chapaudit.js`, `_jmkaudit.js`, `_magicscan.js`, `_finalaudit.js` | 自动化审计 | 本项目 |
| `render_text.ps1` | GDI+ 字形渲染 | 本项目 |
| RPCS3 | 运行时验证 | 上游（模拟器） |
