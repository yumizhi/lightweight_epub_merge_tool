# Lightweight EPUB Merge Tool
[![License](https://img.shields.io/github/license/yumizhi/lightweight_epub_merge_tool)](./LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/yumizhi/lightweight_epub_merge_tool)](https://github.com/yumizhi/lightweight_epub_merge_tool/releases/latest)
[![GitHub All Releases](https://img.shields.io/github/downloads/yumizhi/lightweight_epub_merge_tool/total)](https://github.com/yumizhi/lightweight_epub_merge_tool/releases)
[![GitHub stars](https://img.shields.io/github/stars/yumizhi/lightweight_epub_merge_tool)](https://github.com/yumizhi/lightweight_epub_merge_tool/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/yumizhi/lightweight_epub_merge_tool)](https://github.com/yumizhi/lightweight_epub_merge_tool/network/members)

![Lightweight EPUB Merge Tool Screenshot](./assets/merge_epubs_tool_gui.png)

---

## 中文说明

轻量 EPUB 合并工具与 GUI，适合多卷轻小说合并为一册。目标是尽量保留插图与章节结构，并重建按卷分组的目录（TOC）。

### ✨ 功能特性

- 将多卷 `.epub` 合并为一本“合订本”
- 保留每卷的文本、插图、CSS 等资源，不丢插图页
- 自动识别并合并 EPUB 3 `nav.xhtml` 与 EPUB 2 `toc.ncx`
- 重建按卷分组的总目录，例如：
  - 第 1 卷 xxx
    - 序章
    - 第一章 …
  - 第 2 卷 xxx
    - …
  - 短篇 / 外传等
- 对无目录文件的 EPUB，按 spine 顺序生成简单章节列表
- 适配不同站点导出的 EPUB：
  - 自动处理 `Chapter 1.html` / `Chapter%201.html` 等路径差异
  - 自动查找 `content.opf`（支持根目录、`OEBPS/`、`EPUB/` 等多种结构）
- 两种使用方式：
  - 命令行：适合脚本化批处理
  - GUI（Qt / PySide6）：拖拽排序、拖文件进窗口、自然排序等
- 元数据 & 封面：
  - 支持设置作者、语言、出版社、出版日期、ISBN、主题、简介等信息
  - 支持添加/替换/提取封面图片

### 🚀 打包版直接运行（无需 Python）

你可以直接在仓库 **Releases** 页面下载已打包的可执行版本，解压后即可运行（不需要安装 Python / 依赖）。

使用步骤（通用）：
1. 打开仓库的 **Releases** 页面
2. 下载与你系统对应的打包文件（通常是 `.zip` / `.tar.gz`）
3. 解压到任意目录
4. 运行其中的程序（macOS 一般是 `.app` 或可执行文件；Windows 一般是 `.exe`）

#### macOS 安全提示（未签名/未公证的常见情况）

如果你看到类似提示：
> Apple 无法验证“LightweightEPUBMergeGUI”是否包含可能危害 Mac 安全或泄漏隐私的恶意软件

可按以下方式处理（任选其一）：

**方式 A（推荐）：系统设置允许一次打开**
1. 打开 **System Settings / 系统设置**
2. **Privacy & Security / 隐私与安全性**
3. 在“已阻止打开某应用”的提示附近，点击 **Open Anyway / 仍要打开**

**方式 B：移除隔离属性（quarantine）**

在终端进入解压目录后执行（把路径替换成你的实际程序路径）：

```bash
xattr -dr com.apple.quarantine "/path/to/LightweightEPUBMergeGUI.app"
```

然后再双击打开。

> 说明：这是 macOS Gatekeeper 对“非签名/非公证”应用的正常拦截机制；我不是开发者，无法进行代码签名与公证。

### 🧰 源码运行（适合开发者）

#### 环境要求

* Python 3.8+
* CLI：仅标准库，无第三方依赖
* GUI（Qt）：需要 `PySide6`

#### 安装

```bash
git clone https://github.com/yumizhi/lightweight_epub_merge_tool.git
cd lightweight_epub_merge_tool
```

如需运行 GUI：

```bash
pip install PySide6
```

> 在 macOS / Linux 上，如果你有多个 Python 版本，请确保 `pip` 与运行 `python3` 的环境一致。

### 📌 使用方法

仓库包含两个核心入口：

* `merge_epubs.py` — 核心合并逻辑 / 命令行工具
* `merge_epubs_gui.py` — GUI（PySide6 / Qt）

> 注意：GUI 脚本需要与 `merge_epubs.py` 位于同一目录。

#### 1) 图形界面（推荐）：`merge_epubs_gui.py`

启动：

```bash
python3 merge_epubs_gui.py
```

主要能力：

* 文件列表管理
  * 支持拖拽排序（上下拖动即可调整卷顺序）
  * 支持 Shift / Ctrl / Command 多选
  * 支持 Delete 键删除选中项
* 支持从文件管理器直接把 `.epub` 拖进窗口自动添加
* “按文件名自然排序”
  * 自动将 `xxx 2.epub` 排在 `xxx 11.epub` 之前
* 元数据 & 封面（GUI 中可直接填写/选择）
  * 作者、语言、出版社、出版日期、ISBN、主题、简介
  * 卷标题模板（可自定义）
  * 封面：仅新增 / 强制替换 / 一键提取首卷封面

适用场景：

* 偶尔合并一整套轻小说，不想记命令行参数
* 希望直观地拖动调整卷顺序
* 像管理播放列表一样管理待合并文件

#### 2) 命令行：`merge_epubs.py`

基础用法：

```bash
python3 merge_epubs.py OUTPUT.epub VOL1.epub VOL2.epub VOL3.epub ...
```

常用参数（示例与含义）：

* 基础元数据（覆盖或写入）
  `--title` / `--author` / `--language` / `--publisher` / `--published` / `--isbn` / `--subject` / `--description`

  > 作者与主题支持用 `//` 分隔多个值
* 卷标题模板（自定义“第 n 卷”显示方式）
  `--volume-label-template "Vol.{n} {name}"`

  > 未指定时会根据语言自动选择常见格式（中/日/韩/英）
* 封面相关

  * `-c/--cover FILE`：若合并产物缺失封面则添加
  * `-C/--replace-cover FILE`：无论是否已有封面都强制替换
  * `-S/--extract-cover PATH`：从第一本输入 EPUB 中提取封面到指定路径（自动补齐扩展名）

注意：

* 命令行方式无法在执行后再调整卷顺序，合并顺序完全取决于命令行参数顺序
* 需要自动排序/拖拽调序，建议使用 GUI

### 🧾 合并后目录结构说明

合并后的 EPUB 会包含一个新的基于 `nav.xhtml` 的全书目录，大致结构如下：

```
第1卷 Gamers 01
  ├─ 序章
  ├─ 第一章 …
  └─ …
第2卷 Gamers 02
  ├─ …
第3卷 …
  └─ …
Gamers DLC - 01
  └─ …
```

每一卷的目录解析逻辑：

1. 若存在带 `properties="nav"` 的 `nav.xhtml`：解析原目录并挂载到对应卷标题之下
2. 否则若存在 `toc.ncx`：解析 NCX 生成卷级目录
3. 否则：按 spine 顺序生成「章节 1 / 章节 2 / …」的简单目录

主流阅读器（如 Apple Books、Calibre、KOReader 等）会直接使用这个新目录进行展示。

### ⚠️ 已知限制

* 不进行复杂排版美化或 CSS 统一
  工具目标是“内容完整 + 目录可用”，而不是“重排版发行级样式”
* 对于结构严重不规范或“伪 EPUB”（缺失 `META-INF/container.xml`、缺 OPF、结构损坏等），可能无法成功合并
* 合并后的合订本如果插图很多，体积可能较大，在部分设备上加载会偏慢
* 主要针对普通小说 / 轻小说等线性阅读内容设计
  对教材、多栏排版、重交互类电子书支持有限
* 不处理 DRM / 加密电子书

---

## English Guide

A lightweight EPUB merge tool and GUI for multi-volume light novels. It aims to preserve illustrations and chapter structure while rebuilding a volume-grouped TOC.

### ✨ Features

- Merge multiple `.epub` volumes into a single omnibus
- Preserve each volume's text, images, CSS, and assets
- Support both EPUB 3 `nav.xhtml` and EPUB 2 `toc.ncx`
- Rebuild a global TOC grouped by volume, for example:
  - Volume 1 xxx
    - Prologue
    - Chapter 1 …
  - Volume 2 xxx
    - …
  - Side stories / extras
- Generate a simple chapter list from the spine when an EPUB has no `nav` / `ncx`
- Robust handling of messy EPUB layouts:
  - Normalize `Chapter 1.html` / `Chapter%201.html` path differences
  - Auto-locate `content.opf` (root, `OEBPS/`, `EPUB/`, etc.)
- Two usage modes:
  - Command line for scripted workflows
  - GUI (Qt / PySide6) with drag-and-drop ordering and natural sorting
- Metadata & cover:
  - Author, language, publisher, publish date, ISBN, subject, description
  - Add/replace/extract cover images

### 🚀 Download & Run (No Python required)

Download prebuilt releases from the repository **Releases** page, extract, and run (no Python or dependencies required).

General steps:
1. Open the **Releases** page
2. Download the package for your OS (`.zip` / `.tar.gz`)
3. Extract anywhere
4. Run the app (macOS `.app` or executable; Windows `.exe`)

#### macOS security notice (unsigned apps)

If you see a warning like:
> Apple cannot verify “LightweightEPUBMergeGUI” is free of malware

You can:

**Option A (recommended): Allow once in System Settings**
1. Open **System Settings**
2. **Privacy & Security**
3. Click **Open Anyway** near the blocked app notice

**Option B: Remove quarantine attribute**

In Terminal, inside the extracted folder (replace the path with your app):

```bash
xattr -dr com.apple.quarantine "/path/to/LightweightEPUBMergeGUI.app"
```

Then open the app again.

> Note: This is standard macOS Gatekeeper behavior for unsigned apps. I am not a registered developer, so signing/notarization is not available.

### 🧰 Run from Source (For Developers)

#### Requirements

* Python 3.8+
* CLI: standard library only
* GUI (Qt): requires `PySide6`

#### Install

```bash
git clone https://github.com/yumizhi/lightweight_epub_merge_tool.git
cd lightweight_epub_merge_tool
```

For GUI:

```bash
pip install PySide6
```

> On macOS / Linux with multiple Python versions, make sure `pip` matches the `python3` environment.

### 📌 Usage

Two main entry points:

* `merge_epubs.py` — core merge logic / CLI
* `merge_epubs_gui.py` — GUI (PySide6 / Qt)

> Note: the GUI script must live in the same directory as `merge_epubs.py`.

#### 1) GUI (Recommended): `merge_epubs_gui.py`

Launch:

```bash
python3 merge_epubs_gui.py
```

Key capabilities:

* File list management
  * Drag to reorder volumes
  * Shift / Ctrl / Command multi-select
  * Delete to remove selected items
* Drag `.epub` files directly into the window to add them
* Natural sort by filename
  * Ensures `xxx 2.epub` comes before `xxx 11.epub`
* Metadata & cover controls (in the GUI)
  * Author, language, publisher, publish date, ISBN, subject, description
  * Volume title template (customizable)
  * Cover: add / force replace / extract first volume cover

Use cases:

* Merge a series occasionally without memorizing CLI flags
* Visually reorder volumes
* Manage the merge list like a playlist

#### 2) Command-line: `merge_epubs.py`

Basic usage:

```bash
python3 merge_epubs.py OUTPUT.epub VOL1.epub VOL2.epub VOL3.epub ...
```

Common options (examples):

* Base metadata (override or set)
  `--title` / `--author` / `--language` / `--publisher` / `--published` / `--isbn` / `--subject` / `--description`

  > You can separate multiple authors or subjects with `//`
* Volume title template
  `--volume-label-template "Vol.{n} {name}"`

  > If omitted, a common format is chosen based on language (ZH/JA/KO/EN)
* Cover options

  * `-c/--cover FILE`: add a cover if missing
  * `-C/--replace-cover FILE`: always replace the existing cover
  * `-S/--extract-cover PATH`: extract the first volume cover to a path (auto appends extension)

Notes:

* CLI merge order is exactly the argument order
* For drag-and-drop sorting, use the GUI

### 🧾 TOC & Internal Structure

The merged EPUB will include a new `nav.xhtml` TOC, structured like:

```
Volume 1 Gamers 01
  ├─ Prologue
  ├─ Chapter 1 …
  └─ …
Volume 2 Gamers 02
  ├─ …
Volume 3 …
  └─ …
Gamers DLC - 01
  └─ …
```

Per-volume TOC parsing:

1. If `nav.xhtml` with `properties="nav"` exists: parse and attach it under the volume title
2. Else if `toc.ncx` exists: parse NCX as volume-level TOC
3. Else: create a simple chapter list from the spine

Most readers (Apple Books, Calibre, KOReader, etc.) will show the new TOC.

### ⚠️ Limitations

* No complex typography or CSS normalization
  The goal is “content completeness + usable TOC,” not a polished typeset layout
* Extremely malformed EPUBs may fail to merge (missing `container.xml`, missing OPF, corrupted structure)
* Large merged files (many images) may be slower on some devices
* Designed mainly for linear novels / light novels
  Textbooks, multi-column layouts, and highly interactive ebooks are not the focus
* DRM-protected ebooks are not supported
