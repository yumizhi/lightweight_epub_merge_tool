from __future__ import annotations

import re
from pathlib import Path

from .errors import OrderingError
from .models import SourceBook


SPECIAL_MARKERS = ("bd", "blu-ray", "bluray", "特典", "特装", "限定", "another")
CHINESE_DIGITS = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}


def sort_sources(sources: list[SourceBook]) -> list[SourceBook]:
    keyed: list[tuple[tuple[int, ...], SourceBook]] = []
    for source in sources:
        key = order_key(source)
        keyed.append((key, source))
    seen: dict[tuple[int, ...], str] = {}
    for key, source in keyed:
        if key in seen:
            raise OrderingError(
                f"Ambiguous input order: {source.basename!r} and {seen[key]!r} share order key {key}"
            )
        seen[key] = source.basename
    return [source for _, source in sorted(keyed, key=lambda item: item[0])]


def order_key(source: SourceBook) -> tuple[int, ...]:
    filename = Path(source.basename).stem
    decimal = _decimal_key(filename)
    if decimal:
        return decimal
    special = _special_key(filename)
    if special:
        return special
    for text in (filename, source.title, source.toc[0].title if source.toc else ""):
        numbers = _numbers(text)
        if numbers:
            return numbers
    raise OrderingError(f"Could not determine input order for {source.basename!r}")


def _numbers(text: str) -> tuple[int, ...]:
    return tuple(int(match) for match in re.findall(r"\d+", text))


def _decimal_key(text: str) -> tuple[int, ...] | None:
    match = re.search(r"(\d+)\.(\d+)", text)
    if not match:
        return None
    fractional = match.group(2)
    scaled = int(fractional.ljust(6, "0")[:6])
    return int(match.group(1)), scaled


def _special_key(text: str) -> tuple[int, ...] | None:
    lowered = text.lower()
    if not any(marker in lowered for marker in SPECIAL_MARKERS):
        return None
    values = list(_numbers(text))
    values.extend(_chinese_ordinals(text))
    if not values:
        return None
    return (10_000, *sorted(values))


def _chinese_ordinals(text: str) -> tuple[int, ...]:
    values: list[int] = []
    for match in re.findall(r"第([一二三四五六七八九十〇零]+)", text):
        value = _parse_chinese_number(match)
        if value is not None:
            values.append(value)
    return tuple(values)


def _parse_chinese_number(text: str) -> int | None:
    if text == "十":
        return 10
    if "十" in text:
        left, _, right = text.partition("十")
        tens = CHINESE_DIGITS.get(left, 1) if left else 1
        ones = CHINESE_DIGITS.get(right, 0) if right else 0
        return tens * 10 + ones
    total = 0
    for char in text:
        digit = CHINESE_DIGITS.get(char)
        if digit is None:
            return None
        total = total * 10 + digit
    return total
