[English](BUILDING.md) | [简体中文](BUILDING.zh-CN.md)

# 构建

如何从一份干净的仓库检出加上用户提供的原版游戏,重新构建 SIREN: New Translation (BCJS30020) 的 zh-CN 本地化。

该流程旨在可复现,并且独立于原开发者的机器。在期待一条命令即可完成干净构建之前,请先阅读 "当前限制" 一节:仍有少数输入是机器本地专属的,正在迁移中。

---

# 1. 受支持的游戏版本

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

仅对此版本进行过测试。该本地化不修改可执行文件(仅数据),因此版本风险仅限于归档/格式布局,但仍应记录所需的归档哈希(见 `docs/KNOWN_ISSUES.md`)。

---

# 2. 环境要求

- **Node.js v24.x**(这些工具是在 Node 24 上编写并测试的;更旧的 LTS 版本或许可用,但未经过测试)。
- **Windows PowerShell 5.1+**,需带有用于文本渲染的 .NET/GDI+(`tools/render_text.ps1` 使用 `System.Drawing` 渲染字形)。
- 一个包含目标字形的**字体**,已安装在本机上。生效的字体由 `.\build.ps1 -Task rebuild -Font "<name>"` 设置(它会写入 `work/font_cfg.json`,默认为 `SimHei`);见 §13。
- 一个被允许使用的源光盘镜像解压缩工具(7-Zip/WinRAR),用于提取 `PS3_GAME/`。
- 原版游戏文件(§3)。

无需 Python、CMake、编译器或包管理器;工具链是自包含的 Node.js + PowerShell。

---

# 3. 原版游戏文件

用户必须提供一个已解密/已提取的**光盘根目录**——即包含 `PS3_GAME/` 和 `PS3_DISC.SFB` 的文件夹。这些工具会读取:

```text
<gameRoot>/PS3_GAME/USRDIR/sirenx/data/
    common.hed, common.dat, common.siz
    s01.dat … s08.dat, s09.dat, s10.dat … s23.dat, s25.dat
```

此版本中不存在 `s24.dat`。**`s09.dat` 约为 97 MB,且在原始开发光盘目录树中是缺失的**——它只存在于 RPCS3 的 HDD 安装中。要完成完整的光盘重建,你必须提供一个包含 `s09.dat` 的完整光盘(见 `docs/KNOWN_ISSUES.md`)。

这些文件受版权保护,**不**存储在此仓库中。

---

# 4. 仓库准备

```bash
git clone <repository-url>
cd Siren-New-Translation-CN
copy config.example.json config.local.json
```

编辑 `config.local.json`:

```json
{
  "locale": "zh-CN",
  "gameRoot": "D:/path/to/disc-root",
  "hddData":  "D:/path/to/rpcs3/dev_hdd0/game/BCJS30020/USRDIR/sirenx/data",
  "font": "SimHei",
  "fontBold": 0
}
```

将 `workDir`/`mirrorDir`/`distDir` 留空,以使用仓库本地的 `build/` 和 `dist/`。`config.local.json` 已被 git 忽略。

如果**不存在**配置文件,这些工具会回退到原开发者的路径("legacy 模式")——在原机器上有用,但不可移植。

---

# 5. 路径可移植性(工具如何定位游戏)

工具链通过 `tools/_config.js` 原生解析所有根目录:

- **JS 工具**(`tools/*.js`)通过 `require('./_config.js')` 引用这些根目录(例如 `${__P.WORK}`、`${__P.DISC}`、`${__P.HDD}`);它们**不**包含任何开发者绝对路径。
- 带有路径值的**数据文件**(`locales/<locale>/source/patch_common.json`、`patch_font.json`、`font01_zh.glyphspec.json`)将这些路径存储为**相对于工作区**(`work/`);其使用方(`sntp_pack.js`、`glyphgen.js`)会相对于 `WORK` 解析相对路径。

配置的解析顺序:`$SNT_CONFIG` → `<repo>/config.local.json` → legacy 开发者默认值(因此已有的机器在无配置的情况下也能工作)。其结果是:

- 项目可以放置在**任意路径**下(已通过从重定位后的副本运行 `extract` 验证);
- 有配置时,工具会使用你的 `gameRoot`、RPCS3 HDD 数据和仓库本地的 `work`/`dist`;无配置时,行为与原机器一致。

根目录:`DISC` = `<gameRoot>/PS3_GAME/USRDIR/sirenx/data`,`HDD` 来自 `hddData`,`WORK` = `<repo>/work`(`tools/` 的同级目录——为 `glyphgen.js` / `render_text.ps1` 所必需)。

---

# 6. 首选构建入口

`build.ps1` 是唯一的入口:

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

`-Task build|import|rebuild` 在存在 `config.local.json` 时会自动先运行 `prepare`。`-Task extract` 还会从游戏中拉取基础资源(见 §3.1)。`导出汉化.bat` / `导入汉化.bat` 是围绕 `-Task export` / `-Task import` 的薄封装。

也可以将参数放入 `config.local.json`;此时可省略 `-GameDir`/`-HddDir`。

### 3.1 由游戏派生的基础资源(extract)

构建流水线需要一些无法提交到仓库的原版输入。`-Task extract` 会通过 `tools/_extract_base.js` 从用户**干净的**游戏目录生成这些输入:

| 输出(位于 `work` 中) | 来源 |
|---|---|
| `font01.dds`, `fontidexu8.tbl` | `common.dat` 条目(全局字体基础) |
| `label.dat`, `label.dds` | `common.dat` `hud/launcher/label.*` |
| `txt_e/render_setting.txt` | `common.dat` `setting/render_setting.txt` |
| `system_jp.dat`, `header_music.txt`, `header_photo.txt` | `common.dat` 纯文本原件(导出参考) |
| `archdds/*.dds`, `archlayout.json` | 由 `_archlayout.js` 从光盘重新生成 |
| `manualpng/*.dds`, `rd_index.json`, `rr_index.json` | 由 `_manual_extract.js` 从光盘重新生成 |

> 游戏目录**必须未被修改**。如果它已被某次本地化构建覆盖,`extract` 会把本地化数据当作原版数据来捕获。

各表的 `fontdata` 原件(`work/import/*.orig.*`)由 `importsheet.js` 按需从光盘生成,因此无需预先提取——**前提是提供了完整、干净的光盘(包含 `s09.dat`)**。

---

# 7. 推荐构建流水线(`-Task build`/`import` 所做的事)

`tools/_pipeline.js` 按顺序驱动:

1. 全局字体扩展 —— `glyphgen.js`、`_tbladd.js`
2. FONTDATA 图集 —— `importsheet.js --all`、`--chapters`、归档视频
3. 第 9 章(从其保存的原版基础)—— `_s09base.js`、`importsheet`、`_s11batch.js`
4. 烘焙纹理 —— `_d5gen`…`_d13gen`、`_d12gen`、`_labelgen`/`_labelwrite`、`_manualbuild`、`_archivebuild`、`_manheadbuild`、`_iconbuild`、`_msnbuild`、`_s11batch`,以及独立的蒙版作业
5. `_revertpatch.js place_other time_other`(恢复双语中的英文行)
6. 纯文本 —— `_e_txt.js` + 合并进 `patch_common.json`
7. 部署 —— `_deploy.js`(HDD + mirror)、`_chapterdeploy.js`、`_msnbuild --deploy`、`_mirrorsync.js`
8. `_repack_disc.js --apply` → `dist`

可单独运行的验证/审计:`_subaudit.js`、`_itemaudit.js`、`_chapaudit.js`、`_jmkaudit.js`、`_magicscan.js`、`_finalaudit.js`、`_depcheck.js`。

---

# 8. 构建输出

```text
work/     intermediate workspace (source copies + generated specs)
build/mirror/   disc-tree mirror used for dual-write deployment
dist/           repacked disc data (USRDIR/sirenx/data/*) for release
```

以上均已被 git 忽略。要构建最终的光盘镜像,请将 `dist/` 覆盖到原版 `PS3_GAME` 的副本上(movie/stream/voice/zzdat/EBOOT 保持不变)。

---

# 9. 版本验证

该项目是**仅数据**的,不应用二进制补丁,因此目前未实现字节级的版本校验关卡。在发布之前,请记录并检查:

- `EBOOT.BIN` 大小 / SHA-256
- `common.hed`、`common.dat`、`common.siz` 哈希
- 存在预期的章节归档

如果添加了会修改可执行文件的发布工具,它必须校验目标版本,并在不匹配时失败。

---

# 10. 验证

由于没有编译器,"验证"即为审计工具加上游戏内测试。发布之前:

译者往返流程会被自动检查:`_validate_i18n.js` 在 `-Task export` 之后、`-Task import` 写入任何内容之前运行(出现 ERROR 会中止导入,除非使用 `--force`),并报告视图文件、条目 `id` 以及有问题的句子;import 还会汇总构建诊断信息(`work/import/_fitfail.txt`、`_capskip.txt`、`_cap_*.txt`)。以下的审计仍需手动运行。

- `_subaudit.js` → 无未映射字形 / 无残留日文(对 `ARCHIVE030` 等有意保留的假名设有白名单)
- `_chapaudit.js`、`_jmkaudit.js`、`_magicscan.js`、`_finalaudit.js` → 无缺失记录
- `_depcheck.js` → 仅 HDD 为 0 / 仅 mirror 为 0
- 在 RPCS3 中进行游戏内冒烟测试(菜单、对话、字幕、存档、章节切换)

---

# 11. 语言区域选择

`config.local.json` 携带 `locale`。目前仅实现了 `zh-CN`;流水线和数据布局以语言区域为作用域,因此可以添加第二个语言区域。

---

# 12. 依赖管理

没有 `package.json`:这些工具仅使用 Node 标准库以及 Windows PowerShell/.NET。Node.js v24.x 是唯一的运行时依赖。在可行的情况下,请将发布所用的确切 Node 版本记录在发布说明中。

---

# 13. 字体

- 字体选择集中在 `work/font_cfg.json` 中,由 `.\build.ps1 -Task rebuild -Font "<name>"`(或 `tools/_setfont.js "<name>"`)写入,并可通过 `ZH_FONT` 环境变量按次运行覆盖。所有生成器都通过 `render_text.ps1` 渲染,后者会读取该配置。
- (`config.local.json` 中的 `font`/`fontBold` 仅供引用;生效的开关是上面所述的那个。)
- 默认:`SimHei`(一种 Windows 系统 CJK 字体)。分发前请核实该字体的许可证;不要提交专有的操作系统字体。
- 字形图集以 1-bit hinting 渲染;A8 蒙版使用抗锯齿。在较大字体变更之后,请目视复查 `_s11gen`/`_labelgen` 的对齐以及最长的行(任务目标、手册标题)。

---

# 14. 归档与资源工具

项目自行编写的自定义 Node.js 工具(`TECHNICAL.zh-CN.md` §22)。SNTP 容器解析器(`sntp.js` / `sntp_pack.js`)是关键的一个;其格式记录在 `docs/FILE_FORMATS.md` 中。

---

# 15. 二进制补丁

未使用。见 `TECHNICAL.zh-CN.md` §12。

---

# 16. 构建日志

`_pipeline.js` 会打印每个步骤以及最终的 `ok/failed` 计数。失败的步骤不会中止整个运行(以便允许部分重新生成),因此**务必检查最终计数和审计结果**,而不仅仅是看有没有堆栈跟踪。

---

# 17. 发布构建

目前还没有单独的发布任务。一次发布即:

1. 针对干净的游戏目录运行 `-Task build`;
2. 运行审计(§10);
3. 打包 `dist/USRDIR/sirenx/data/` 并附上安装说明。

不要将发布归档存放在仓库根目录。

---

# 18. 干净构建测试

步骤(目前**未通过**——见下一节):

1. 全新克隆到一个新目录;
2. `config.local.json` 指向干净的光盘 + RPCS3 HDD;
3. `.\build.ps1 -Task build`;
4. 将 `dist/` 与已知良好的发布版本进行比对。

---

# 19. 可复现性说明

字节级完全一致的输出**未**经验证。可能的差异来源:不同 Windows/字体版本之间的 GDI+ 光栅化,以及 DDS 编码。预期输出在*功能上一致*;请记录任何版本间的差异。

---

# 20. 故障排查

完整列表见 `docs/PITFALLS.md`。常见情况:

- "改了但没效果" → 部署必须同时到达 HDD 和 mirror,然后是 `dist`;请使用 `_depcheck.js`。
- `_other`(英文)的地图/时间行被还原成了中文 → 重新运行 `_revertpatch.js`。
- 适配失败 / 容量错误 → 译文对某个记录槽位来说过长,或图集空闲单元格太少;见 `docs/PITFALLS.md` 以及 `_cap_*.txt` 诊断。
- 无法写入 RPCS3 HDD 目录 → 权限/沙箱问题;部署需要授予写访问权限(仅构建模式仍会生成 `dist`)。
- 第 9 章无法重新生成 → 其保存的原版基础(`work/import/s090.orig.*`)缺失;对于仅存在于 HDD 的 `s09.dat`,此基础是必需的。

---

# 21. 当前限制(干净仓库重建尚未完成)

构建入口现在可以为每个文本通道(§3.1)准备源文件并提取由游戏派生的基础资源。真正干净的 `checkout + game -> rebuild` 现在仅取决于:

1. **一份干净、完整的游戏源。** 开发光盘目录树缺失 `s09.dat`(它只存在于 RPCS3 HDD 安装中),且本地 `PS3_GAME` 后来被某次本地化构建覆盖。需要一个包含 `s09.dat` 的原始光盘;否则第 9 章无法从源重建,且 `extract` 会把本地化的字体/标签/手册数据当作原版捕获。`-Task extract` 会报告 `s09.dat` 的状态。
2. **路径可移植性依赖于加载期垫片(shim)**(§5)。这约 159 个工具仍包含绝对路径,最终应重构为原生使用 `tools/_config.js`。
3. **未记录任何版本哈希**(§1)。
4. **不保证字节级完全一致的输出**(§19)。

各项的跟踪状态见 `docs/KNOWN_ISSUES.md`。
