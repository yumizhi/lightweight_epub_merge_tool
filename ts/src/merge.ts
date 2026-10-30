import { EpubMergeError } from "./errors.js";
import {
  baseZipEntries,
  buildFlatNav,
  buildOpf,
  buildVolumeNav,
  MERGE_MANIFEST_PATH,
  readSourceBook,
  readBookSummary,
} from "./epub-io.js";
import type {
  InputFile,
  ManifestItem,
  MergeOptions,
  MergeResult,
  SourceBook,
  TocEntry,
} from "./models.js";
import { safeBasename, sha256, utf8Encode } from "./utils.js";
import { writeZip, type ZipEntry } from "./zip.js";
import {
  encodePath,
  resolvePath,
  remapReference,
  rewriteReferences,
} from "./resources.js";
import { sortSources } from "./ordering.js";

const IMAGE_FONT_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "application/font-sfnt",
  "application/font-woff",
  "application/vnd.ms-opentype",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/x-font-truetype",
]);

export function mergeEpubs(
  outputName: string,
  inputs: InputFile[],
  options: MergeOptions = {},
): MergeResult {
  const structure = options.structure ?? "volume";
  if (structure !== "volume" && structure !== "flat")
    throw new EpubMergeError("structure must be 'volume' or 'flat'");
  if (!inputs.length)
    throw new EpubMergeError("At least one input EPUB is required");

  let sources = inputs.map(readBookSummary);
  rejectDuplicateBasenames(sources);
  if (!options.inputOrder) sources = sortSources(sources);

  const title = options.title ?? outputName.replace(/\.epub$/i, "");
  const zipEntries: ZipEntry[] = baseZipEntries();
  const outputItems: ManifestItem[] = [];
  const spineIds: string[] = [];
  const resourcePool = new Map<string, string>();
  const manifestHrefIds = new Map<string, string>();
  const written = new Set<string>();
  const volumeToc: Array<{ title: string; href: string; entries: TocEntry[] }> =
    [];
  const flatToc: TocEntry[] = [];
  const manifestSources: Record<string, unknown>[] = [];
  let firstHref = "#";
  let hasCover = false;

  sources.forEach((summary, sourceIndex) => {
    // Inflate one source at a time; completed sources are no longer retained.
    const source = readSourceBook(
      inputs.find((input) => safeBasename(input.name) === summary.basename)!,
    );
    const prefix = `v${sourceIndex + 1}/`;
    const hrefMap = new Map<string, string>();
    const idMap = new Map<string, string>();
    const fileRecords: Record<string, unknown>[] = [];
    const rewrites: Record<string, Record<string, string>> = {};

    for (const item of source.manifestItems) {
      if (item.mediaType === "application/x-dtbncx+xml") continue;
      const data = source.itemData.get(item.href);
      if (!data)
        throw new EpubMergeError(
          `${source.basename}: missing item data ${item.href}`,
        );
      const preferred = encodePath(
        `${prefix}${resolvePath(source.opfDir, item.href)}`,
      );
      let finalHref = preferred;
      if (canPool(item.mediaType)) {
        const key = `${item.mediaType.toLowerCase()}:${sha256(data)}`;
        finalHref = resourcePool.get(key) ?? preferred;
        resourcePool.set(key, finalHref);
      }
      hrefMap.set(resolvePath(source.opfDir, item.href), finalHref);
      const newId = `s${sourceIndex}_${item.id}`;
      let ownerId = manifestHrefIds.get(finalHref);
      if (!ownerId) {
        ownerId = newId;
        manifestHrefIds.set(finalHref, ownerId);
        const properties = item.properties.filter(
          (p) => p !== "nav" && (p !== "cover-image" || !hasCover),
        );
        if (properties.includes("cover-image")) hasCover = true;
        outputItems.push({
          id: ownerId,
          href: finalHref,
          mediaType: item.mediaType,
          properties,
        });
      }
      idMap.set(item.id, ownerId);
      fileRecords.push({
        id: item.id,
        href: item.href,
        media_type: item.mediaType,
        properties: item.properties,
        merged_href: finalHref,
      });
    }

    for (const item of source.manifestItems) {
      if (item.mediaType === "application/x-dtbncx+xml") continue;
      let data = source.itemData.get(item.href);
      if (!data)
        throw new EpubMergeError(
          `${source.basename}: missing item data ${item.href}`,
        );
      const originalPath = resolvePath(source.opfDir, item.href);
      const finalHref = hrefMap.get(originalPath)!;
      const rewriteMap: Record<string, string> = {};
      data = rewriteReferences(data, item.mediaType, (href) => {
        const result = remapReference(
          href,
          originalPath,
          decodeURIComponent(finalHref),
          hrefMap,
        );
        if (result !== href) rewriteMap[href] = result;
        return result;
      });
      if (Object.keys(rewriteMap).length) rewrites[item.href] = rewriteMap;
      const zipName = `OEBPS/${decodeURIComponent(finalHref)}`;
      if (!written.has(zipName)) {
        zipEntries.push({
          name: zipName,
          data,
          level: /image\/(?:png|jpeg|gif|webp|avif)|font\/woff2/.test(
            item.mediaType,
          )
            ? 0
            : 6,
        });
        written.add(zipName);
      }
    }

    for (const id of source.spineIds) spineIds.push(idMap.get(id)!);
    const remapped = source.toc.map((entry) => ({
      ...entry,
      href: remapReference(
        entry.href,
        `${source.opfDir}/content.opf`,
        "nav-merged.xhtml",
        hrefMap,
      ),
    }));
    if (firstHref === "#" && remapped.length) firstHref = remapped[0].href;
    volumeToc.push({
      title: source.title,
      href: remapped[0]?.href ?? "#",
      entries: remapped,
    });
    flatToc.push(...remapped.map((entry) => ({ ...entry, depth: 0 })));
    manifestSources.push({
      basename: source.basename,
      sha256: source.sha256,
      title: source.title,
      language: source.language,
      creators: source.creators,
      opf_path: source.opfPath,
      files: fileRecords,
      spine: source.spineIds,
      toc: source.toc,
      rewrites,
    });
  });

  zipEntries.push({
    name: "OEBPS/nav-merged.xhtml",
    data:
      structure === "flat"
        ? buildFlatNav(title, firstHref, flatToc)
        : buildVolumeNav(title, firstHref, volumeToc),
  });
  zipEntries.push({
    name: "OEBPS/content.opf",
    data: buildOpf(
      title,
      sources[0].language,
      [...new Set(sources.flatMap((source) => source.creators))],
      outputItems,
      spineIds,
    ),
  });
  zipEntries.push({
    name: MERGE_MANIFEST_PATH,
    data: utf8Encode(
      JSON.stringify(
        {
          schema: "epub-merge-tool/v1",
          tool_version: "1.0.0",
          structure,
          title,
          language: sources[0].language,
          sources: manifestSources,
        },
        null,
        2,
      ),
    ),
  });
  return { name: outputName, data: writeZip(zipEntries) };
}

function rejectDuplicateBasenames(sources: SourceBook[]): void {
  const seen = new Set<string>();
  for (const source of sources) {
    const basename = safeBasename(source.basename);
    if (seen.has(basename))
      throw new EpubMergeError(`Duplicate source basename: ${basename}`);
    seen.add(basename);
  }
}

function canPool(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase();
  return (
    (normalized.startsWith("image/") && normalized !== "image/svg+xml") ||
    IMAGE_FONT_TYPES.has(normalized)
  );
}
