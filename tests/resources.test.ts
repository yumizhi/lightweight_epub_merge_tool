import { describe, expect, it } from "vitest";
import { inspectEpub, mergeEpubs, readBookSummary, readSourceBook, splitEpub } from "../ts/src/index.js";
import { readZip, writeZip } from "../ts/src/zip.js";
import { remapReference, resolvePath, rewriteReferences } from "../ts/src/resources.js";
import { utf8Decode, utf8Encode } from "../ts/src/utils.js";
import { input } from "./fixtures.js";
const text = utf8Decode;

describe("resource and navigation integrity", () => {
  it("reads summary without retaining assets and inspects ordinary EPUBs", () => {
    const summary = readBookSummary(input(1));
    expect(summary.itemData.size).toBe(0); expect(summary.sha256).toBe("");
    const report = inspectEpub(input(1).data);
    expect(report.tool_generated).toBe(false); expect(report.spine).toEqual(["Text/chapter.xhtml"]);
    expect(report.creators).toEqual(["Author"]);
  });
  it("resolves nested EPUB3 navigation relative to its own directory", () => {
    expect(readSourceBook(input(1, 3, true)).toc[0].href).toBe("Text/chapter.xhtml#start");
    const merged = mergeEpubs("nested.epub", [input(1, 3, true), input(2, 2)]);
    expect(readSourceBook(merged).spineIds).toHaveLength(2);
  });
  it("rewrites XHTML and CSS references to pooled images, then reverses them", () => {
    const merged = mergeEpubs("combined.epub", [input(1), input(2)]);
    const book = readSourceBook(merged);
    const chapter = text(book.itemData.get("v2/OEBPS/Text/chapter.xhtml")!);
    expect(chapter).toContain('../../../v1/OEBPS/Images/pixel.png');
    expect(chapter).toContain('../Styles/book.css');
    expect(text(book.itemData.get("v2/OEBPS/Styles/book.css")!)).toContain('../../../v1/OEBPS/Images/pixel.png');
    const recovered = readSourceBook(splitEpub(merged.data)[1]);
    expect(text(recovered.itemData.get("Text/chapter.xhtml")!)).toContain('../Images/pixel.png');
    expect(text(recovered.itemData.get("Styles/book.css")!)).toContain('../Images/pixel.png');
    expect(recovered.itemData.get("Images/pixel.png")).toEqual(readSourceBook(input(2)).itemData.get("Images/pixel.png"));
  });
  it("keeps URI fragments, query strings, encoded names, CSS imports and srcset", () => {
    const paths = new Map([["OPS/Images/a b.png", "v1/OPS/Images/a%20b.png"]]);
    const rewrite = (href: string) => remapReference(href, "OPS/Text/page.xhtml", "v2/OPS/Text/page.xhtml", paths);
    expect(rewrite("../Images/a%20b.png?x=1#spot")).toBe("../../../v1/OPS/Images/a%20b.png?x=1#spot");
    const html = `<img srcset="../Images/a%20b.png 1x, ../Images/a%20b.png 2x" style="background:url('../Images/a%20b.png')"/><a href="#section">Here</a>`;
    const output = text(rewriteReferences(utf8Encode(html), "application/xhtml+xml", rewrite));
    expect(output.match(/v1\/OPS\/Images/g)).toHaveLength(3);
    expect(output).toContain('href="#section"');
    expect(text(rewriteReferences(utf8Encode('@import "../Images/a%20b.png";'), "text/css", rewrite))).toContain('v1/OPS/Images');
  });
  it("preserves nested TOC hierarchy and flat mode accepts repeated chapter titles", () => {
    const source = input(1);
    const zip = readZip(source.data);
    zip.set("OEBPS/nav.xhtml", utf8Encode(text(zip.get("OEBPS/nav.xhtml")!).replace('</a></li>', '</a><ol><li><a href="Text/chapter.xhtml#start">Section</a></li></ol></li>')));
    source.data = writeZip([...zip].map(([name, data]) => ({ name, data, ...(name === "mimetype" ? { level: 0 as const } : {}) })));
    expect(readSourceBook(source).toc[1].depth).toBe(1);
    const merged = mergeEpubs("nested.epub", [source]);
    expect(readSourceBook(merged).toc.find(e => e.title === "Section")?.depth).toBe(2);
    expect(readSourceBook(splitEpub(merged.data)[0]).toc[1].depth).toBe(1);
  });
  it("allows repeated titles in flat TOCs and orders Chinese volume names", () => {
    const a = input(1), b = input(2);
    const zip = readZip(b.data);
    zip.set("OEBPS/nav.xhtml", utf8Encode(text(zip.get("OEBPS/nav.xhtml")!).replace('Chapter 2', 'Chapter 1')));
    b.data = writeZip([...zip].map(([name, data]) => ({ name, data })));
    expect(readSourceBook(mergeEpubs("flat.epub", [a, b], { structure: "flat" })).toc.map(e => e.title)).toEqual(["Chapter 1", "Chapter 1"]);
    expect(inspectEpub(mergeEpubs("cn.epub", [{...a, name:"第二卷.epub"}, {...b, name:"第一卷.epub"}]).data).sources).toEqual(["第一卷.epub", "第二卷.epub"]);
  });
  it("rejects missing assets, malformed XML and archive traversal", () => {
    const zip = readZip(input(1).data); zip.delete("OEBPS/Images/pixel.png");
    expect(() => readBookSummary({ name: "bad.epub", data: writeZip([...zip].map(([name, data]) => ({ name, data }))) })).toThrow(/missing resource/);
    expect(() => resolvePath("OPS", "../../outside")).toThrow(/escapes/);
    expect(() => remapReference("../missing.jpg", "OPS/Text/ch.xhtml", "v1/Text/ch.xhtml", new Map())).toThrow(/missing resource/);
  });
});
