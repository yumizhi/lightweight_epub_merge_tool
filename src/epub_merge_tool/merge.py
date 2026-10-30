from __future__ import annotations

import hashlib
import json
import posixpath
import zipfile
from pathlib import Path
from urllib.parse import quote, unquote

from . import __version__
from .epub_io import (
    MERGE_MANIFEST_PATH,
    build_flat_nav_html,
    build_nav_html,
    build_opf,
    read_source_book,
    safe_basename,
    write_epub_container,
    write_mimetype_first,
)
from .errors import EpubMergeError
from .models import ManifestItem, SourceBook, TocEntry
from .ordering import sort_sources
from .resources import resolve_path, remap_reference, rewrite_references


IMAGE_OR_FONT_TYPES = {
    "font/ttf",
    "font/otf",
    "font/woff",
    "font/woff2",
    "application/font-sfnt",
    "application/font-woff",
    "application/vnd.ms-opentype",
    "application/x-font-ttf",
    "application/x-font-opentype",
    "application/x-font-truetype",
}


def merge_epubs(
    output_path: Path | str,
    input_paths: list[Path | str],
    *,
    title: str | None = None,
    structure: str = "volume",
    input_order: bool = False,
) -> Path:
    if structure not in {"volume", "flat"}:
        raise EpubMergeError("structure must be 'volume' or 'flat'")
    if not input_paths:
        raise EpubMergeError("At least one input EPUB is required")

    sources = [read_source_book(Path(path)) for path in input_paths]
    _reject_duplicate_basenames(sources)
    if not input_order:
        sources = sort_sources(sources)

    output = Path(output_path).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    book_title = title or output.stem
    language = sources[0].language if sources else "en"

    manifest_items: list[ManifestItem] = []
    spine_ids: list[str] = []
    manifest_sources: list[dict] = []
    resource_pool: dict[tuple[str, str], str] = {}
    manifest_href_ids: dict[str, str] = {}
    zip_written: set[str] = set()
    source_tocs: list[tuple[str, str, list[TocEntry]]] = []
    flat_toc: list[TocEntry] = []
    first_href = "#"
    has_cover = False

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as out:
        write_mimetype_first(out)
        write_epub_container(out)

        for source_index, source in enumerate(sources):
            prefix = f"v{source_index + 1}/"
            href_map: dict[str, str] = {}
            id_map: dict[str, str] = {}
            file_records: list[dict] = []
            rewrites: dict[str, dict[str, str]] = {}

            for item in source.manifest_items:
                if item.media_type == "application/x-dtbncx+xml":
                    continue
                data = source.item_data[item.href]
                preferred_href = quote(f"{prefix}{resolve_path(source.opf_dir, item.href)}", safe="/")
                output_href = preferred_href
                if _can_pool(item.media_type):
                    digest = hashlib.sha256(data).hexdigest()
                    output_href = resource_pool.setdefault((item.media_type.lower(), digest), preferred_href)
                href_map[resolve_path(source.opf_dir, item.href)] = output_href
                new_id = f"s{source_index}_{item.item_id}"
                owner_id = manifest_href_ids.get(output_href)
                if owner_id is None:
                    manifest_href_ids[output_href] = new_id
                    owner_id = new_id
                    manifest_items.append(
                        ManifestItem(
                            item_id=new_id,
                            href=output_href,
                            media_type=item.media_type,
                            properties=tuple(prop for prop in item.properties if prop != "nav" and (prop != "cover-image" or not has_cover)),
                        )
                    )
                if "cover-image" in item.properties and not has_cover:
                    for owner_index, owner in enumerate(manifest_items):
                        if owner.href == output_href and "cover-image" not in owner.properties:
                            manifest_items[owner_index] = ManifestItem(owner.item_id, owner.href, owner.media_type, (*owner.properties, "cover-image"))
                            break
                    has_cover = True
                id_map[item.item_id] = owner_id
                file_records.append(
                    {
                        "id": item.item_id,
                        "href": item.href,
                        "media_type": item.media_type,
                        "properties": list(item.properties),
                        "merged_href": output_href,
                    }
                )

            for item in source.manifest_items:
                if item.media_type == "application/x-dtbncx+xml":
                    continue
                data = source.item_data[item.href]
                source_path = resolve_path(source.opf_dir, item.href)
                output_href = href_map[source_path]
                rewrite_map = {}
                def rewrite(href):
                    result = remap_reference(href, source_path, unquote(output_href), href_map)
                    if result != href:
                        rewrite_map[href] = result
                    return result
                data = rewrite_references(data, item.media_type, rewrite)
                if rewrite_map:
                    rewrites[item.href] = rewrite_map
                zip_name = f"OEBPS/{unquote(output_href)}"
                if zip_name not in zip_written:
                    out.writestr(zip_name, data, compress_type=zipfile.ZIP_DEFLATED)
                    zip_written.add(zip_name)

            for item_id in source.spine_ids:
                spine_ids.append(id_map[item_id])

            remapped_toc = [
                TocEntry(entry.title, remap_reference(entry.href, source.opf_path, "nav-merged.xhtml", href_map), entry.depth) for entry in source.toc
            ]
            source_href = next((entry.href for entry in remapped_toc if entry.href), "#")
            if first_href == "#":
                first_href = source_href
            source_tocs.append((source.title, source_href, remapped_toc))
            flat_toc.extend(TocEntry(entry.title, entry.href) for entry in remapped_toc if entry.href)
            manifest_sources.append(
                {
                    "basename": source.basename,
                    "sha256": source.sha256,
                    "title": source.title,
                    "language": source.language,
                    "creators": list(source.creators),
                    "opf_path": source.opf_path,
                    "package_metadata": source.package_metadata,
                    "files": file_records,
                    "spine": list(source.spine_ids),
                    "toc": [{"title": entry.title, "href": entry.href, "depth": entry.depth} for entry in source.toc],
                    "rewrites": rewrites,
                }
            )

        if structure == "flat":
            nav = build_flat_nav_html(book_title, first_href, flat_toc)
        else:
            nav = build_nav_html(book_title, first_href, source_tocs)
        out.writestr("OEBPS/nav-merged.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        out.writestr(
            "OEBPS/content.opf",
            build_opf(book_title, language, dict.fromkeys(creator for source in sources for creator in source.creators), manifest_items, spine_ids, package_metadata={"pageProgressionDirection": sources[0].package_metadata.get("pageProgressionDirection"), "spine": [item for source in sources for item in source.package_metadata.get("spine", [])]}),
            compress_type=zipfile.ZIP_DEFLATED,
        )
        manifest = {
            "schema": "epub-merge-tool/v1",
            "tool_version": __version__,
            "structure": structure,
            "title": book_title,
            "language": language,
            "sources": manifest_sources,
        }
        out.writestr(
            MERGE_MANIFEST_PATH,
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            compress_type=zipfile.ZIP_DEFLATED,
        )
    return output


def _reject_duplicate_basenames(sources: list[SourceBook]) -> None:
    seen: set[str] = set()
    for source in sources:
        basename = safe_basename(source.path)
        if basename in seen:
            raise EpubMergeError(f"Duplicate source basename: {basename}")
        seen.add(basename)


def _can_pool(media_type: str) -> bool:
    normalized = media_type.lower()
    return (normalized.startswith("image/") and normalized != "image/svg+xml") or normalized in IMAGE_OR_FONT_TYPES
