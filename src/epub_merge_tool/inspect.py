from __future__ import annotations
import zipfile
from pathlib import Path
from .epub_io import MERGE_MANIFEST_PATH, read_source_book, require_manifest


def inspect_epub(path: Path | str) -> dict:
    book = read_source_book(Path(path))
    with zipfile.ZipFile(Path(path).expanduser(), "r") as zf:
        manifest = require_manifest(zf.read(MERGE_MANIFEST_PATH)) if MERGE_MANIFEST_PATH in zf.namelist() else None
    return {
        "tool_generated": manifest is not None,
        "schema": manifest["schema"] if manifest else None,
        "structure": manifest["structure"] if manifest else "original",
        "title": book.title,
        "language": book.language,
        "creators": list(book.creators),
        "opf_path": book.opf_path,
        "resources": len(book.manifest_items),
        "spine": [book.item_by_id(item_id).href for item_id in book.spine_ids],
        "toc": [{"title": entry.title, "href": entry.href, "depth": entry.depth} for entry in book.toc],
        "sources": [source["basename"] for source in manifest["sources"]] if manifest else [],
    }
