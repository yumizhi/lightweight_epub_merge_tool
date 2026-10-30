"""EPUB-relative URI handling shared by merge and split."""
from __future__ import annotations

import html
import posixpath
import re
from urllib.parse import quote, unquote
from .errors import InvalidEpubError


def is_external(href: str) -> bool:
    return bool(re.match(r"^(?:[a-z][a-z\d+.-]*:|//)", href, re.I))


def resolve_path(base: str, href: str) -> str:
    path = unquote(re.split(r"[?#]", href, maxsplit=1)[0])
    if is_external(href) or path.startswith("/"):
        raise InvalidEpubError(f"Unsupported resource path: {href}")
    parts: list[str] = []
    for part in f"{base}/{path}".split("/"):
        if part in {"", "."}:
            continue
        if part == "..":
            if not parts:
                raise InvalidEpubError(f"Resource path escapes the EPUB: {href}")
            parts.pop()
        else:
            parts.append(part)
    return "/".join(parts)


def remap_reference(href: str, source_path: str, output_path: str, paths: dict[str, str]) -> str:
    if not href or href.startswith("#") or is_external(href):
        return href
    target = resolve_path(posixpath.dirname(source_path), href)
    if target not in paths:
        raise InvalidEpubError(f"{source_path}: reference points to a missing resource: {href}")
    suffix = re.search(r"[?#].*$", href)
    relative = posixpath.relpath(unquote(paths[target]), posixpath.dirname(output_path) or ".")
    return quote(relative, safe="/") + (suffix.group() if suffix else "")


def _css(text: str, rewrite) -> str:
    return "".join(part if index % 2 else _css_urls(part, rewrite)
                   for index, part in enumerate(re.split(r"(/\*[\s\S]*?\*/)", text)))


def _css_urls(text: str, rewrite) -> str:
    def url(match):
        href = next(value for value in match.groups() if value is not None)
        return f'url("{rewrite(href)}")'
    text = re.sub(r'''url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]*))\s*\)''', url, text, flags=re.I)
    return re.sub(r'''(@import\s+)(["'])(.*?)\2''', lambda m: m[1] + m[2] + rewrite(m[3]) + m[2], text, flags=re.I)


def rewrite_references(data: bytes, media_type: str, rewrite) -> bytes:
    if media_type == "text/css":
        return _css(data.decode("utf-8"), rewrite).encode("utf-8")
    if not re.search("xhtml|svg|html|xml", media_type):
        return data
    def attribute(match):
        prefix, delimiter, original = match.groups()
        value = html.unescape(original)
        if re.search(r"style\s*=", prefix, re.I):
            result = _css(value, rewrite)
        elif re.search(r"srcset\s*=", prefix, re.I):
            result = re.sub(r"(^|,\s*)(\S+?)(?=\s|,|$)", lambda m: m[1] + rewrite(m[2]), value)
        else:
            result = rewrite(value)
        escaped = original if result == value else html.escape(result, quote=True)
        return prefix + delimiter + escaped + delimiter
    def tag(match):
        if match[0].startswith("<!"):
            return match[0]
        return re.sub(r'''(\s(?:href|src|poster|data|xlink:href|srcset|style)\s*=\s*)(["'])(.*?)\2''', attribute, match[0], flags=re.I)
    text = re.sub(r"<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[a-z][^>]*>", tag, data.decode("utf-8"), flags=re.I)
    text = re.sub(r"<!--[\s\S]*?-->|(<style\b[^>]*>)([\s\S]*?)(</style>)", lambda m: m[1] + _css(m[2], rewrite) + m[3] if m[1] else m[0], text, flags=re.I)
    return text.encode("utf-8")
