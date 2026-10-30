"""Exercise installed release CLIs using original, generated EPUB samples."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile


def sample(path: Path, volume: int):
    opf = f'''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:fixture:{volume}</dc:identifier><dc:title>Volume {volume}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="image" href="pixel.png" media-type="image/png"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>'''
    chapter = f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><h1>Volume {volume}</h1><img src="pixel.png" alt="Pixel"/></body></html>'
    nav = '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>'
    image = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        for name, data in {"book.opf": opf, "chapter.xhtml": chapter, "nav.xhtml": nav, "pixel.png": image}.items():
            archive.writestr("OPS/" + name, data)
    return image


def check(cli: str, directory: Path):
    directory.mkdir()
    books = [directory / f"volume-{index}.epub" for index in [1, 2]]
    expected = [sample(book, index) for index, book in enumerate(books, 1)]
    subprocess.run([cli, "--help"], check=True, capture_output=True)
    merged = directory / "collection.epub"
    subprocess.run([cli, "merge", str(merged), *map(str, books), "--input-order"], check=True)
    with zipfile.ZipFile(merged) as archive:
        assert archive.infolist()[0].filename == "mimetype"
        assert archive.infolist()[0].compress_type == zipfile.ZIP_STORED
        assert sum(name.endswith("pixel.png") for name in archive.namelist()) == 1
    report = json.loads(subprocess.check_output([cli, "inspect", str(merged)], text=True))
    assert report["title"] == "collection"
    recovered = directory / "split"
    subprocess.run([cli, "split", str(merged), "--out-dir", str(recovered)], check=True)
    assert sorted(path.name for path in recovered.glob("*.epub")) == [book.name for book in books]
    for index, book in enumerate(books):
        with zipfile.ZipFile(recovered / book.name) as archive:
            assert archive.read("OPS/pixel.png") == expected[index]
    print(f"Installed CLI passed: {cli}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--python-cli", required=True)
    parser.add_argument("--node-cli", required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="epub-release-") as directory:
        check(str(Path(args.python_cli).resolve()), Path(directory) / "python")
        check(str(Path(args.node_cli).resolve()), Path(directory) / "node")
