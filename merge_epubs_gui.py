#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import re
import platform
from typing import Optional, Dict
from pathlib import Path

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QLineEdit, QFileDialog, QMessageBox,
    QAbstractItemView, QProgressBar, QFrame, QFormLayout,
    QTreeWidget, QTreeWidgetItem, QStyle, QHeaderView, QSizePolicy,
    QTextEdit, QCheckBox, QDialog, QDialogButtonBox, QSplitter
)
from PySide6.QtCore import Qt, QThread, Signal, QSettings, QUrl, QSize
from PySide6.QtGui import QKeySequence, QShortcut, QFont, QDesktopServices, QIcon, QColor, QPalette, QFontDatabase

# 尝试导入后端
try:
    from merge_epubs import merge_epubs, extract_toc_as_flat_list, extract_cover_image
except ImportError:
    def merge_epubs(*a): pass
    def extract_toc_as_flat_list(p): return []
    def extract_cover_image(p, d): return None

# ==========================================
# 现代化样式表 (QSS)
# ==========================================
MODERN_STYLESHEET = """
/* 全局设定 */
QMainWindow, QWidget#CentralWidget {
    background-color: #F5F7FA; /* 现代冷灰背景 */
}
QLabel {
    color: #333333;
    font-size: 13px;
    font-weight: 500;
}
/* 卡片容器 */
QFrame.Card {
    background-color: #FFFFFF;
    border: 1px solid #E1E4E8;
    border-radius: 10px;
}

/* 按钮通用 */
QPushButton {
    border: 1px solid #D1D5DA;
    border-radius: 6px;
    background-color: #FFFFFF;
    color: #24292E;
    padding: 6px 12px;
    font-weight: 600;
    font-size: 12px;
}
QPushButton:hover {
    background-color: #F3F4F6;
    border-color: #9CA3AF;
}
QPushButton:pressed {
    background-color: #E5E7EB;
}

/* 强调按钮 (蓝色) */
QPushButton.Primary {
    background-color: #007AFF;
    color: #FFFFFF;
    border: 1px solid #007AFF;
    font-size: 14px;
    padding: 10px 20px;
}
QPushButton.Primary:hover {
    background-color: #0069D9;
    border-color: #0062CC;
}
QPushButton.Primary:pressed {
    background-color: #0056B3;
}

/* 危险/警告按钮 */
QPushButton.Danger:hover {
    color: #CF222E;
    border-color: #CF222E;
    background-color: #FFEBE9;
}

/* 输入框 */
QLineEdit {
    background-color: #FFFFFF;
    border: 1px solid #D1D5DA;
    border-radius: 6px;
    padding: 8px;
    color: #24292E;
    selection-background-color: #007AFF;
}
QLineEdit:focus {
    border: 1px solid #007AFF;
    outline: none;
}
QLineEdit:read-only {
    background-color: #F6F8FA;
    color: #6A737D;
}

/* 树形列表 */
QTreeWidget {
    border: none;
    background-color: transparent;
    font-size: 13px;
    outline: none;
}
QTreeWidget::item {
    height: 36px; /* 增加行高，更易点击 */
    padding: 2px;
    border-bottom: 1px solid #F0F0F0;
    color: #333;
}
QTreeWidget::item:selected {
    background-color: #EBF5FF; /* 浅蓝色背景 */
    color: #007AFF;
    border-radius: 4px;
}
QTreeWidget::item:selected:active {
    background-color: #EBF5FF; 
    color: #007AFF;
}
QTreeWidget::item:hover {
    background-color: #FAFAFA;
}

/* 树形列表头部 */
QHeaderView::section {
    background-color: #FFFFFF;
    color: #6A737D;
    padding: 4px 8px;
    border: none;
    border-bottom: 2px solid #E1E4E8;
    font-weight: bold;
    font-size: 11px;
    text-transform: uppercase;
}

/* 进度条 */
QProgressBar {
    border: none;
    background-color: #E1E4E8;
    border-radius: 2px;
    height: 4px;
    text-align: center;
}
QProgressBar::chunk {
    background-color: #007AFF;
    border-radius: 2px;
}

/* 滚动条美化 */
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 8px;
    margin: 0;
}
QScrollBar::handle:vertical {
    background: #C1C1C1;
    min-height: 20px;
    border-radius: 4px;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}
"""

class StrictTreeWidget(QTreeWidget):
    def __init__(self, add_cb, parent=None):
        super().__init__(parent)
        self.add_cb = add_cb
        self.setHeaderLabels(["目录结构 (卷名 -> 章节)  |  双击重命名", "路径"])
        self.setColumnHidden(1, True)
        self.header().setSectionResizeMode(0, QHeaderView.Stretch) # 自适应宽度
        self.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDragDropMode(QAbstractItemView.InternalMove)
        self.setAlternatingRowColors(False)
        self.setRootIsDecorated(True) # 显示展开的小三角
        self.setIndentation(20) # 缩进宽度

    def dragEnterEvent(self, e): 
        if e.mimeData().hasUrls(): e.acceptProposedAction()
        else: super().dragEnterEvent(e)
    def dragMoveEvent(self, e):
        if e.mimeData().hasUrls(): e.acceptProposedAction()
        else: super().dragMoveEvent(e)
    def dropEvent(self, e):
        if e.mimeData().hasUrls():
            self.add_cb([u.toLocalFile() for u in e.mimeData().urls()])
            e.acceptProposedAction()
        else: super().dropEvent(e)

class Worker(QThread):
    fin = Signal(bool, str, str)

    def __init__(
        self,
        out: str,
        data,
        title: Optional[str],
        metadata: Dict[str, Optional[str]],
        volume_label_template: Optional[str],
        cover_path: Optional[Path],
        replace_cover: bool,
    ):
        super().__init__()
        self.out = out
        self.data = data
        self.title = title
        self.metadata = metadata
        self.volume_label_template = volume_label_template
        self.cover_path = cover_path
        self.replace_cover = replace_cover

    def run(self):
        try:
            merge_epubs(
                self.out,
                self.data,
                title=self.title,
                metadata=self.metadata,
                volume_label_template=self.volume_label_template,
                cover=self.cover_path,
                replace_cover=self.replace_cover,
            )
            self.fin.emit(True, "Success", self.out)
        except Exception as e:
            self.fin.emit(False, str(e), "")

class App(QMainWindow):
    def __init__(self):
        super().__init__()
        self.translations = {
            "zh": {
                "window_title": "EPUB Merge",
                "header_title": "书籍列表",
                "tree_header_main": "目录结构 (卷名 -> 章节)  |  双击重命名",
                "tree_header_path": "路径",
                "add_books": "添加书籍",
                "sort_natural": " 自然排序",
                "clear": " 清空",
                "hint": "💡 提示: 拖拽调整顺序，双击修改名称。最终结构: 书名 > 卷名 > 章节",
                "remove_selected": "移除选中",
                "settings_title": "输出与封面",
                "book_title": "书籍标题:",
                "author": "作者:",
                "output_file": "输出文件:",
                "volume_template": "卷标题模板:",
                "cover": "封面:",
                "extract_cover": "提取封面:",
                "detail_unset": "详细信息未设置",
                "detail_set": "已设置详细信息",
                "detail_button": "详细信息…",
                "run_merge": "开始合并",
                "run_merging": "正在合并...",
                "replace_cover": "强制替换已有封面",
                "placeholder_title": "总标题 (例如: 某某合集)",
                "placeholder_author": "作者名 (可选)",
                "placeholder_out": "选择保存位置...",
                "placeholder_volume": "卷标题模板 (如 'Vol.{n} {name}' / '제 {n}권')",
                "placeholder_cover": "封面图片路径 (可选)",
                "placeholder_extract": "提取封面输出路径",
                "placeholder_language": "语言代码 (如 zh / en / ja / ko)",
                "placeholder_publisher": "出版社",
                "placeholder_published": "出版日期 (YYYY-MM-DD)",
                "placeholder_isbn": "ISBN",
                "placeholder_subject": "主题标签，多个用 // 分隔",
                "placeholder_description": "简介 / 书籍描述",
                "browse": "浏览...",
                "choose_cover": "选择封面",
                "extract_browse": "选择…",
                "extract_button": "提取首卷封面",
                "toggle_lang": "English",
                "msg_need_output": "请选择输出路径",
                "msg_cover_missing": "封面路径不存在",
                "msg_success_title": "成功",
                "msg_merge_done": "合并完成！",
                "msg_open_folder": "打开文件夹",
                "msg_close": "关闭",
                "msg_error_title": "错误",
                "msg_hint_title": "提示",
                "msg_add_books": "添加书籍",
                "msg_save_file": "保存文件",
                "msg_choose_cover": "选择封面图片",
                "msg_save_extract": "保存提取封面",
                "msg_need_epub_first": "请先添加至少一本 EPUB 后再提取封面",
                "msg_extract_done": "封面已提取到: {path}",
                "msg_no_cover": "未找到可提取的封面",
                "detail_dialog_title": "详细信息",
                "detail_language": "语言:",
                "detail_publisher": "出版社:",
                "detail_published": "出版日期:",
                "detail_isbn": "ISBN:",
                "detail_subject": "主题/标签:",
                "detail_description": "简介:",
                "auto_title_suffix": " 合集",
                "auto_out_suffix": "_merged",
            },
            "en": {
                "window_title": "EPUB Merge",
                "header_title": "Book List",
                "tree_header_main": "Table of Contents (Volume -> Chapter) | Double-click to rename",
                "tree_header_path": "Path",
                "add_books": "Add Books",
                "sort_natural": " Natural Sort",
                "clear": " Clear",
                "hint": "💡 Tip: Drag to reorder, double-click to rename. Final structure: Book > Volume > Chapter",
                "remove_selected": "Remove Selected",
                "settings_title": "Output & Cover",
                "book_title": "Book Title:",
                "author": "Author:",
                "output_file": "Output File:",
                "volume_template": "Volume Title Template:",
                "cover": "Cover:",
                "extract_cover": "Extract Cover:",
                "detail_unset": "Detail info not set",
                "detail_set": "Detail info set",
                "detail_button": "Details…",
                "run_merge": "Merge",
                "run_merging": "Merging...",
                "replace_cover": "Force replace existing cover",
                "placeholder_title": "Overall title (e.g., Collection)",
                "placeholder_author": "Author name (optional)",
                "placeholder_out": "Choose save location...",
                "placeholder_volume": "Volume template (e.g., 'Vol.{n} {name}')",
                "placeholder_cover": "Cover image path (optional)",
                "placeholder_extract": "Output path for extracted cover",
                "placeholder_language": "Language code (e.g., zh / en / ja / ko)",
                "placeholder_publisher": "Publisher",
                "placeholder_published": "Publish date (YYYY-MM-DD)",
                "placeholder_isbn": "ISBN",
                "placeholder_subject": "Subject tags, separated by //",
                "placeholder_description": "Summary / Book description",
                "browse": "Browse...",
                "choose_cover": "Choose Cover",
                "extract_browse": "Choose…",
                "extract_button": "Extract First Cover",
                "toggle_lang": "中文",
                "msg_need_output": "Please select an output path.",
                "msg_cover_missing": "Cover path does not exist.",
                "msg_success_title": "Success",
                "msg_merge_done": "Merge completed!",
                "msg_open_folder": "Open Folder",
                "msg_close": "Close",
                "msg_error_title": "Error",
                "msg_hint_title": "Notice",
                "msg_add_books": "Add Books",
                "msg_save_file": "Save File",
                "msg_choose_cover": "Choose Cover Image",
                "msg_save_extract": "Save Extracted Cover",
                "msg_need_epub_first": "Please add at least one EPUB before extracting a cover.",
                "msg_extract_done": "Cover extracted to: {path}",
                "msg_no_cover": "No extractable cover found.",
                "detail_dialog_title": "Details",
                "detail_language": "Language:",
                "detail_publisher": "Publisher:",
                "detail_published": "Publish date:",
                "detail_isbn": "ISBN:",
                "detail_subject": "Subject/Tags:",
                "detail_description": "Description:",
                "auto_title_suffix": " Collection",
                "auto_out_suffix": "_merged",
            },
        }
        self.setWindowTitle(self.translations["zh"]["window_title"])
        self.resize(1100, 750)
        self.set = QSettings("MySoft", "EpubMergeModern")
        self.current_lang = self.set.value("ui_lang", "zh")
        if self.current_lang not in self.translations:
            self.current_lang = "zh"
        self.is_merging = False

        # 低频元数据控件（放在弹窗中使用）
        self.in_language = QLineEdit()
        self.in_publisher = QLineEdit()
        self.in_published = QLineEdit()
        self.in_isbn = QLineEdit()
        self.in_subject = QLineEdit()
        self.in_description = QTextEdit()
        self.in_description.setFixedHeight(100)
        
        # 应用样式
        self.setStyleSheet(MODERN_STYLESHEET)
        
        # 中心部件
        main_widget = QWidget()
        main_widget.setObjectName("CentralWidget")
        self.setCentralWidget(main_widget)
        
        # 主布局：垂直，中央使用可伸缩分隔
        main_layout = QVBoxLayout(main_widget)
        main_layout.setContentsMargins(24, 24, 24, 24)
        main_layout.setSpacing(20)

        # ----------------------------------------------------
        # 1. 顶部标题栏 + 工具栏 (Header)
        # ----------------------------------------------------
        header_layout = QHBoxLayout()

        self.title_lbl = QLabel()
        self.title_lbl.setStyleSheet("font-size: 16px; font-weight: 700; color: #1a1a1a;")

        header_layout.addWidget(self.title_lbl)
        header_layout.addStretch()

        # 工具按钮
        self.btn_add = QPushButton()
        self.btn_add.setIcon(self.style().standardIcon(QStyle.SP_FileIcon))

        self.btn_sort = QPushButton()
        self.btn_sort.setIcon(self.style().standardIcon(QStyle.SP_FileDialogListView))

        self.btn_clear = QPushButton()
        self.btn_clear.setProperty("class", "Danger") # 使用 Danger 样式
        self.btn_clear.setIcon(self.style().standardIcon(QStyle.SP_DialogDiscardButton))

        self.btn_lang = QPushButton()
        self.btn_lang.setCursor(Qt.PointingHandCursor)

        header_layout.addWidget(self.btn_add)
        header_layout.addWidget(self.btn_sort)
        header_layout.addWidget(self.btn_clear)
        header_layout.addWidget(self.btn_lang)

        main_layout.addLayout(header_layout)

        # ----------------------------------------------------
        # 2. 列表区域 (Card)
        # ----------------------------------------------------
        tree_card = QFrame()
        tree_card.setProperty("class", "Card")
        tree_layout = QVBoxLayout(tree_card)
        tree_layout.setContentsMargins(10, 10, 10, 10)

        self.tree = StrictTreeWidget(self.add_files)
        self.tree.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        tree_layout.addWidget(self.tree)

        # 删除按钮悬浮在列表下方或集成在右键菜单，这里放在卡片底部
        bottom_tree_layout = QHBoxLayout()
        self.hint_lbl = QLabel()
        self.hint_lbl.setStyleSheet("color: #999; font-size: 12px;")

        self.btn_del = QPushButton()
        self.btn_del.setCursor(Qt.PointingHandCursor)
        self.btn_del.setStyleSheet("border: none; color: #888;")
        self.btn_del.setIcon(self.style().standardIcon(QStyle.SP_TrashIcon))

        bottom_tree_layout.addWidget(self.hint_lbl)
        bottom_tree_layout.addStretch()
        bottom_tree_layout.addWidget(self.btn_del)

        tree_layout.addLayout(bottom_tree_layout)

        tree_card.setMinimumWidth(420)

        # ----------------------------------------------------
        # 3. 设置区域 (Card)
        # ----------------------------------------------------
        settings_card = QFrame()
        settings_card.setProperty("class", "Card")
        settings_layout = QVBoxLayout(settings_card)
        settings_layout.setContentsMargins(20, 20, 20, 20)
        settings_layout.setSpacing(15)
        
        # 标题行
        self.st_title = QLabel()
        self.st_title.setStyleSheet("font-weight: bold; font-size: 14px; margin-bottom: 5px;")
        settings_layout.addWidget(self.st_title)

        # 主要配置：保留高频项
        compact_layout = QVBoxLayout()
        compact_layout.setSpacing(10)

        title_row = QHBoxLayout()
        self.in_title = QLineEdit()
        self.lbl_book_title = QLabel()
        title_row.addWidget(self.lbl_book_title)
        title_row.addWidget(self.in_title)
        compact_layout.addLayout(title_row)

        author_row = QHBoxLayout()
        self.in_author = QLineEdit()
        self.lbl_author = QLabel()
        author_row.addWidget(self.lbl_author)
        author_row.addWidget(self.in_author)
        compact_layout.addLayout(author_row)

        path_row = QHBoxLayout()
        self.in_out = QLineEdit()
        self.in_out.setReadOnly(False)

        self.btn_browse = QPushButton()
        self.btn_browse.setFixedWidth(90)
        self.btn_browse.clicked.connect(self.on_browse)

        self.lbl_output = QLabel()
        path_row.addWidget(self.lbl_output)
        path_row.addWidget(self.in_out)
        path_row.addWidget(self.btn_browse)
        compact_layout.addLayout(path_row)

        vol_row = QHBoxLayout()
        self.in_volume_label = QLineEdit()
        self.lbl_volume = QLabel()
        vol_row.addWidget(self.lbl_volume)
        vol_row.addWidget(self.in_volume_label)
        compact_layout.addLayout(vol_row)

        cover_row = QHBoxLayout()
        self.in_cover = QLineEdit()
        self.btn_cover = QPushButton()
        self.btn_cover.setFixedWidth(90)
        self.btn_cover.clicked.connect(self.on_choose_cover)
        self.lbl_cover = QLabel()
        cover_row.addWidget(self.lbl_cover)
        cover_row.addWidget(self.in_cover)
        cover_row.addWidget(self.btn_cover)
        compact_layout.addLayout(cover_row)

        replace_row = QHBoxLayout()
        self.chk_replace_cover = QCheckBox()
        replace_row.addWidget(self.chk_replace_cover)
        replace_row.addStretch()
        compact_layout.addLayout(replace_row)

        extract_row = QHBoxLayout()
        self.in_extract_dest = QLineEdit()
        self.btn_extract_browse = QPushButton()
        self.btn_extract_browse.setFixedWidth(70)
        self.btn_extract_browse.clicked.connect(self.on_choose_extract_path)
        self.btn_extract = QPushButton()
        self.btn_extract.setFixedWidth(120)
        self.btn_extract.clicked.connect(self.on_extract_cover)
        self.lbl_extract = QLabel()
        extract_row.addWidget(self.lbl_extract)
        extract_row.addWidget(self.in_extract_dest)
        extract_row.addWidget(self.btn_extract_browse)
        extract_row.addWidget(self.btn_extract)
        compact_layout.addLayout(extract_row)

        # 详细信息弹窗入口
        detail_row = QHBoxLayout()
        self.detail_hint = QLabel()
        self.detail_hint.setStyleSheet("color: #666; font-size: 12px;")
        self.btn_detail = QPushButton()
        self.btn_detail.setFixedWidth(110)
        self.btn_detail.clicked.connect(self.open_detail_dialog)
        detail_row.addWidget(self.detail_hint)
        detail_row.addStretch()
        detail_row.addWidget(self.btn_detail)
        compact_layout.addLayout(detail_row)

        settings_layout.addLayout(compact_layout)

        right_panel = QWidget()
        right_panel_layout = QVBoxLayout(right_panel)
        right_panel_layout.setContentsMargins(0, 0, 0, 0)
        right_panel_layout.addWidget(settings_card)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(tree_card)
        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 2)
        splitter.setHandleWidth(10)

        main_layout.addWidget(splitter)

        # ----------------------------------------------------
        # 4. 底部操作栏 (Footer)
        # ----------------------------------------------------
        footer_layout = QHBoxLayout()
        
        # 进度条
        self.progress = QProgressBar()
        self.progress.hide()
        self.progress.setFixedWidth(200)
        
        self.btn_run = QPushButton()
        self.btn_run.setProperty("class", "Primary") # 应用 Primary 样式
        self.btn_run.setCursor(Qt.PointingHandCursor)
        self.btn_run.setMinimumWidth(150)

        footer_layout.addWidget(self.progress)
        footer_layout.addStretch()
        footer_layout.addWidget(self.btn_run)

        main_layout.addLayout(footer_layout)

        # 绑定事件
        self.btn_add.clicked.connect(self.on_add)
        self.btn_sort.clicked.connect(self.on_sort)
        self.btn_del.clicked.connect(self.on_del)
        self.btn_clear.clicked.connect(self.on_clear)
        self.btn_run.clicked.connect(self.on_run)
        self.btn_lang.clicked.connect(self.toggle_language)

        # 快捷键
        QShortcut(QKeySequence.Delete, self.tree, activated=self.on_del)

        self.apply_language()
        self._refresh_detail_hint()

    def t(self, key: str) -> str:
        return self.translations[self.current_lang].get(key, key)

    def apply_language(self):
        self.setWindowTitle(self.t("window_title"))
        self.title_lbl.setText(self.t("header_title"))
        self.tree.setHeaderLabels([self.t("tree_header_main"), self.t("tree_header_path")])
        self.btn_add.setText(self.t("add_books"))
        self.btn_sort.setText(self.t("sort_natural"))
        self.btn_clear.setText(self.t("clear"))
        self.btn_lang.setText(self.t("toggle_lang"))
        self.hint_lbl.setText(self.t("hint"))
        self.btn_del.setText(self.t("remove_selected"))
        self.st_title.setText(self.t("settings_title"))
        self.lbl_book_title.setText(self.t("book_title"))
        self.lbl_author.setText(self.t("author"))
        self.lbl_output.setText(self.t("output_file"))
        self.lbl_volume.setText(self.t("volume_template"))
        self.lbl_cover.setText(self.t("cover"))
        self.lbl_extract.setText(self.t("extract_cover"))
        self.btn_browse.setText(self.t("browse"))
        self.btn_cover.setText(self.t("choose_cover"))
        self.btn_extract_browse.setText(self.t("extract_browse"))
        self.btn_extract.setText(self.t("extract_button"))
        self.btn_detail.setText(self.t("detail_button"))
        self.btn_run.setText(self.t("run_merging") if self.is_merging else self.t("run_merge"))
        self.chk_replace_cover.setText(self.t("replace_cover"))
        self.in_title.setPlaceholderText(self.t("placeholder_title"))
        self.in_author.setPlaceholderText(self.t("placeholder_author"))
        self.in_out.setPlaceholderText(self.t("placeholder_out"))
        self.in_volume_label.setPlaceholderText(self.t("placeholder_volume"))
        self.in_cover.setPlaceholderText(self.t("placeholder_cover"))
        self.in_extract_dest.setPlaceholderText(self.t("placeholder_extract"))
        self.in_language.setPlaceholderText(self.t("placeholder_language"))
        self.in_publisher.setPlaceholderText(self.t("placeholder_publisher"))
        self.in_published.setPlaceholderText(self.t("placeholder_published"))
        self.in_isbn.setPlaceholderText(self.t("placeholder_isbn"))
        self.in_subject.setPlaceholderText(self.t("placeholder_subject"))
        self.in_description.setPlaceholderText(self.t("placeholder_description"))
        self._refresh_detail_hint()

    def toggle_language(self):
        self.current_lang = "en" if self.current_lang == "zh" else "zh"
        self.set.setValue("ui_lang", self.current_lang)
        self.apply_language()

    # -----------------------------------------
    # 逻辑部分 (与之前保持一致)
    # -----------------------------------------
    def add_files(self, paths):
        exist = {self.tree.topLevelItem(i).text(1) for i in range(self.tree.topLevelItemCount())}
        valid = [p for p in paths if p.lower().endswith(".epub") and p not in exist]
        valid.sort(key=lambda x: [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', Path(x).name)])
        
        for p in valid:
            path = Path(p)
            # Level 1 (Volume) - 字体加粗颜色深
            root = QTreeWidgetItem([path.stem, str(path)])
            root.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable | Qt.ItemIsEditable | Qt.ItemIsDragEnabled)
            root.setIcon(0, self.style().standardIcon(QStyle.SP_DirIcon))
            self.tree.addTopLevelItem(root)
            
            # Level 2 (Chapters)
            toc = extract_toc_as_flat_list(str(path))
            for item in toc:
                child = QTreeWidgetItem([item['title'], ""])
                child.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable | Qt.ItemIsEditable)
                # 章节用一个小点或者空图标，靠缩进区分
                root.addChild(child)
                
            root.setExpanded(False)
            
        if valid and not self.in_title.text():
            name = self.tree.topLevelItem(0).text(0)
            clean = re.sub(r'^\d+[\.\-_ ]+', '', name)
            self.in_title.setText(clean + self.t("auto_title_suffix"))
            if not self.in_out.text():
                self.in_out.setText(str(Path(valid[0]).parent / f"{clean}{self.t('auto_out_suffix')}.epub"))

    def on_run(self):
        if self.tree.topLevelItemCount() == 0: return
        if not self.in_out.text():
            return QMessageBox.warning(self, self.t("msg_hint_title"), self.t("msg_need_output"))

        cover_path = None
        if self.in_cover.text().strip():
            cover_path = Path(self.in_cover.text().strip()).expanduser()
            if not cover_path.exists():
                return QMessageBox.warning(self, self.t("msg_hint_title"), self.t("msg_cover_missing"))

        data = []
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            vol_item = root.child(i)
            chap_names = [vol_item.child(k).text(0) for k in range(vol_item.childCount())]
            data.append((vol_item.text(1), vol_item.text(0), chap_names))

        metadata = {
            "author": self.in_author.text().strip() or None,
            "language": self.in_language.text().strip() or None,
            "publisher": self.in_publisher.text().strip() or None,
            "published": self.in_published.text().strip() or None,
            "isbn": self.in_isbn.text().strip() or None,
            "subject": self.in_subject.text().strip() or None,
            "description": self.in_description.toPlainText().strip() or None,
        }

        vol_template = self.in_volume_label.text().strip() or None

        self.setEnabled(False)
        self.progress.show()
        self.progress.setRange(0, 0) # 忙碌动画
        self.is_merging = True
        self.btn_run.setText(self.t("run_merging"))

        self.wk = Worker(
            self.in_out.text(),
            data,
            self.in_title.text().strip() or None,
            metadata,
            vol_template,
            cover_path,
            self.chk_replace_cover.isChecked(),
        )
        self.wk.fin.connect(self.on_fin)
        self.wk.start()

    def on_fin(self, ok, msg, p):
        self.setEnabled(True)
        self.progress.hide()
        self.is_merging = False
        self.btn_run.setText(self.t("run_merge"))
        if ok:
            box = QMessageBox(self)
            box.setWindowTitle(self.t("msg_success_title"))
            box.setText(self.t("msg_merge_done"))
            box.setIcon(QMessageBox.Information)
            op = box.addButton(self.t("msg_open_folder"), QMessageBox.ActionRole)
            box.addButton(self.t("msg_close"), QMessageBox.AcceptRole)
            box.exec()
            if box.clickedButton() == op:
                QDesktopServices.openUrl(QUrl.fromLocalFile(str(Path(p).parent)))
        else:
            QMessageBox.critical(self, self.t("msg_error_title"), msg)

    def on_add(self):
        d = self.set.value("last", "")
        f, _ = QFileDialog.getOpenFileNames(self, self.t("msg_add_books"), d, "EPUB Files (*.epub)")
        if f: 
            self.set.setValue("last", str(Path(f[0]).parent))
            self.add_files(f)
            
    def on_sort(self):
        items = [self.tree.takeTopLevelItem(0) for _ in range(self.tree.topLevelItemCount())]
        items.sort(key=lambda x: [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', x.text(0))])
        for i in items: self.tree.addTopLevelItem(i)

    def on_del(self):
        for i in self.tree.selectedItems():
            if i.parent() is None: (i.parent() or self.tree.invisibleRootItem()).removeChild(i)
            
    def on_clear(self): self.tree.clear()

    def on_browse(self):
        f, _ = QFileDialog.getSaveFileName(self, self.t("msg_save_file"), self.in_out.text(), "EPUB Files (*.epub)")
        if f: self.in_out.setText(f)

    def on_choose_cover(self):
        f, _ = QFileDialog.getOpenFileName(self, self.t("msg_choose_cover"), str(Path(self.in_cover.text()).expanduser()), "Images (*.png *.jpg *.jpeg *.webp *.gif)")
        if f:
            self.in_cover.setText(f)

    def on_choose_extract_path(self):
        f, _ = QFileDialog.getSaveFileName(self, self.t("msg_save_extract"), self.in_extract_dest.text(), "Images (*.png *.jpg *.jpeg *.webp *.gif)")
        if f:
            self.in_extract_dest.setText(f)

    def on_extract_cover(self):
        if self.tree.topLevelItemCount() == 0:
            return QMessageBox.information(self, self.t("msg_hint_title"), self.t("msg_need_epub_first"))

        dest = self.in_extract_dest.text().strip()
        if not dest:
            f, _ = QFileDialog.getSaveFileName(self, self.t("msg_save_extract"), "", "Images (*.png *.jpg *.jpeg *.webp *.gif)")
            if not f:
                return
            dest = f
            self.in_extract_dest.setText(dest)

        first_path = Path(self.tree.topLevelItem(0).text(1))
        extracted = extract_cover_image(first_path, Path(dest))
        if extracted:
            QMessageBox.information(self, self.t("msg_success_title"), self.t("msg_extract_done").format(path=extracted))
            self.in_extract_dest.setText(str(extracted))
        else:
            QMessageBox.warning(self, self.t("msg_hint_title"), self.t("msg_no_cover"))

    def open_detail_dialog(self):
        dlg = QDialog(self)
        dlg.setWindowTitle(self.t("detail_dialog_title"))
        dlg.setModal(True)

        layout = QVBoxLayout(dlg)
        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignRight)
        form.setSpacing(12)

        lang = QLineEdit(self.in_language.text())
        publisher = QLineEdit(self.in_publisher.text())
        published = QLineEdit(self.in_published.text())
        isbn = QLineEdit(self.in_isbn.text())
        subject = QLineEdit(self.in_subject.text())
        desc = QTextEdit()
        desc.setPlainText(self.in_description.toPlainText())
        desc.setFixedHeight(90)

        form.addRow(self.t("detail_language"), lang)
        form.addRow(self.t("detail_publisher"), publisher)
        form.addRow(self.t("detail_published"), published)
        form.addRow(self.t("detail_isbn"), isbn)
        form.addRow(self.t("detail_subject"), subject)
        form.addRow(self.t("detail_description"), desc)

        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(dlg.accept)
        buttons.rejected.connect(dlg.reject)
        layout.addWidget(buttons)

        if dlg.exec() == QDialog.Accepted:
            self.in_language.setText(lang.text().strip())
            self.in_publisher.setText(publisher.text().strip())
            self.in_published.setText(published.text().strip())
            self.in_isbn.setText(isbn.text().strip())
            self.in_subject.setText(subject.text().strip())
            self.in_description.setPlainText(desc.toPlainText().strip())
            self._refresh_detail_hint()

    def _refresh_detail_hint(self):
        has_detail = any([
            self.in_language.text().strip(),
            self.in_publisher.text().strip(),
            self.in_published.text().strip(),
            self.in_isbn.text().strip(),
            self.in_subject.text().strip(),
            self.in_description.toPlainText().strip(),
        ])
        if has_detail:
            self.detail_hint.setText(self.t("detail_set"))
            self.detail_hint.setStyleSheet("color: #007AFF; font-size: 12px;")
        else:
            self.detail_hint.setText(self.t("detail_unset"))
            self.detail_hint.setStyleSheet("color: #666; font-size: 12px;")

if __name__ == "__main__":

    app = QApplication(sys.argv)
    
    # 设置全局字体
    font = QFontDatabase.systemFont(QFontDatabase.SystemFont.GeneralFont)
    font.setPointSize(13 if platform.system() == "Darwin" else 10)
    app.setFont(font)
    
    w = App()
    w.show()
    sys.exit(app.exec())
