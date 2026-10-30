import type { MergeOptions, ProcessingProgress } from "../../ts/src/models.js";
import type { InspectReport } from "../../ts/src/inspect.js";
export type WorkerFile = { name: string; file: Blob };
export type WorkerTask =
  | { type: "analyze"; file: WorkerFile }
  | {
      type: "merge";
      outputName: string;
      files: WorkerFile[];
      options: MergeOptions;
    }
  | { type: "inspect"; file: WorkerFile }
  | { type: "split"; file: WorkerFile }
  | { type: "archive"; files: WorkerFile[] };
export type WorkerRequest = WorkerTask & { requestId: number };
export type WorkerResponse =
  | { type: "analyze"; title: string; chapters: number; orderKey?: number[] }
  | { type: "merge" | "archive"; name: string; blob: Blob }
  | { type: "split"; results: { name: string; blob: Blob }[] }
  | { type: "inspect"; report: InspectReport }
  | { type: "error"; message: string };
export type WorkerReply = (WorkerResponse | { type: "progress"; progress: ProcessingProgress }) & { requestId: number };
