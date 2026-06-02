from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class TocEntry:
    title: str
    href: str


@dataclass(frozen=True)
class ManifestItem:
    item_id: str
    href: str
    media_type: str
    properties: tuple[str, ...] = ()


@dataclass(frozen=True)
class SourceBook:
    path: Path
    basename: str
    sha256: str
    opf_path: str
    opf_dir: str
    title: str
    language: str
    creators: tuple[str, ...]
    manifest_items: tuple[ManifestItem, ...]
    spine_ids: tuple[str, ...]
    toc: tuple[TocEntry, ...]
    item_data: dict[str, bytes] = field(repr=False)

    def item_by_id(self, item_id: str) -> ManifestItem:
        for item in self.manifest_items:
            if item.item_id == item_id:
                return item
        raise KeyError(item_id)
