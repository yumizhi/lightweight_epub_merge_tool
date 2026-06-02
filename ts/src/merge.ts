import { EpubMergeError } from "./errors.js";
import { baseZipEntries, buildFlatNav, buildOpf, buildVolumeNav, MERGE_MANIFEST_PATH, readSourceBook } from "./epub-io.js";
import type { InputFile, ManifestItem, MergeOptions, MergeResult, SourceBook, TocEntry } from "./models.js";
import { dirnamePosix, relPosix, safeBasename, sha256, utf8Decode, utf8Encode } from "./utils.js";
import { writeZip, type ZipEntry } from "./zip.js";
import { sortSources } from "./ordering.js";

const IMAGE_FONT_TYPES = new Set([
  "font/ttf", "font/otf", "font/woff", "font/woff2",
  "application/font-sfnt", "application/font-woff", "application/vnd.ms-opentype",
  "application/x-font-ttf", "application/x-font-opentype", "application/x-font-truetype"
]);

export function mergeEpubs(outputName: string, inputs: InputFile[], options: MergeOptions = {}): MergeResult {
  const structure = options.structure ?? "volume";
  if (structure !== "volume" && structure !== "flat") throw new EpubMergeError("structure must be 'volume' or 'flat'");
  if (!inputs.length) throw new EpubMergeError("At least one input EPUB is required");

  let sources = inputs.map(readSourceBook);
  rejectDuplicateBasenames(sources);
  if (!options.inputOrder) sources = sortSources(sources);
  if (structure === "flat") rejectDuplicateFlatTitles(sources);

  const title = options.title ?? outputName.replace(/\.epub$/i, "");
  const zipEntries: ZipEntry[] = baseZipEntries();
  const outputItems: ManifestItem[] = [];
  const spineIds: string[] = [];
  const resourcePool = new Map<string, string>();
  const manifestHrefIds = new Map<string, string>();
  const written = new Set<string>();
  const volumeToc: Array<{ title: string; href: string; entries: TocEntry[] }> = [];
  const flatToc: TocEntry[] = [];
  const manifestSources: Record<string, unknown>[] = [];
  let firstHref = "#";

  sources.forEach((source, sourceIndex) => {
    const prefix = sourceIndex === 0 ? "" : `v${sourceIndex}/`;
    const hrefMap = new Map<string, string>();
    const idMap = new Map<string, string>();
    const fileRecords: Record<string, unknown>[] = [];
    const rewrites: Record<string, Record<string, string>> = {};

    for (const item of source.manifestItems) {
      if (item.properties.includes("nav") || item.mediaType === "application/x-dtbncx+xml") continue;
      const data = source.itemData.get(item.href);
      if (!data) throw new EpubMergeError(`${source.basename}: missing item data ${item.href}`);
      const preferred = `${prefix}${item.href}`;
      let finalHref = preferred;
      if (canPool(item.mediaType)) {
        const key = `${item.mediaType.toLowerCase()}:${sha256(data)}`;
        finalHref = resourcePool.get(key) ?? preferred;
        resourcePool.set(key, finalHref);
      }
      hrefMap.set(item.href, finalHref);
      const newId = `s${sourceIndex}_${item.id}`;
      let ownerId = manifestHrefIds.get(finalHref);
      if (!ownerId) {
        ownerId = newId;
        manifestHrefIds.set(finalHref, ownerId);
        outputItems.push({ id: ownerId, href: finalHref, mediaType: item.mediaType, properties: item.properties.filter((p) => p !== "nav") });
      }
      idMap.set(item.id, ownerId);
      fileRecords.push({
        id: item.id,
        href: item.href,
        media_type: item.mediaType,
        properties: item.properties,
        merged_href: finalHref
      });
    }

    for (const item of source.manifestItems) {
      if (item.properties.includes("nav") || item.mediaType === "application/x-dtbncx+xml") continue;
      let data = source.itemData.get(item.href);
      if (!data) throw new EpubMergeError(`${source.basename}: missing item data ${item.href}`);
      const rewriteMap = rewriteMapForItem(item, prefix, hrefMap);
      if (Object.keys(rewriteMap).length) {
        data = rewriteRefs(data, rewriteMap);
        rewrites[item.href] = rewriteMap;
      }
      const finalHref = hrefMap.get(item.href)!;
      const zipName = `OEBPS/${finalHref}`;
      if (!written.has(zipName)) {
        zipEntries.push({ name: zipName, data });
        written.add(zipName);
      }
    }

    for (const id of source.spineIds) spineIds.push(idMap.get(id)!);
    const remapped = source.toc.map((entry) => ({ title: entry.title, href: remapTocHref(entry.href, hrefMap) }));
    if (firstHref === "#" && remapped.length) firstHref = remapped[0].href;
    volumeToc.push({ title: source.title, href: remapped[0]?.href ?? "#", entries: remapped });
    flatToc.push(...remapped);
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
      rewrites
    });
  });

  zipEntries.push({ name: "OEBPS/nav-merged.xhtml", data: structure === "flat" ? buildFlatNav(title, firstHref, flatToc) : buildVolumeNav(title, firstHref, volumeToc) });
  zipEntries.push({ name: "OEBPS/content.opf", data: buildOpf(title, sources[0].language, [], outputItems, spineIds) });
  zipEntries.push({
    name: MERGE_MANIFEST_PATH,
    data: utf8Encode(JSON.stringify({
      schema: "epub-merge-tool/v1",
      tool_version: "ts-0.1.0",
      structure,
      title,
      language: sources[0].language,
      sources: manifestSources
    }, null, 2))
  });
  return { name: outputName, data: writeZip(zipEntries) };
}

function rejectDuplicateBasenames(sources: SourceBook[]): void {
  const seen = new Set<string>();
  for (const source of sources) {
    const basename = safeBasename(source.basename);
    if (seen.has(basename)) throw new EpubMergeError(`Duplicate source basename: ${basename}`);
    seen.add(basename);
  }
}

function rejectDuplicateFlatTitles(sources: SourceBook[]): void {
  const seen = new Map<string, string>();
  for (const source of sources) {
    for (const entry of source.toc) {
      const key = entry.title.trim();
      const other = seen.get(key);
      if (other) throw new EpubMergeError(`Duplicate flat chapter title '${entry.title}' in ${source.basename} and ${other}`);
      seen.set(key, source.basename);
    }
  }
}

function canPool(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase();
  return normalized.startsWith("image/") || IMAGE_FONT_TYPES.has(normalized);
}

function rewriteMapForItem(item: ManifestItem, prefix: string, hrefMap: Map<string, string>): Record<string, string> {
  if (!item.mediaType.toLowerCase().endsWith("xhtml+xml")) return {};
  const chapterDir = dirnamePosix(`${prefix}${item.href}`);
  const mapping: Record<string, string> = {};
  for (const [original, finalHref] of hrefMap.entries()) {
    const preferred = `${prefix}${original}`;
    if (preferred === finalHref) continue;
    mapping[original] = relPosix(chapterDir, finalHref);
  }
  return mapping;
}

function rewriteRefs(data: Uint8Array, mapping: Record<string, string>): Uint8Array {
  let text = utf8Decode(data);
  for (const [oldHref, newHref] of Object.entries(mapping)) {
    text = text
      .replaceAll(`src="${oldHref}"`, `src="${newHref}"`)
      .replaceAll(`src='${oldHref}'`, `src='${newHref}'`)
      .replaceAll(`href="${oldHref}"`, `href="${newHref}"`)
      .replaceAll(`href='${oldHref}'`, `href='${newHref}'`);
  }
  return utf8Encode(text);
}

function remapTocHref(href: string, hrefMap: Map<string, string>): string {
  const [base, fragment] = href.split("#", 2);
  const mapped = hrefMap.get(base);
  if (!mapped) throw new EpubMergeError(`TOC href '${href}' does not reference a copied manifest item`);
  return fragment === undefined ? mapped : `${mapped}#${fragment}`;
}
