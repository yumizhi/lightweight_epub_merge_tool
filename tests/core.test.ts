import { describe, expect, it } from "vitest";
import { mergeEpubs, splitEpub, inspectEpub, readSourceBook, sortSources } from "../ts/src/index.js";
import { readZip } from "../ts/src/zip.js";
import { input } from "./fixtures.js";

describe("EPUB core baseline", () => {
  it("reads EPUB 2 NCX and EPUB 3 navigation", () => {
    for (const version of [2, 3]) {
      const book = readSourceBook(input(1, version));
      expect(book.title).toBe("Volume 1");
      expect(book.toc[0].href).toBe("Text/chapter.xhtml#start");
    }
  });
  it("sorts volumes and keeps explicit input order", () => {
    expect(sortSources([input(2), input(1)].map(readSourceBook)).map(b => b.title)).toEqual(["Volume 1", "Volume 2"]);
    const result = mergeEpubs("book.epub", [input(2), input(1)], { inputOrder: true });
    expect(inspectEpub(result.data).sources).toEqual(["volume-2.epub", "volume-1.epub"]);
  });
  it("merges and recovers every volume and its binary resources", () => {
    const merged = mergeEpubs("book.epub", [input(2), input(1)]);
    const outputs = splitEpub(merged.data);
    expect(outputs.map(o => o.name)).toEqual(["volume-1.epub", "volume-2.epub"]);
    for (const [index, output] of outputs.entries()) {
      expect(readSourceBook(output).title).toBe(`Volume ${index + 1}`);
      expect(readZip(output.data).get("OEBPS/Images/pixel.png")).toEqual(readZip(input(1).data).get("OEBPS/Images/pixel.png"));
    }
    const zip = readZip(merged.data);
    expect([...zip.keys()].filter(k => k.endsWith("pixel.png"))).toHaveLength(1);
    expect(new DataView(merged.data.buffer).getUint16(8, true)).toBe(0);
    expect([...zip.keys()][0]).toBe("mimetype");
  });
  it("rejects duplicate basenames, ambiguous ordering and invalid input", () => {
    expect(() => mergeEpubs("x.epub", [input(1), input(1)])).toThrow(/Duplicate/);
    expect(() => sortSources([readSourceBook(input(1)), { ...readSourceBook(input(1)), basename: "copy-1.epub" }])).toThrow();
    expect(() => splitEpub(input(1).data)).toThrow(/merge record/);
    expect(() => readSourceBook({ name: "bad.epub", data: new Uint8Array([0]) })).toThrow();
  });
});
