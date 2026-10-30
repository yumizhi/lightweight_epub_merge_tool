from __future__ import annotations

import posixpath
import warnings
import zipfile
from pathlib import Path

from .epub_io import (
    MERGE_MANIFEST_PATH,
    build_flat_nav_html,
    build_opf,
    read_source_book,
    require_manifest,
    write_epub_container,
    write_mimetype_first,
)
from .errors import EpubMergeError, ManifestError
from .models import ManifestItem, TocEntry
from .resources import archive_path, resolve_path, rewrite_references


def split_epub(input_path: Path | str, out_dir: Path | str, *, heuristic: bool = False) -> list[Path]:
    input_path = Path(input_path).expanduser()
    out_dir = Path(out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(input_path, "r") as zf:
            manifest = require_manifest(zf.read(MERGE_MANIFEST_PATH))
            return _split_from_manifest(zf, manifest, out_dir)
    except KeyError as exc:
        if not heuristic:
            raise ManifestError("missing epub-merge-tool manifest; use --heuristic for best-effort split") from exc
    if heuristic:
        warnings.warn("heuristic split is best-effort and not logically lossless", UserWarning, stacklevel=2)
        source = read_source_book(input_path)
        output = out_dir / _safe_title_filename(source.title)
        output.write_bytes(input_path.read_bytes())
        return [output]
    raise EpubMergeError("unreachable split state")


def _split_from_manifest(zf: zipfile.ZipFile, manifest: dict, out_dir: Path) -> list[Path]:
    outputs: list[Path] = []
    for source in manifest["sources"]:
        basename = source["basename"]
        if Path(basename).name != basename or "\\" in basename:
            raise ManifestError("merge record has an unsafe source filename")
        output = out_dir / basename
        items = [
            ManifestItem(
                item_id=file_record["id"],
                href=file_record["href"],
                media_type=file_record["media_type"],
                properties=tuple(prop for prop in file_record.get("properties", []) if prop != "nav"),
            )
            for file_record in source["files"]
        ]
        spine_ids = source["spine"]
        toc_entries = [TocEntry(entry["title"], entry["href"], entry.get("depth", 0)) for entry in source["toc"]]
        spine_hrefs = {
            file_record["href"]: file_record["id"]
            for file_record in source["files"]
            if file_record["id"] in spine_ids
        }
        opf_path = archive_path(source["opf_path"])
        opf_dir = posixpath.dirname(opf_path)
        nav_href = "epub-toolkit-nav.xhtml"
        while any(resolve_path(opf_dir, item.href) == resolve_path(opf_dir, nav_href) for item in items):
            nav_href = "_" + nav_href
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as out:
            write_mimetype_first(out)
            write_epub_container(out, opf_path)
            out.writestr(
                resolve_path(opf_dir, nav_href),
                build_flat_nav_html(
                    source["title"],
                    toc_entries[0].href if toc_entries else "#",
                    toc_entries,
                ),
                compress_type=zipfile.ZIP_DEFLATED,
            )
            out.writestr(
                opf_path,
                build_opf(
                    source["title"],
                    source.get("language") or "en",
                    source.get("creators") or (),
                    items,
                    [spine_hrefs[_href_for_id(source["files"], item_id)] for item_id in spine_ids],
                    nav_href=nav_href,
                    package_metadata=source.get("package_metadata"),
                ),
                compress_type=zipfile.ZIP_DEFLATED,
            )
            rewrites = source.get("rewrites", {})
            for file_record in source["files"]:
                data = zf.read(resolve_path("OEBPS", file_record["merged_href"]))
                reverse = {new: old for old, new in rewrites.get(file_record["href"], {}).items()}
                if reverse:
                    data = rewrite_references(data, file_record["media_type"], lambda href: reverse.get(href, href))
                out.writestr(resolve_path(opf_dir, file_record["href"]), data, compress_type=zipfile.ZIP_DEFLATED)
        outputs.append(output)
    return outputs


def _href_for_id(files: list[dict], item_id: str) -> str:
    for file_record in files:
        if file_record["id"] == item_id:
            return file_record["href"]
    raise EpubMergeError(f"manifest spine references missing file id {item_id!r}")


def _safe_title_filename(title: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {" ", ".", "-", "_"} else "_" for ch in title).strip()
    if not safe:
        safe = "split"
    return f"{safe}.epub"
