import { ManifestError } from "./errors.js";
import {
  baseZipEntries,
  buildOpf,
  buildFlatNav,
  MERGE_MANIFEST_PATH,
  requireMergeManifest,
} from "./epub-io.js";
import type { SplitResult, TocEntry, ManifestItem, PackageMetadata } from "./models.js";
import { archivePath, resolvePath, rewriteReferences } from "./resources.js";
import { dirnamePosix, safeBasename } from "./utils.js";
import { readZip, writeZip, type ZipEntry } from "./zip.js";

export function splitEpub(input: Uint8Array): SplitResult[] {
  const zip = readZip(input);
  const manifestData = zip.get(MERGE_MANIFEST_PATH);
  if (!manifestData)
    throw new ManifestError(
      "This EPUB has no merge record. Split requires a book merged with this tool.",
    );
  const manifest = requireMergeManifest(manifestData);
  const sources = manifest.sources as Array<Record<string, unknown>>;
  return sources.map((source) => splitSource(zip, source));
}

function splitSource(
  mergedZip: Map<string, Uint8Array>,
  source: Record<string, unknown>,
): SplitResult {
  const basename = safeBasename(String(source.basename));
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
  const zipEntries: ZipEntry[] = baseZipEntries(opfPath);
  zipEntries.push({
    name: resolvePath(opfDir, navHref),
    data: buildFlatNav(String(source.title), toc[0]?.href ?? "#", toc),
  });
  zipEntries.push({
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
  });
  for (const file of files) {
    const mergedHref = String(file.merged_href);
    const originalHref = String(file.href);
    const data = mergedZip.get(resolvePath("OEBPS", mergedHref));
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
    zipEntries.push({
      name: resolvePath(opfDir, originalHref),
      data: restored,
    });
  }
  return { name: basename, data: writeZip(zipEntries) };
}
