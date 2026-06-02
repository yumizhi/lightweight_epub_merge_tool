export interface TocEntry {
  title: string;
  href: string;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface SourceBook {
  basename: string;
  sha256: string;
  opfPath: string;
  opfDir: string;
  title: string;
  language: string;
  creators: string[];
  manifestItems: ManifestItem[];
  spineIds: string[];
  toc: TocEntry[];
  itemData: Map<string, Uint8Array>;
}

export interface InputFile {
  name: string;
  data: Uint8Array;
}

export interface MergeOptions {
  title?: string;
  structure?: "volume" | "flat";
  inputOrder?: boolean;
}

export interface MergeResult {
  name: string;
  data: Uint8Array;
}

export interface SplitResult {
  name: string;
  data: Uint8Array;
}
