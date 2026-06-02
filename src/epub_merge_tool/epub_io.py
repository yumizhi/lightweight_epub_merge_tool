from __future__ import annotations

import hashlib
import mimetypes
import posixpath
import zipfile
from pathlib import Path, PurePosixPath
from typing import Iterable
import xml.etree.ElementTree as ET

from .errors import InvalidEpubError, ManifestError
from .models import ManifestItem, SourceBook, TocEntry


OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"
CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_MIMETYPE = "application/epub+zip"
MERGE_MANIFEST_PATH = "META-INF/epub-merge-tool.json"
NS = {"opf": OPF_NS, "dc": DC_NS, "c": CONTAINER_NS, "xhtml": XHTML_NS}

ET.register_namespace("", OPF_NS)
ET.register_namespace("dc", DC_NS)


def safe_basename(path: Path) -> str:
    name = path.name
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise InvalidEpubError(f"Unsafe source basename: {name!r}")
    if PurePosixPath(name).name != name:
        raise InvalidEpubError(f"Unsafe source basename: {name!r}")
    return name


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_source_book(path: Path) -> SourceBook:
    path = Path(path).expanduser()
    if not path.exists():
        raise InvalidEpubError(f"Input file not found: {path}")
    basename = safe_basename(path)
    try:
        with zipfile.ZipFile(path, "r") as zf:
            opf_path = _read_opf_path(zf)
            opf_dir = str(PurePosixPath(opf_path).parent)
            if opf_dir == ".":
                opf_dir = ""
            opf_root = _parse_xml(zf.read(opf_path), f"{basename}:{opf_path}")
            manifest = _required(opf_root.find("opf:manifest", NS), f"{basename}: missing manifest")
            spine = _required(opf_root.find("opf:spine", NS), f"{basename}: missing spine")

            title = _text(opf_root.find(".//dc:title", NS)) or path.stem
            language = _text(opf_root.find(".//dc:language", NS)) or "en"
            creators = tuple(
                text for node in opf_root.findall(".//dc:creator", NS) if (text := _text(node))
            )

            items: list[ManifestItem] = []
            item_data: dict[str, bytes] = {}
            id_to_item: dict[str, ManifestItem] = {}
            for idx, node in enumerate(manifest.findall("opf:item", NS)):
                item_id = node.get("id") or f"item{idx}"
                href = _required_attr(node, "href", f"{basename}: manifest item missing href")
                media_type = node.get("media-type") or mimetypes.guess_type(href)[0]
                if not media_type:
                    raise InvalidEpubError(f"{basename}: manifest item {href!r} missing media-type")
                properties = tuple((node.get("properties") or "").split())
                item = ManifestItem(item_id, href, media_type, properties)
                items.append(item)
                id_to_item[item_id] = item
                item_data[href] = _read_member(zf, _join_opf(opf_dir, href), basename)

            spine_ids: list[str] = []
            for node in spine.findall("opf:itemref", NS):
                idref = _required_attr(node, "idref", f"{basename}: spine item missing idref")
                if idref not in id_to_item:
                    raise InvalidEpubError(f"{basename}: spine references missing manifest id {idref!r}")
                spine_ids.append(idref)
            if not spine_ids:
                raise InvalidEpubError(f"{basename}: spine is empty")

            toc = _read_toc(zf, opf_dir, items, spine_ids, id_to_item, spine, basename)
    except zipfile.BadZipFile as exc:
        raise InvalidEpubError(f"Invalid EPUB zip: {path}") from exc

    return SourceBook(
        path=path,
        basename=basename,
        sha256=sha256_file(path),
        opf_path=opf_path,
        opf_dir=opf_dir,
        title=title,
        language=language,
        creators=creators,
        manifest_items=tuple(items),
        spine_ids=tuple(spine_ids),
        toc=tuple(toc),
        item_data=item_data,
    )


def write_epub_container(zf: zipfile.ZipFile, opf_path: str = "OEBPS/content.opf") -> None:
    zf.writestr(
        "META-INF/container.xml",
        f"""<?xml version="1.0"?>
<container version="1.0" xmlns="{CONTAINER_NS}">
  <rootfiles>
    <rootfile full-path="{opf_path}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
""",
        compress_type=zipfile.ZIP_DEFLATED,
    )


def write_mimetype_first(zf: zipfile.ZipFile) -> None:
    zf.writestr("mimetype", EPUB_MIMETYPE, compress_type=zipfile.ZIP_STORED)


def build_nav_html(book_title: str, book_href: str, children: Iterable[tuple[str, str, list[TocEntry]]]) -> bytes:
    html = ET.Element("html", {"xmlns": XHTML_NS, "xmlns:epub": "http://www.idpf.org/2007/ops"})
    head = ET.SubElement(html, "head")
    ET.SubElement(head, "title").text = book_title
    body = ET.SubElement(html, "body")
    nav = ET.SubElement(body, "nav", {"epub:type": "toc", "id": "toc"})
    root_ol = ET.SubElement(nav, "ol")
    root_li = ET.SubElement(root_ol, "li")
    ET.SubElement(root_li, "a", {"href": book_href}).text = book_title
    nested = ET.SubElement(root_li, "ol")
    for title, href, entries in children:
        li = ET.SubElement(nested, "li")
        ET.SubElement(li, "a", {"href": href}).text = title
        if entries:
            ol = ET.SubElement(li, "ol")
            for entry in entries:
                child = ET.SubElement(ol, "li")
                ET.SubElement(child, "a", {"href": entry.href}).text = entry.title
    return ET.tostring(html, encoding="utf-8", xml_declaration=True)


def build_flat_nav_html(book_title: str, book_href: str, entries: Iterable[TocEntry]) -> bytes:
    html = ET.Element("html", {"xmlns": XHTML_NS, "xmlns:epub": "http://www.idpf.org/2007/ops"})
    head = ET.SubElement(html, "head")
    ET.SubElement(head, "title").text = book_title
    body = ET.SubElement(html, "body")
    nav = ET.SubElement(body, "nav", {"epub:type": "toc", "id": "toc"})
    root_ol = ET.SubElement(nav, "ol")
    root_li = ET.SubElement(root_ol, "li")
    ET.SubElement(root_li, "a", {"href": book_href}).text = book_title
    nested = ET.SubElement(root_li, "ol")
    for entry in entries:
        li = ET.SubElement(nested, "li")
        ET.SubElement(li, "a", {"href": entry.href}).text = entry.title
    return ET.tostring(html, encoding="utf-8", xml_declaration=True)


def build_opf(
    title: str,
    language: str,
    creators: Iterable[str],
    manifest_items: Iterable[ManifestItem],
    spine_item_ids: Iterable[str],
    nav_href: str = "nav-merged.xhtml",
) -> bytes:
    pkg = ET.Element(f"{{{OPF_NS}}}package", {"version": "3.0", "unique-identifier": "bookid"})
    metadata = ET.SubElement(pkg, f"{{{OPF_NS}}}metadata")
    ET.SubElement(metadata, f"{{{DC_NS}}}identifier", {"id": "bookid"}).text = f"urn:epub-merge:{title}"
    ET.SubElement(metadata, f"{{{DC_NS}}}title").text = title
    ET.SubElement(metadata, f"{{{DC_NS}}}language").text = language
    for creator in creators:
        ET.SubElement(metadata, f"{{{DC_NS}}}creator").text = creator
    manifest = ET.SubElement(pkg, f"{{{OPF_NS}}}manifest")
    ET.SubElement(
        manifest,
        f"{{{OPF_NS}}}item",
        {
            "id": "nav",
            "href": nav_href,
            "media-type": "application/xhtml+xml",
            "properties": "nav",
        },
    )
    for item in manifest_items:
        attrs = {"id": item.item_id, "href": item.href, "media-type": item.media_type}
        props = tuple(prop for prop in item.properties if prop != "nav")
        if props:
            attrs["properties"] = " ".join(props)
        ET.SubElement(manifest, f"{{{OPF_NS}}}item", attrs)
    spine = ET.SubElement(pkg, f"{{{OPF_NS}}}spine")
    for item_id in spine_item_ids:
        ET.SubElement(spine, f"{{{OPF_NS}}}itemref", {"idref": item_id})
    return ET.tostring(pkg, encoding="utf-8", xml_declaration=True)


def require_manifest(data: bytes) -> dict:
    import json

    try:
        manifest = json.loads(data)
    except json.JSONDecodeError as exc:
        raise ManifestError("invalid epub-merge-tool manifest JSON") from exc
    if manifest.get("schema") != "epub-merge-tool/v1":
        raise ManifestError("unsupported epub-merge-tool manifest schema")
    return manifest


def _read_opf_path(zf: zipfile.ZipFile) -> str:
    try:
        root = _parse_xml(zf.read("META-INF/container.xml"), "META-INF/container.xml")
    except KeyError as exc:
        raise InvalidEpubError("missing META-INF/container.xml") from exc
    node = root.find(".//c:rootfile", NS)
    if node is None:
        raise InvalidEpubError("missing rootfile in container.xml")
    return _required_attr(node, "full-path", "rootfile missing full-path")


def _read_toc(
    zf: zipfile.ZipFile,
    opf_dir: str,
    items: list[ManifestItem],
    spine_ids: list[str],
    id_to_item: dict[str, ManifestItem],
    spine_node: ET.Element,
    basename: str,
) -> list[TocEntry]:
    nav_item = next((item for item in items if "nav" in item.properties), None)
    if nav_item is not None:
        nav_data = _read_member(zf, _join_opf(opf_dir, nav_item.href), basename)
        return _parse_nav(nav_data, basename)
    ncx_item = _find_ncx_item(items, spine_node)
    if ncx_item is not None:
        ncx_data = _read_member(zf, _join_opf(opf_dir, ncx_item.href), basename)
        return _parse_ncx(ncx_data, basename)
    toc: list[TocEntry] = []
    for index, item_id in enumerate(spine_ids, start=1):
        item = id_to_item[item_id]
        toc.append(TocEntry(f"Chapter {index}", item.href))
    return toc


def _find_ncx_item(items: list[ManifestItem], spine_node: ET.Element) -> ManifestItem | None:
    toc_id = spine_node.get("toc")
    if toc_id:
        for item in items:
            if item.item_id == toc_id:
                return item
        raise InvalidEpubError(f"spine references missing NCX item {toc_id!r}")
    for item in items:
        if item.media_type == "application/x-dtbncx+xml" or item.href.lower().endswith(".ncx"):
            return item
    return None


def _parse_nav(data: bytes, basename: str) -> list[TocEntry]:
    root = _parse_xml(data, f"{basename}:nav")
    toc_node = None
    for node in root.iter():
        if _local_name(node.tag) == "nav" and "toc" in (node.get(f"{{http://www.idpf.org/2007/ops}}type") or node.get("epub:type") or node.get("type") or ""):
            toc_node = node
            break
    if toc_node is None:
        for node in root.iter():
            if _local_name(node.tag) == "nav":
                toc_node = node
                break
    if toc_node is None:
        raise InvalidEpubError(f"{basename}: nav file has no nav element")
    entries = []
    for node in toc_node.iter():
        if _local_name(node.tag) == "a":
            href = node.get("href")
            title = "".join(node.itertext()).strip()
            if href and title:
                entries.append(TocEntry(title, href))
    if not entries:
        raise InvalidEpubError(f"{basename}: nav file has no TOC links")
    return entries


def _parse_ncx(data: bytes, basename: str) -> list[TocEntry]:
    root = _parse_xml(data, f"{basename}:toc.ncx")
    entries: list[TocEntry] = []
    for node in root.iter():
        if _local_name(node.tag) != "navPoint":
            continue
        title = ""
        href = ""
        for child in node.iter():
            if _local_name(child.tag) == "text" and child.text:
                title = child.text.strip()
                break
        for child in node.iter():
            if _local_name(child.tag) == "content" and child.get("src"):
                href = child.get("src") or ""
                break
        if title and href:
            entries.append(TocEntry(title, href))
    if not entries:
        raise InvalidEpubError(f"{basename}: toc.ncx has no navPoint entries")
    return entries


def _read_member(zf: zipfile.ZipFile, name: str, basename: str) -> bytes:
    try:
        return zf.read(name)
    except KeyError as exc:
        raise InvalidEpubError(f"{basename}: missing zip member {name!r}") from exc


def _join_opf(opf_dir: str, href: str) -> str:
    return posixpath.normpath(posixpath.join(opf_dir, href)) if opf_dir else href


def _parse_xml(data: bytes, label: str) -> ET.Element:
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise InvalidEpubError(f"invalid XML in {label}") from exc


def _required(value, message: str):
    if value is None:
        raise InvalidEpubError(message)
    return value


def _required_attr(node: ET.Element, name: str, message: str) -> str:
    value = node.get(name)
    if not value:
        raise InvalidEpubError(message)
    return value


def _text(node: ET.Element | None) -> str | None:
    if node is None or node.text is None:
        return None
    value = node.text.strip()
    return value or None


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag
