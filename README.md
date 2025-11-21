# EPUB_Merge

[![License](https://img.shields.io/github/license/yumizhi/EPUB_Merge)](https://github.com/yumizhi/EPUB_Merge/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/yumizhi/EPUB_Merge?style=social)](https://github.com/yumizhi/EPUB_Merge/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/yumizhi/EPUB_Merge?style=social)](https://github.com/yumizhi/EPUB_Merge/network/members)

> 最近在用Apple books看轻小说，但是找到的epub都是分卷的形式，手机阅读起来有点繁琐，所以写了一个小工具把它们合并成一卷。

一个针对轻小说多卷 EPUB 的合并工具，尽量保留插图、章节结构，并重建按卷分组的目录。

## ✨ 特性（Features）

- 支持一次合并多卷 EPUB 文件，生成单一本“合订本”
- 自动复制每卷的全部资源（文本、插图、CSS 等），不丢插图页
- 同时兼容：
  - EPUB 3 的 `nav.xhtml` 目录
  - EPUB 2 的 `toc.ncx` 目录
- 自动重建**全书目录**：
  - 目录按卷分组，例如：
    - 第1卷 xxx
      - 序章
      - 第一章……
    - 第2卷 xxx
      - …
  - 对原来没有 nav / ncx 的 EPUB，会按 spine 顺序生成简单章节列表
- 兼容不同网站导出的 EPUB：
  - 自动处理 `Chapter 1.html` / `Chapter%201.html` 这类路径差异
  - 自动适配不同 OPF 路径（`content.opf` 在根目录或 `OEBPS/` 等）
- 纯 Python 实现，无第三方依赖，易于修改与扩展

---

## 📦 安装（Installation）

本项目是一个简单的 Python 脚本，无需打包安装，直接 clone 后使用即可。

```bash
git clone https://github.com/yumizhi/EPUB_Merge.git
cd EPUB_Merge
python3 merge_epubs.py [outputs_name] [inputs_name]
