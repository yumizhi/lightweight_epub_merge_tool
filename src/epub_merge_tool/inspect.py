from __future__ import annotations

import zipfile
from pathlib import Path

from .epub_io import MERGE_MANIFEST_PATH, require_manifest
from .errors import ManifestError


def inspect_epub(path: Path | str) -> dict:
    with zipfile.ZipFile(Path(path).expanduser(), "r") as zf:
        try:
            manifest = require_manifest(zf.read(MERGE_MANIFEST_PATH))
        except KeyError as exc:
            raise ManifestError("missing epub-merge-tool manifest") from exc
    return {
        "tool_generated": True,
        "schema": manifest["schema"],
        "structure": manifest["structure"],
        "title": manifest["title"],
        "sources": [source["basename"] for source in manifest["sources"]],
    }
