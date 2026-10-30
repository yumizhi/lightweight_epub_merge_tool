import { EpubMergeError } from "./errors.js";
import {
  baseZipEntries,
  buildFlatNav,
  buildOpf,
  buildVolumeNav,
  MERGE_MANIFEST_PATH,
  readBookSummary,
} from "./epub-io.js";
import type {
  InputFile,
  ManifestItem,
  MergeOptions,
  MergeResult,
  TocEntry,
  SourceBook,
  BlobInput,
  BlobResult,
  ExecutionOptions,
} from "./models.js";
import { safeBasename, sha256, utf8Encode } from "./utils.js";
import { createZipOutput, joinChunks, readZip, type ZipEntry } from "./zip.js";
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

export function mergeEpubs(outputName: string, inputs: InputFile[], options: MergeOptions = {}): MergeResult {
  const output = createZipOutput();
  const job = mergeEntries(outputName, inputs.map((input) => input.name), options);
  let next = job.next();
  while (!next.done) {
    if (typeof next.value === "number") next = job.next(inputs[next.value]);
    else { output.add(next.value); next = job.next(); }
  }
  return { name: outputName, data: joinChunks(output.finish()) };
}

// Blob inputs are loaded one at a time, inside the Worker or the caller's runtime.
// The synchronous API and this entry point consume exactly the same merge plan.
export async function mergeEpubFiles(outputName: string, inputs: BlobInput[], options: MergeOptions = {}, execution: ExecutionOptions = {}): Promise<BlobResult> {
  const output = createZipOutput();
  const job = mergeEntries(outputName, inputs.map((input) => input.name), options, execution);
  let next = job.next();
  while (!next.done) {
    execution.signal?.throwIfAborted();
    if (typeof next.value === "number") {
      const file = inputs[next.value];
      next = job.next({ name: file.name, data: new Uint8Array(await file.file.arrayBuffer()) });
    } else { output.add(next.value); next = job.next(); }
  }
  return { name: outputName, blob: new Blob(output.finish(), { type: "application/epub+zip" }) };
}

interface PlannedResource {
  item: ManifestItem;
  sourcePath: string;
  targetHref: string;
  canonicalHref: string;
  action: "copy" | "rewrite" | "deduplicate";
  level: 0 | 6;
}
function planSource(source: SourceBook, index: number) {
  const resources: PlannedResource[] = source.manifestItems.filter((item) => item.mediaType !== "application/x-dtbncx+xml").map((item) => {
    const sourcePath = resolvePath(source.opfDir, item.href);
    const targetHref = encodePath(`v${index + 1}/${sourcePath}`);
    return { item, sourcePath, targetHref, canonicalHref: targetHref, action: "copy", level: /image\/(?:png|jpeg|gif|webp|avif)|font\/woff2/.test(item.mediaType) ? 0 : 6 };
  });
  return { resources, paths: new Map(resources.map((resource) => [resource.sourcePath, resource.targetHref])) };
}
function readResource(input: InputFile, path: string): Uint8Array {
  const data = readZip(input.data, new Set([path])).get(path);
  if (!data) throw new EpubMergeError(`${input.name}: missing resource ${path}`);
  return data;
}

function* mergeEntries(outputName: string, names: string[], options: MergeOptions, execution: ExecutionOptions = {}): Generator<ZipEntry | number, void, InputFile | undefined> {
  const structure = options.structure ?? "volume";
  if (structure !== "volume" && structure !== "flat")
    throw new EpubMergeError("structure must be 'volume' or 'flat'");
  if (!names.length)
    throw new EpubMergeError("At least one input EPUB is required");

  rejectDuplicateBasenames(names.map((name) => ({ name })));
  const summaries = new Map<number, SourceBook>();
  let order = names.map((_, index) => index);
  if (!options.inputOrder) {
    for (const index of order) {
      execution.onProgress?.({ phase: "reading", completed: index, total: names.length, file: names[index] });
      const input = (yield index)!;
      summaries.set(index, readBookSummary(input));
    }
    const byName = new Map(names.map((name, index) => [safeBasename(name), index]));
    order = sortSources([...summaries.values()]).map((source) => byName.get(source.basename)!);
  }

  const title = options.title ?? outputName.replace(/\.epub$/i, "");
  yield* baseZipEntries();
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
  let language = "en";
  const creators = new Set<string>();
  const spineProperties: NonNullable<import("./models.js").PackageMetadata["spine"]> = [];
  let pageProgressionDirection: string | undefined;

  for (const [sourceIndex, inputIndex] of order.entries()) {
    execution.onProgress?.({ phase: "reading", completed: sourceIndex, total: order.length, file: names[inputIndex] });
    const input = (yield inputIndex)!;
    const source = summaries.get(inputIndex) ?? readBookSummary(input);
    const plan = planSource(source, sourceIndex);
    const hrefMap = plan.paths;
    let completed = 0;
    const progress = () => execution.onProgress?.({ phase: "resources", completed, total: plan.resources.length, file: source.basename });
    if (sourceIndex === 0) {
      language = source.language;
      pageProgressionDirection = source.packageMetadata?.pageProgressionDirection;
    }
    spineProperties.push(...source.spineIds.map((_, index) => source.packageMetadata?.spine?.[index] ?? {}));
    for (const creator of source.creators) creators.add(creator);
    const idMap = new Map<string, string>();
    const fileRecords: Record<string, unknown>[] = [];
    const rewrites: Record<string, Record<string, string>> = {};

    // Binary resources cannot contain local references. Resolve their pooling
    // before processing documents, and write each unique resource immediately.
    for (const resource of plan.resources) {
      const item = resource.item;
      let finalHref = resource.targetHref;
      if (canPool(item.mediaType)) {
        const data = readResource(input, resource.sourcePath);
        const key = `${item.mediaType.toLowerCase()}:${sha256(data)}`;
        finalHref = resourcePool.get(key) ?? finalHref;
        resourcePool.set(key, finalHref);
        resource.canonicalHref = finalHref;
        resource.action = finalHref === resource.targetHref ? "copy" : "deduplicate";
        hrefMap.set(resource.sourcePath, resource.canonicalHref);
        const name = `OEBPS/${decodeURIComponent(finalHref)}`;
        if (resource.action !== "deduplicate" && !written.has(name)) {
          written.add(name);
          yield { name, data, level: resource.level };
        }
        completed++; progress();
      }
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
      if (!hasCover && item.properties.includes("cover-image")) {
        outputItems.find((output) => output.id === ownerId)!.properties.push("cover-image");
        hasCover = true;
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

    for (const resource of plan.resources) {
      const item = resource.item;
      if (canPool(item.mediaType)) continue;
      const original = readResource(input, resource.sourcePath);
      const rewriteMap: Record<string, string> = {};
      const data = rewriteReferences(original, item.mediaType, (href) => {
        const result = remapReference(href, resource.sourcePath, decodeURIComponent(resource.targetHref), hrefMap);
        if (result !== href) rewriteMap[href] = result;
        return result;
      });
      resource.action = data === original ? "copy" : "rewrite";
      if (Object.keys(rewriteMap).length) rewrites[item.href] = rewriteMap;
      yield { name: `OEBPS/${decodeURIComponent(resource.targetHref)}`, data: resource.action === "copy" ? original : data, level: resource.level };
      completed++; progress();
    }

    for (const id of source.spineIds) spineIds.push(idMap.get(id)!);
    const remapped = source.toc.map((entry) => ({
      ...entry,
      href: remapReference(
        entry.href,
        source.opfPath,
        "nav-merged.xhtml",
        hrefMap,
      ),
    }));
    if (firstHref === "#") firstHref = remapped.find((entry) => entry.href)?.href ?? "#";
    volumeToc.push({
      title: source.title,
      href: remapped.find((entry) => entry.href)?.href ?? "#",
      entries: remapped,
    });
    flatToc.push(...remapped.map((entry) => ({ ...entry, depth: 0 })));
    manifestSources.push({
      basename: source.basename,
      title: source.title,
      language: source.language,
      creators: source.creators,
      opf_path: source.opfPath,
      package_metadata: source.packageMetadata,
      files: fileRecords,
      spine: source.spineIds,
      toc: source.toc,
      rewrites,
    });
  }

  execution.onProgress?.({ phase: "writing", completed: order.length, total: order.length });
  yield {
    name: "OEBPS/nav-merged.xhtml",
    data:
      structure === "flat"
        ? buildFlatNav(title, firstHref, flatToc)
        : buildVolumeNav(title, firstHref, volumeToc),
  };
  yield {
    name: "OEBPS/content.opf",
    data: buildOpf(title, language, [...creators], outputItems, spineIds, "nav-merged.xhtml", { spine: spineProperties, pageProgressionDirection }),
  };
  yield {
    name: MERGE_MANIFEST_PATH,
    data: utf8Encode(
      JSON.stringify(
        {
          schema: "epub-merge-tool/v1",
          tool_version: "1.1.0",
          structure,
          title,
          language: language,
          sources: manifestSources,
        },
        null,
        2,
      ),
    ),
  };
}

function rejectDuplicateBasenames(inputs: Array<{ name: string }>): void {
  const seen = new Set<string>();
  for (const input of inputs) {
    const basename = safeBasename(input.name);
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
