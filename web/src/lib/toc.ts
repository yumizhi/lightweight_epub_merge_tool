import type { TocEntry } from "../../../ts/src/models.js";
import type { BookFile } from "../hooks/useWorkspace";

// Mirrors buildVolumeNav/buildFlatNav; links are labels here, never opened.
export function previewContents(
  books: BookFile[],
  structure: "volume" | "flat",
): TocEntry[] {
  return books
    .filter((book) => book.status === "ready")
    .flatMap((book) => {
      const toc = book.summary?.toc ?? [];
      if (structure === "flat")
        return toc
          .filter((entry) => entry.href)
          .map((entry) => ({ ...entry, depth: 0 }));
      return [
        { title: book.title!, href: "", depth: 0 },
        ...toc.map((entry) => ({ ...entry, depth: (entry.depth ?? 0) + 1 })),
      ];
    });
}
export type TocNode = TocEntry & { key: number; children: TocNode[] };
export function contentsTree(entries: TocEntry[]): TocNode[] {
  const roots: TocNode[] = [],
    parents: TocNode[] = [];
  entries.forEach((entry, key) => {
    // Match the navigation writer's handling of skipped hierarchy levels.
    const depth = Math.min(entry.depth ?? 0, parents.length);
    const node = { ...entry, key, children: [] };
    (depth ? parents[depth - 1].children : roots).push(node);
    parents[depth] = node;
    parents.length = depth + 1;
  });
  return roots;
}
