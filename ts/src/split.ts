import { ManifestError } from "./errors.js";
import {
  baseZipEntries,
  buildOpf,
  buildFlatNav,
  MERGE_MANIFEST_PATH,
  requireMergeManifest,
} from "./epub-io.js";
import type { SplitResult, TocEntry, ManifestItem, PackageMetadata, BlobResult, ExecutionOptions } from "./models.js";
import { archivePath, resolvePath, rewriteReferences } from "./resources.js";
import { dirnamePosix, safeBasename } from "./utils.js";
import { createZipOutput, readZip, writeZip, type ZipEntry } from "./zip.js";

export function splitEpub(input: Uint8Array): SplitResult[] {
  const sources = readSources(input);
  return sources.map((source) => ({ name: safeBasename(String(source.basename)), data: writeZip(splitSourceEntries(input, source)) }));
}

export async function splitEpubFile(input: Blob, execution: ExecutionOptions = {}): Promise<BlobResult[]> {
  const data = new Uint8Array(await input.arrayBuffer());
  const sources = readSources(data);
  const results: BlobResult[] = [];
  for (const [index, source] of sources.entries()) {
    const writer = createZipOutput();
    for (const entry of splitSourceEntries(data, source)) {
      execution.signal?.throwIfAborted();
      writer.add(entry);
    }
    results.push({ name: safeBasename(String(source.basename)), blob: new Blob(writer.finish(), { type: "application/epub+zip" }) });
    execution.onProgress?.({ phase: "restoring", completed: index + 1, total: sources.length, file: String(source.basename) });
  }
  return results;
}
function readSources(input: Uint8Array): Array<Record<string, unknown>> {
  const manifestData = readZip(input, new Set([MERGE_MANIFEST_PATH])).get(MERGE_MANIFEST_PATH);
  if (!manifestData) throw new ManifestError("This EPUB has no merge record. Split requires a book merged with this tool.");
  return requireMergeManifest(manifestData).sources as Array<Record<string, unknown>>;
}

function* splitSourceEntries(
  input: Uint8Array,
  source: Record<string, unknown>,
): Generator<ZipEntry> {
  const files = source.files as Array<Record<string, unknown>>;
  const spine = source.spine as string[];
  const toc = source.toc as TocEntry[];
  const rewrites = (source.rewrites ?? {}) as Record<
    string,
    Record<string, string>
  >;
  const items: ManifestItem[] = files.map((file) => ({
    id: String(file.id),
    href: String(file.href),
    mediaType: String(file.media_type),
    properties: ((file.properties as string[] | undefined) ?? []).filter(
      (p) => p !== "nav",
    ),
  }));
  const opfPath = archivePath(String(source.opf_path));
  const opfDir = dirnamePosix(opfPath);
  let navHref = "epub-toolkit-nav.xhtml";
  while (
    items.some(
      (item) => resolvePath(opfDir, item.href) === resolvePath(opfDir, navHref),
    )
  )
    navHref = "_" + navHref;
  yield* baseZipEntries(opfPath);
  yield {
    name: resolvePath(opfDir, navHref),
    data: buildFlatNav(String(source.title), toc[0]?.href ?? "#", toc),
  };
  yield {
    name: opfPath,
    data: buildOpf(
      String(source.title),
      String(source.language ?? "en"),
      (source.creators as string[] | undefined) ?? [],
      items,
      spine,
      navHref,
      (source.package_metadata ?? {}) as PackageMetadata,
    ),
  };
  for (const file of files) {
    const mergedHref = String(file.merged_href);
    const originalHref = String(file.href);
    const path = resolvePath("OEBPS", mergedHref);
    const data = readZip(input, new Set([path])).get(path);
    if (!data)
      throw new ManifestError(
        `manifest references missing merged resource ${mergedHref}`,
      );
    const mapping = rewrites[originalHref] ?? {};
    const reverse = new Map(
      Object.entries(mapping).map(([old, next]) => [next, old]),
    );
    const restored = reverse.size
      ? rewriteReferences(
          data,
          String(file.media_type),
          (href) => reverse.get(href) ?? href,
        )
      : data;
    yield {
      name: resolvePath(opfDir, originalHref),
      data: restored,
      level: /image\/(?:png|jpeg|gif|webp|avif)|font\/woff2/.test(String(file.media_type)) ? 0 : 6,
    };
  }
}
