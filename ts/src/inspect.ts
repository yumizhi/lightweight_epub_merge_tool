import {
  MERGE_MANIFEST_PATH,
  readBookSummary,
  requireMergeManifest,
} from "./epub-io.js";
import { readZip } from "./zip.js";
import type { TocEntry } from "./models.js";
export interface InspectReport {
  tool_generated: boolean;
  schema?: string;
  structure: string;
  title: string;
  language: string;
  creators: string[];
  version: string;
  opf_path: string;
  resources: number;
  spine: string[];
  toc: TocEntry[];
  sources: string[];
}
export function inspectEpub(input: Uint8Array): InspectReport {
  const book = readBookSummary({ name: "book.epub", data: input });
  const record = readZip(input, new Set([MERGE_MANIFEST_PATH])).get(
    MERGE_MANIFEST_PATH,
  );
  const manifest = record ? requireMergeManifest(record) : undefined;
  return {
    tool_generated: !!manifest,
    schema: manifest ? String(manifest.schema) : undefined,
    structure: manifest ? String(manifest.structure) : "original",
    title: book.title,
    language: book.language,
    creators: book.creators,
    version: book.version,
    opf_path: book.opfPath,
    resources: book.manifestItems.length,
    spine: book.spineIds.map(
      (id) => book.manifestItems.find((item) => item.id === id)!.href,
    ),
    toc: book.toc,
    sources: manifest
      ? (manifest.sources as Array<Record<string, unknown>>).map((source) =>
          String(source.basename),
        )
      : [],
  };
}
