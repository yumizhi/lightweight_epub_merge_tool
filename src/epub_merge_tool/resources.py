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


def archive_path(path: str) -> str:
    if path.startswith("/") or "\\" in path:
        raise InvalidEpubError(f"Unsupported archive path: {path}")
    parts = []
    for part in path.split("/"):
        if part in {"", "."}:
            continue
        if part == "..":
            if not parts:
                raise InvalidEpubError(f"Archive path escapes the EPUB: {path}")
            parts.pop()
        else:
            parts.append(part)
    return "/".join(parts)


def _css(text: str, rewrite) -> str:
    token = re.compile(r"""/\*[\s\S]*?\*/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\burl\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\[\s\S]|[^\s)'"\\])*))\s*\)|@import\s+(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)')""", re.I)
    def replace(match):
        raw = next((value for value in match.groups() if value is not None), None)
        if raw is None:
            return match[0]
        def unescape(m):
            value = m[1]
            if re.match(r"[\da-f]", value, re.I):
                return chr(int(value.strip(), 16))
            return "" if re.search(r"[\r\n\f]", value) else value
        href = re.sub(r"\\([\da-f]{1,6}\s?|\r\n|[\s\S])", unescape, raw, flags=re.I)
        result = rewrite(href)
        if result == href:
            return match[0]
        escaped = result.replace("\\", "\\\\").replace('"', '\\"')
        return f'@import "{escaped}"' if match[0].lower().startswith('@import') else f'url("{escaped}")'
    return token.sub(replace, text)


def rewrite_references(data: bytes, media_type: str, rewrite) -> bytes:
    if media_type == "text/css":
        result = _css(data.decode("utf-8"), rewrite)
        return result.encode("utf-8")
    if not re.search("xhtml|svg|html|xml", media_type):
        return data
    css_attributes = {"style", "fill", "stroke", "filter", "clip-path", "mask", "cursor", "marker", "marker-start", "marker-mid", "marker-end"}
    uri_attributes = {"href", "src", "poster", "data", "xlink:href"}
    def attribute(match):
        prefix, name, delimiter, original = match.groups()
        name = name.lower()
        if name not in css_attributes | uri_attributes | {"srcset"}:
            return match[0]
        value = html.unescape(original)
        if name in css_attributes:
            result = _css(value, rewrite)
        elif name == "srcset":
            result = re.sub(r"(^|,\s*)(data:[^\s]+|[^\s,]+)([^,]*)", lambda m: m[1] + rewrite(m[2]) + m[3], value, flags=re.I)
        else:
            result = rewrite(value)
        escaped = original if result == value else html.escape(result, quote=True)
        return prefix + delimiter + escaped + delimiter
    def tag(match):
        if match[0].startswith("<!"):
            return match[0]
        def rewrite_tag(value):
            return re.sub(r'''(\s([\w:.-]+)\s*=\s*)(["'])([\s\S]*?)\3''', attribute, value)
        block = match[1]
        if not block:
            return rewrite_tag(match[0])
        opening = re.match(r'''^<[a-z]+\b(?:[^>"']|"[^"]*"|'[^']*')*>''', match[0], re.I)[0]
        end = match[0].rfind("</")
        content = match[0][len(opening):end]
        return rewrite_tag(opening) + (_css(content, rewrite) if block.lower() == "style" else content) + match[0][end:]
    text = re.sub(r'''<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?</\1\s*>|<[a-z][\w:.-]*\s+(?:[^>"']|"[^"]*"|'[^']*')*>''', tag, data.decode("utf-8"), flags=re.I)
    return text.encode("utf-8")
