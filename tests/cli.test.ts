import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compatibilityBook, input } from "./fixtures.js";
import { mergeEpubs, readSourceBook, splitEpub } from "../ts/src/index.js";
const python =
  process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const env = { ...process.env, PYTHONPATH: resolve("src") };
const cli = (...args: string[]) =>
  execFileSync(python, ["-m", "epub_merge_tool", ...args], {
    env,
    encoding: "utf8",
  });
describe("Python CLI interoperability", () => {
  it("keeps help and ordinary EPUB inspection available", () => {
    expect(cli("--help")).toContain("merge,split,inspect");
    const failure = spawnSync(
      python,
      ["-m", "epub_merge_tool", "inspect", "missing.epub"],
      { env, encoding: "utf8" },
    );
    expect(failure.status).toBe(1);
    expect(failure.stderr).not.toContain("Traceback");
  });
  it("merges EPUB 2/3, interoperates with TypeScript split, and preserves binary assets", () => {
    const dir = mkdtempSync(join(tmpdir(), "epub-cli-"));
    try {
      const a = input(1, 3, true),
        b = input(2, 2);
      for (const book of [a, b]) writeFileSync(join(dir, book.name), book.data);
      expect(JSON.parse(cli("inspect", join(dir, a.name))).title).toBe(
        "Volume 1",
      );
      const path = join(dir, "combined.epub");
      cli("merge", path, join(dir, b.name), join(dir, a.name));
      const merged = readFileSync(path);
      const recovered = splitEpub(merged);
      expect(recovered.map((file) => readSourceBook(file).title)).toEqual([
        "Volume 1",
        "Volume 2",
      ]);
      expect(
        readSourceBook(recovered[1]).itemData.get("Images/pixel.png"),
      ).toEqual(readSourceBook(b).itemData.get("Images/pixel.png"));
      // Check the opposite direction through the Python CLI as well.
      writeFileSync(path, mergeEpubs("combined.epub", [a, b]).data);
      cli("split", path, "--out-dir", join(dir, "split"));
      const pyBook = readSourceBook({
        name: b.name,
        data: readFileSync(join(dir, "split", b.name)),
      });
      expect(pyBook.itemData.get("Images/pixel.png")).toEqual(
        readSourceBook(b).itemData.get("Images/pixel.png"),
      );
      expect(
        new TextDecoder().decode(pyBook.itemData.get("Styles/book.css")),
      ).toContain("../Images/pixel.png");
      if (process.env.EPUBCHECK_JAR) {
        writeFileSync(path, merged);
        const result = spawnSync(
          "java",
          ["-jar", process.env.EPUBCHECK_JAR, path],
          { encoding: "utf8" },
        );
        expect(result.stdout + result.stderr).toContain(
          "No errors or warnings detected",
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});

it("restores package metadata and literal archive paths in both CLI directions", () => {
  const dir = mkdtempSync(join(tmpdir(), "epub-compat-cli-"));
  try {
    const books = [compatibilityBook(1), compatibilityBook(2, 2)];
    for (const book of books) writeFileSync(join(dir, book.name), book.data);
    const path = join(dir, "collection.epub");
    cli("merge", path, ...books.map(book => join(dir, book.name)));
    const fromPython = splitEpub(readFileSync(path));
    for (const book of fromPython.map(readSourceBook)) {
      expect(book.packageMetadata?.publisher).toBe("出版社");
      expect(book.packageMetadata?.pageProgressionDirection).toBe("rtl");
      expect(book.packageMetadata?.spine?.[0].linear).toBe("no");
    }
    writeFileSync(path, mergeEpubs("collection.epub", books).data);
    cli("split", path, "--out-dir", join(dir, "split"));
    for (const book of books) {
      const restored = readSourceBook({ name: book.name, data: readFileSync(join(dir, "split", book.name)) });
      expect(restored.packageMetadata?.identifier).toBe(readSourceBook(book).packageMetadata?.identifier);
      expect(restored.packageMetadata?.rights).toBe("CC0 test fixture");
      expect(restored.itemData.get("../Images/%E6%8F%92%E5%9B%BE%20%231.png")).toEqual(readSourceBook(book).itemData.get("../Images/%E6%8F%92%E5%9B%BE%20%231.png"));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
