import { ManifestError } from "./errors.js";
import { MERGE_MANIFEST_PATH, requireMergeManifest } from "./epub-io.js";
import { readZip } from "./zip.js";

export interface InspectReport {
  tool_generated: true;
  schema: string;
  structure: string;
  title: string;
  sources: string[];
}

export function inspectEpub(input: Uint8Array): InspectReport {
  const zip = readZip(input);
  const manifestData = zip.get(MERGE_MANIFEST_PATH);
  if (!manifestData) throw new ManifestError("missing epub-merge-tool manifest");
  const manifest = requireMergeManifest(manifestData);
  const sources = manifest.sources as Array<Record<string, unknown>>;
  return {
    tool_generated: true,
    schema: String(manifest.schema),
    structure: String(manifest.structure),
    title: String(manifest.title),
    sources: sources.map((source) => String(source.basename))
  };
}
