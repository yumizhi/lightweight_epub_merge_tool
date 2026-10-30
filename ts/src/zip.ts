import { unzipSync, Zip, ZipDeflate, ZipPassThrough } from "fflate";

export type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  level?: ZipLevel;
}

export function readZip(
  data: Uint8Array,
  names?: Set<string>,
): Map<string, Uint8Array> {
  const raw = unzipSync(
    data,
    names ? { filter: (entry) => names.has(entry.name) } : {},
  );
  return new Map(Object.entries(raw));
}

// Entries are compressed as they arrive. Only output chunks and the current
// uncompressed member remain live; this is not compressed-data pass-through.
export function createZipOutput() {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let error: Error | null = null;
  const zip = new Zip((failure, chunk) => {
    if (failure) error = failure;
    else chunks.push(chunk as Uint8Array<ArrayBuffer>);
  });
  const names = new Set<string>();
  return {
    add(entry: ZipEntry) {
      if (names.has(entry.name))
        throw new Error(`Duplicate ZIP entry: ${entry.name}`);
      names.add(entry.name);
      const stream =
        entry.level === 0
          ? new ZipPassThrough(entry.name)
          : new ZipDeflate(entry.name, { level: entry.level ?? 6 });
      zip.add(stream);
      stream.push(entry.data, true);
      if (error) throw error;
    },
    finish() {
      zip.end();
      if (error) throw error;
      return chunks;
    },
  };
}
export function joinChunks(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
export function writeZip(entries: Iterable<ZipEntry>): Uint8Array {
  const writer = createZipOutput();
  for (const entry of entries) writer.add(entry);
  return joinChunks(writer.finish());
}

export function zipNames(data: Uint8Array): Set<string> {
  const names = new Set<string>();
  unzipSync(data, {
    filter: (entry) => {
      names.add(entry.name);
      return false;
    },
  });
  return names;
}

export async function archiveFiles(
  files: import("./models.js").BlobInput[],
  onProgress?: (progress: import("./models.js").ProcessingProgress) => void,
): Promise<Blob> {
  const writer = createZipOutput();
  for (const [index, file] of files.entries()) {
    writer.add({
      name: file.name,
      data: new Uint8Array(await file.file.arrayBuffer()),
      level: 0,
    });
    onProgress?.({
      phase: "packing",
      completed: index + 1,
      total: files.length,
      file: file.name,
    });
  }
  return new Blob(writer.finish(), { type: "application/zip" });
}
