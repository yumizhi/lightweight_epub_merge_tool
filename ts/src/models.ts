export interface TocEntry {
  title: string;
  href: string;
  depth?: number;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface PackageMetadata {
  identifier?: string;
  publisher?: string;
  description?: string;
  rights?: string;
  date?: string;
  subjects?: string[];
  pageProgressionDirection?: string;
  spine?: Array<{ linear?: string; properties?: string }>;
}

export interface SourceBook {
  version: string;
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
  packageMetadata?: PackageMetadata;
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

export interface BlobInput {
  name: string;
  file: Blob;
}
export interface BlobResult {
  name: string;
  blob: Blob;
}
export interface ProcessingProgress {
  phase: "reading" | "resources" | "writing" | "restoring" | "packing";
  completed: number;
  total: number;
  file?: string;
}
export interface ExecutionOptions {
  onProgress?: (progress: ProcessingProgress) => void;
  signal?: AbortSignal;
}
