[English](README.md) | [简体中文](README.zh-CN.md)

# SIREN: New Translation (BCJS30020) — 简体中文本地化

为 PlayStation 3 游戏 **SIREN: New Translation**(日版,光盘 ID `BCJS30020`,死魂曲：新解)的简体中文(zh-CN)本地化提供源代码、翻译数据、工具、逆向工程笔记以及可复现的构建工作流。

---

# 项目

**游戏:** SIREN: New Translation(PS3,日版)
**本地化标题:** 死魂曲：新解（简体中文汉化）
**目标语言区域:** `zh-CN`(简体中文)
**平台:** PlayStation 3 — 主要在 RPCS3 模拟器上开发/验证
**光盘 ID:** `BCJS30020`
**支持版本:** 日版原盘(`PARAM.SFO CATEGORY=DG`,DVD/BD 游戏光盘)
**状态:** 初始本地化已完成并部署用于测试;游戏内 QA 与发布打包仍在进行中。参见 `docs/KNOWN_ISSUES.md`。

> 本项目是独立的粉丝本地化。它不包含任何原游戏素材。用户必须自行提供合法获得的游戏副本。

---

# 本本地化包含的内容

已本地化的内容(以下所有渠道均已实现并已部署用于模拟器测试):

- 影片 / 过场动画对话字幕
- 章节系统文本(游戏内动作提示、消息)
- 各章节 GUIDE / TUTORIAL 文本
- 归档视频字幕
- 游戏内文档(归档长文本页面)
- 游戏内手册
- 菜单与 UI(烘焙纹理:标题 / 章节名称、警告、选项、帮助、状态、地图、商店、归档标题、结果、任务列表)
- HUD 任务文本
- 启动器标签
- 全局字形图集扩展(新增 12 个简体字形)
- UTF-8 纯文本容器(系统文本、安装归档标题)

有意不翻译:仅含标识符的数据(产品列表、ID/数值表)、`render_setting.txt` 中从不渲染的日文注释,以及双语地图/时间纹理中刻意保留的英文副行。

---

# 支持的游戏版本

```text
Platform:      PlayStation 3
Region:        Japan
Distribution:  physical disc release (installs data to the HDD on first run)
Game version:  BCJS30020 (original Japanese disc)
Executable:    PS3_GAME/USRDIR/EBOOT.BIN
```

源可执行文件与归档的确切哈希/大小**尚未**记录在本仓库中(参见 `docs/KNOWN_ISSUES.md`)。二进制补丁工具在修改任何内容之前必须验证目标版本。

构建验证详情参见 [`BUILDING.md`](BUILDING.zh-CN.md)。

---

# 安装

1. 准备一份干净的、受支持的日版原游戏副本。
2. 获取一个本地化发行版(或自行构建 — 参见 `BUILDING.md`)。
3. 将发行版的 `USRDIR/sirenx/data/` 文件覆盖到游戏数据,或将发行版安装到 RPCS3 HDD 安装数据目录:
   `dev_hdd0/game/BCJS30020/USRDIR/sirenx/data/`。
4. 启动游戏。

> 本游戏是光盘版:在全新机器上首次运行时,它会将数据从源介质安装到 HDD。因此,可再分发的发行版必须修补**光盘源数据**,而不仅仅是 HDD 副本。参见 `BUILDING.md`。

---

# 卸载

- 被替换的文件:`sirenx/data/common.dat`、`common.hed` 以及各章节的 `sNN.dat` 归档。
- 生成的文件:构建工作区(`build/`)与发行版输出(`dist/`)。
- 不使用启动器、代理 DLL 或运行时钩子;本地化只是一组经过修补的数据文件。
- 要卸载,请从干净的游戏中还原原始的 `common.dat`/`common.hed`/`sNN.dat` 文件。

---

# 技术概览

引擎通过四个相互独立的渠道渲染文本,此处均已本地化:

1. **字形图集文本(FONTDATA)** — 对话/字幕/UI 字符串以字形索引的形式存储在一个 DXT1 图集中;翻译意味着将新字形渲染进图集,并重写 `common.dat` 与各章节 `sNN.dat` 中的索引/长度。
2. **烘焙图像文本(A8 / DXT1 / DXT5)** — 许多菜单将文本直接烘焙进纹理;这些会被重新渲染并写回 DDS。
3. **UTF-8 纯文本容器** 通过全局字体(`font01.dds` + `fontidexu8.tbl`)渲染,本地化通过补充缺失的简体字形对其进行了扩展。
4. **MSN_DATA** 位于各章节归档中的 HUD 任务图集。

归档使用大端序容器格式(`.hed` 索引 + `.dat` 载荷 + `.siz` 清单)。完整细节见 [`TECHNICAL.md`](TECHNICAL.zh-CN.md) 与 [`docs/FILE_FORMATS.md`](docs/FILE_FORMATS.md)。

---

# 仓库结构

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

生成输出(`build/`、`dist/`)以及每位开发者的 `config.local.json` 已由 `.gitignore` 排除。

---

# 从源码构建

```text
clean repository checkout
+ user-supplied original game directory
+ Node.js v24.x + Windows PowerShell (GDI+ text rendering)
        -> build.ps1
        -> validated localization data in dist/
        -> optional deployment to the RPCS3 HDD install
```

关于需求、命令与当前限制,参见 [`BUILDING.md`](BUILDING.zh-CN.md)。

---

# 翻译

翻译/创作数据位于:

```text
locales/zh-CN/source/
```

关于文件布局、各渠道格式、文本安全规则、容量限制以及导出/导入工作流,参见 [`TRANSLATING.md`](TRANSLATING.zh-CN.md)。

---

# 添加另一种语言

该工具链在设计上是语言区域中立的(`config.local.json` 携带一个 `locale`,工具接受按语言区域划分的输入)。新增一种语言区域会添加 `locales/<locale>/`,并且如果目标文字有不同的字体需求,则扩展全局字形图集。参见 `docs/LOCALIZATION_STANDARD.md` §19。

---

# 已知问题

玩家可见的限制与未解决的缺陷记录在 [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) 中。

---

# 技术研究

逆向工程发现、容器/格式文档与设计陷阱:

- [`TECHNICAL.md`](TECHNICAL.zh-CN.md)
- [`docs/FILE_FORMATS.md`](docs/FILE_FORMATS.md)
- [`docs/PITFALLS.md`](docs/PITFALLS.md)

这些文档同时保存了成功的发现与有意义的失败尝试。

---

# 兼容性

- 主要测试目标:RPCS3(任意较新的 x86-64 版本)。
- 本地化仅涉及数据;它不使用代理 DLL、运行时钩子或加载器,因此没有已知的加载器冲突。
- 零售 PS3 / CFW:未验证(发行版必须写入光盘源;参见 `BUILDING.md`)。

---

# 开发状态

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

# 贡献

欢迎参与翻译审校、术语、逆向工程、工具与 QA。贡献之前请阅读 `TRANSLATING.md`、`TECHNICAL.md` 与 `LICENSING.md`。

---

# 授权

本仓库混合了采用不同条款的材料。参见 [`LICENSING.md`](LICENSING.zh-CN.md) 与 `LICENSE` / `LICENSE-translations.md`。

原游戏及其文本、商标和素材仍归各自的权利持有人所有。请勿提交完整的专有游戏文件。

---

# 致谢

- 原游戏:SCE Japan Studio / Team Siren,由 Sony Computer Entertainment 发行。
- 项目负责人:nobina
- 本地化工具、逆向工程与翻译:项目贡献者(参见仓库历史)。
