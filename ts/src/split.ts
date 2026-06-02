import { ManifestError } from "./errors.js";
import { baseZipEntries, buildOpf, buildVolumeNav, MERGE_MANIFEST_PATH, requireMergeManifest } from "./epub-io.js";
import type { SplitResult, TocEntry, ManifestItem } from "./models.js";
import { utf8Decode, utf8Encode } from "./utils.js";
import { readZip, writeZip, type ZipEntry } from "./zip.js";

export function splitEpub(input: Uint8Array): SplitResult[] {
  const zip = readZip(input);
  const manifestData = zip.get(MERGE_MANIFEST_PATH);
  if (!manifestData) throw new ManifestError("missing epub-merge-tool manifest; use heuristic split for best-effort split");
  const manifest = requireMergeManifest(manifestData);
  const sources = manifest.sources as Array<Record<string, unknown>>;
  return sources.map((source) => splitSource(zip, source));
}

function splitSource(mergedZip: Map<string, Uint8Array>, source: Record<string, unknown>): SplitResult {
  const basename = String(source.basename);
  const files = source.files as Array<Record<string, unknown>>;
  const spine = source.spine as string[];
  const toc = source.toc as TocEntry[];
  const rewrites = (source.rewrites ?? {}) as Record<string, Record<string, string>>;
  const items: ManifestItem[] = files.map((file) => ({
    id: String(file.id),
    href: String(file.href),
    mediaType: String(file.media_type),
    properties: (file.properties as string[] | undefined ?? []).filter((p) => p !== "nav")
  }));
  const zipEntries: ZipEntry[] = baseZipEntries();
  zipEntries.push({
    name: "OEBPS/nav.xhtml",
    data: buildVolumeNav(String(source.title), toc[0]?.href ?? "#", toc.map((entry) => ({ title: entry.title, href: entry.href, entries: [] })))
  });
  zipEntries.push({
    name: "OEBPS/content.opf",
    data: buildOpf(String(source.title), String(source.language ?? "en"), (source.creators as string[] | undefined) ?? [], items, spine, "nav.xhtml")
  });
  for (const file of files) {
    const mergedHref = String(file.merged_href);
    const originalHref = String(file.href);
    const data = mergedZip.get(`OEBPS/${mergedHref}`);
    if (!data) throw new ManifestError(`manifest references missing merged resource ${mergedHref}`);
    zipEntries.push({ name: `OEBPS/${originalHref}`, data: reverseRewrite(data, rewrites[originalHref] ?? {}) });
  }
  return { name: basename, data: writeZip(zipEntries) };
}

function reverseRewrite(data: Uint8Array, mapping: Record<string, string>): Uint8Array {
  let text = utf8Decode(data);
  for (const [oldHref, newHref] of Object.entries(mapping)) {
    text = text
      .replaceAll(`src="${newHref}"`, `src="${oldHref}"`)
      .replaceAll(`src='${newHref}'`, `src='${oldHref}'`)
      .replaceAll(`href="${newHref}"`, `href="${oldHref}"`)
      .replaceAll(`href='${newHref}'`, `href='${oldHref}'`);
  }
  return utf8Encode(text);
}
