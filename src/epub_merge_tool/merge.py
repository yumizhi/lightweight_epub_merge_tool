from __future__ import annotations

import hashlib
import json
import posixpath
import zipfile
from pathlib import Path

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
    if structure == "flat":
        _reject_duplicate_flat_titles(sources)

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

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as out:
        write_mimetype_first(out)
        write_epub_container(out)

        for source_index, source in enumerate(sources):
            prefix = "" if source_index == 0 else f"v{source_index}/"
            href_map: dict[str, str] = {}
            id_map: dict[str, str] = {}
            file_records: list[dict] = []
            rewrites: dict[str, dict[str, str]] = {}

            for item in source.manifest_items:
                if "nav" in item.properties:
                    continue
                data = source.item_data[item.href]
                preferred_href = f"{prefix}{item.href}"
                output_href = preferred_href
                if _can_pool(item.media_type):
                    digest = hashlib.sha256(data).hexdigest()
                    output_href = resource_pool.setdefault((item.media_type.lower(), digest), preferred_href)
                href_map[item.href] = output_href
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
                            properties=tuple(prop for prop in item.properties if prop != "nav"),
                        )
                    )
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
                if "nav" in item.properties:
                    continue
                data = source.item_data[item.href]
                rewrite_map = _rewrite_map_for_item(item, prefix, href_map)
                if rewrite_map:
                    data = _rewrite_refs(data, rewrite_map)
                    rewrites[item.href] = rewrite_map
                output_href = href_map[item.href]
                zip_name = f"OEBPS/{output_href}"
                if zip_name not in zip_written:
                    out.writestr(zip_name, data, compress_type=zipfile.ZIP_DEFLATED)
                    zip_written.add(zip_name)

            for item_id in source.spine_ids:
                spine_ids.append(id_map[item_id])

            remapped_toc = [
                TocEntry(entry.title, _remap_toc_href(entry.href, href_map)) for entry in source.toc
            ]
            if first_href == "#" and remapped_toc:
                first_href = remapped_toc[0].href
            source_href = remapped_toc[0].href if remapped_toc else "#"
            source_tocs.append((source.title, source_href, remapped_toc))
            flat_toc.extend(remapped_toc)
            manifest_sources.append(
                {
                    "basename": source.basename,
                    "sha256": source.sha256,
                    "title": source.title,
                    "language": source.language,
                    "creators": list(source.creators),
                    "opf_path": source.opf_path,
                    "files": file_records,
                    "spine": list(source.spine_ids),
                    "toc": [{"title": entry.title, "href": entry.href} for entry in source.toc],
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
            build_opf(book_title, language, (), manifest_items, spine_ids),
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


def _reject_duplicate_flat_titles(sources: list[SourceBook]) -> None:
    seen: dict[str, str] = {}
    for source in sources:
        for entry in source.toc:
            key = entry.title.strip()
            if key in seen:
                raise EpubMergeError(
                    f"Duplicate flat chapter title {entry.title!r} in {source.basename} and {seen[key]}"
                )
            seen[key] = source.basename


def _can_pool(media_type: str) -> bool:
    normalized = media_type.lower()
    return normalized.startswith("image/") or normalized in IMAGE_OR_FONT_TYPES


def _rewrite_map_for_item(item: ManifestItem, prefix: str, href_map: dict[str, str]) -> dict[str, str]:
    if not item.media_type.lower().endswith("xhtml+xml"):
        return {}
    mapping: dict[str, str] = {}
    chapter_dir = posixpath.dirname(f"{prefix}{item.href}")
    for original_href, final_href in href_map.items():
        preferred_href = f"{prefix}{original_href}"
        if final_href == preferred_href:
            continue
        relative = posixpath.relpath(final_href, chapter_dir or ".")
        mapping[original_href] = relative
    return mapping


def _rewrite_refs(data: bytes, mapping: dict[str, str]) -> bytes:
    text = data.decode("utf-8")
    for old, new in mapping.items():
        text = text.replace(f'src="{old}"', f'src="{new}"')
        text = text.replace(f"src='{old}'", f"src='{new}'")
        text = text.replace(f'href="{old}"', f'href="{new}"')
        text = text.replace(f"href='{old}'", f"href='{new}'")
    return text.encode("utf-8")


def _remap_toc_href(href: str, href_map: dict[str, str]) -> str:
    base, sep, fragment = href.partition("#")
    mapped = href_map.get(base)
    if mapped is None:
        raise EpubMergeError(f"TOC href {href!r} does not reference a copied manifest item")
    return f"{mapped}{sep}{fragment}" if sep else mapped
