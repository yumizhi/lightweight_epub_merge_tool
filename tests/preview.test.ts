import { expect, it } from "vitest";
import { inspectEpub, mergeEpubs } from "../ts/src/index.js";
import { previewContents, contentsTree } from "../web/src/lib/toc.js";
import type { BookFile } from "../web/src/hooks/useWorkspace.js";
import { assetBook } from "./fixtures.js";

it("previews the generated volume/flat hierarchy in the chosen file order", () => {
  const inputs = [assetBook(2), assetBook(1)];
  const books = inputs.map((input, index) => ({
    id: String(index),
    status: "ready",
    title: inspectEpub(input.data).title,
    summary: inspectEpub(input.data),
  })) as BookFile[];
  for (const structure of ["volume", "flat"] as const) {
    const preview = previewContents(books, structure);
    const output = inspectEpub(
      mergeEpubs("collection.epub", inputs, { inputOrder: true, structure })
        .data,
    );
    expect(
      preview.map(({ title, depth }) => ({ title, depth: depth ?? 0 })),
    ).toEqual(
      output.toc.map(({ title, depth }) => ({ title, depth: depth ?? 0 })),
    );
  }
  expect(previewContents([...books].reverse(), "volume")[0].title).toBe(
    "Volume 1",
  );
  expect(
    previewContents([{ ...books[0], status: "reading" }], "volume"),
  ).toEqual([]);
});
it("builds nested navigation without skipping parent levels or losing repeated titles", () => {
  const tree = contentsTree([
    { title: "Part", href: "", depth: 0 },
    { title: "Chapter", href: "a", depth: 8 },
    { title: "Chapter", href: "b", depth: 8 },
    { title: "End", href: "c", depth: 0 },
  ]);
  expect(tree.map((n) => n.title)).toEqual(["Part", "End"]);
  expect(tree[0].children[0].href).toBe("a");
  expect(tree[0].children[0].children[0].href).toBe("b");
  expect(tree[0].children[0].key).not.toBe(tree[0].children[0].children[0].key);
});
