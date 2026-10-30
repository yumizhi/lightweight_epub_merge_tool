import { expect, it } from "vitest";
import { fixture, compatibilityBook, assetBook } from "./fixtures.js";
import { mergeEpubs, readSourceBook, splitEpub } from "../ts/src/index.js";
import { readZip, writeZip } from "../ts/src/zip.js";
import { rewriteReferences } from "../ts/src/resources.js";
import { utf8Decode as text, utf8Encode as bytes } from "../ts/src/utils.js";

it("keeps literal archive paths, encoded URIs, cover and package metadata through split", () => {
  const a = compatibilityBook(1),
    b = compatibilityBook(2, 2);
  const merged = mergeEpubs("compatibility.epub", [a, b]);
  const restored = splitEpub(merged.data).map(readSourceBook);
  for (const [i, book] of restored.entries()) {
    expect(book.opfPath).toBe("书库 100%/Package/book.opf");
    expect(book.title).toBe(`Volume ${i + 1}`);
    expect(
      book.itemData.get("../Images/%E6%8F%92%E5%9B%BE%20%231.png"),
    ).toEqual(
      readSourceBook(a).itemData.get("../Images/%E6%8F%92%E5%9B%BE%20%231.png"),
    );
    const opf = text(
      readZip(splitEpub(merged.data)[i].data).get(book.opfPath)!,
    );
    expect(opf).toContain("出版社");
    expect(opf).toContain("CC0 test fixture");
    expect(opf).toContain('page-progression-direction="rtl"');
    expect(opf).toContain('linear="no"');
    expect(
      book.manifestItems.find((item) => item.mediaType === "image/png")
        ?.properties,
    ).toContain("cover-image");
  }
});
it("rewrites URI attributes without touching quoted tag-like text, CSS strings or scripts", () => {
  const seen: string[] = [];
  const rewrite = (href: string) => {
    seen.push(href);
    return href === "real.png" ? "other.png" : href;
  };
  const html = `<html><body><p title="a > b and src='missing.png'">Text</p><script src="real.js">const text = '<img src="fake.png"/>';</script><img title="x > y" src="real.png"/><svg><image href="real.png"/><rect fill="url(real.png)"/></svg><style>.fake:after{content:'<img src="also-fake.png"/>'} .a:after{content:"url(missing.png)"} .b{background:url(real.png)}</style></body></html>`;
  const result = text(
    rewriteReferences(bytes(html), "application/xhtml+xml", rewrite),
  );
  expect(seen).toEqual([
    "real.js",
    "real.png",
    "real.png",
    "real.png",
    "real.png",
  ]);
  expect(result).toContain(`title="a > b and src='missing.png'"`);
  expect(result).toContain(`'<img src="fake.png"/>'`);
  expect(result).toContain('content:"url(missing.png)"');
  expect(result).toContain('fill="url(&quot;other.png&quot;)"');
});
it("rejects an unresolved document reference even when no resource was pooled", () => {
  const zip = readZip(fixture());
  zip.set(
    "OEBPS/Text/chapter.xhtml",
    bytes(
      text(zip.get("OEBPS/Text/chapter.xhtml")!).replace(
        "../Images/pixel.png",
        "../Images/absent.png",
      ),
    ),
  );
  const book = {
    name: "volume-1.epub",
    data: writeZip([...zip].map(([name, data]) => ({ name, data }))),
  };
  expect(() => mergeEpubs("bad.epub", [book])).toThrow(/missing resource/);
});

it("keeps mixed label text and non-link TOC headings in reading order", () => {
  const zip = readZip(fixture());
  zip.set(
    "OEBPS/nav.xhtml",
    bytes(
      text(zip.get("OEBPS/nav.xhtml")!).replace(
        '<li><a href="Text/chapter.xhtml#start">Chapter 1</a></li>',
        '<li><span>Part <em>One</em></span><ol><li><a href="Text/chapter.xhtml#start">Chapter <strong>One</strong> end</a></li></ol></li>',
      ),
    ),
  );
  const source = {
    name: "volume-1.epub",
    data: writeZip([...zip].map(([name, data]) => ({ name, data }))),
  };
  expect(readSourceBook(source).toc).toEqual([
    { title: "Part One", href: "" },
    { title: "Chapter One end", href: "Text/chapter.xhtml#start", depth: 1 },
  ]);
  const flat = readSourceBook(
    mergeEpubs("flat.epub", [source], { structure: "flat" }),
  );
  expect(flat.toc.map((entry) => entry.title)).toEqual(["Chapter One end"]);
  const merged = mergeEpubs("headings.epub", [source]);
  expect(readSourceBook(splitEpub(merged.data)[0]).toc).toEqual(
    readSourceBook(source).toc,
  );
});

it("deduplicates generated JPEG/font assets and resolves SVG dependencies", () => {
  const books = [assetBook(1), assetBook(2)];
  const merged = mergeEpubs("assets.epub", books);
  const zip = readZip(merged.data);
  expect([...zip.keys()].filter((name) => name.endsWith(".ttf"))).toHaveLength(
    1,
  );
  expect([...zip.keys()].filter((name) => name.endsWith(".jpg"))).toHaveLength(
    1,
  );
  expect(text(zip.get("OEBPS/v2/OEBPS/Images/vector.svg")!)).toContain(
    "../../../v1/OEBPS/Images/photo.jpg",
  );
  for (const [index, result] of splitEpub(merged.data).entries()) {
    const restored = readSourceBook(result),
      original = readSourceBook(books[index]);
    for (const href of ["Fonts/book.ttf", "Images/photo.jpg"])
      expect(restored.itemData.get(href)).toEqual(original.itemData.get(href));
    expect(text(restored.itemData.get("Images/vector.svg")!)).toContain(
      'href="photo.jpg"',
    );
  }
});

it("explains unsupported fixed layout and media overlay packages before processing", () => {
  for (const [marker, message] of [
    ['<meta property="rendition:layout">pre-paginated</meta>', "fixed-layout"],
    ["media-overlay", "media overlays"],
  ]) {
    const zip = readZip(fixture());
    const opf = text(zip.get("OEBPS/content.opf")!);
    zip.set(
      "OEBPS/content.opf",
      bytes(
        marker === "media-overlay"
          ? opf.replace('id="chapter"', 'id="chapter" media-overlay="audio"')
          : opf.replace("</metadata>", marker + "</metadata>"),
      ),
    );
    expect(() =>
      readSourceBook({
        name: "book.epub",
        data: writeZip([...zip].map(([name, data]) => ({ name, data }))),
      }),
    ).toThrow(message);
  }
});
