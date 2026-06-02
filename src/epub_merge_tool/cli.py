from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .errors import EpubMergeError
from .inspect import inspect_epub
from .merge import merge_epubs
from .split import split_epub


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "merge":
            merge_epubs(
                args.output,
                args.inputs,
                title=args.title,
                structure=args.structure,
                input_order=args.input_order,
            )
            return 0
        if args.command == "split":
            split_epub(args.input, args.out_dir, heuristic=args.heuristic)
            return 0
        if args.command == "inspect":
            print(json.dumps(inspect_epub(args.input), ensure_ascii=False, indent=2))
            return 0
    except EpubMergeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    parser.print_help(sys.stderr)
    return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="epub-merge")
    subparsers = parser.add_subparsers(dest="command", required=True)

    merge = subparsers.add_parser("merge", help="merge EPUB files")
    merge.add_argument("--structure", choices=("volume", "flat"), default="volume")
    merge.add_argument("--input-order", action="store_true", help="use the explicit INPUT order instead of automatic ordering")
    merge.add_argument("--title")
    merge.add_argument("output", type=Path)
    merge.add_argument("inputs", nargs="+", type=Path)

    split = subparsers.add_parser("split", help="split a tool-generated EPUB")
    split.add_argument("input", type=Path)
    split.add_argument("--out-dir", required=True, type=Path)
    split.add_argument("--heuristic", action="store_true")

    inspect = subparsers.add_parser("inspect", help="inspect merge manifest")
    inspect.add_argument("input", type=Path)
    return parser
