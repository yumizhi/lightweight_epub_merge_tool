import { unzipSync, zipSync, type Zippable } from "fflate";

export type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  level?: ZipLevel;
}

export function readZip(data: Uint8Array): Map<string, Uint8Array> {
  const raw = unzipSync(data);
  return new Map(Object.entries(raw));
}

export function writeZip(entries: ZipEntry[]): Uint8Array {
  const zippable: Zippable = {};
  for (const entry of entries) {
    zippable[entry.name] = [entry.data, { level: entry.level ?? 6 }];
  }
  return zipSync(zippable);
}
