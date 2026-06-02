import { readSourceBook } from "../../ts/src/epub-io.js";
import { inspectEpub, mergeEpubs, splitEpub } from "../../ts/src/index.js";
import { orderKey } from "../../ts/src/ordering.js";
import type { InputFile, MergeOptions } from "../../ts/src/models.js";

interface WorkerFile {
  id?: string;
  name: string;
  file?: File;
  data?: Uint8Array;
}

type WorkerRequest =
  | { requestId: number; type: "analyze"; file: WorkerFile }
  | { requestId: number; type: "merge"; outputName: string; files: WorkerFile[]; options: MergeOptions }
  | { requestId: number; type: "inspect"; file: WorkerFile }
  | { requestId: number; type: "split"; file: WorkerFile };

type WorkerResponse =
  | { requestId: number; type: "analyze"; id?: string; title: string; chapters: number; orderKey?: number[]; warning?: string }
  | { requestId: number; type: "merge"; name: string; data: Uint8Array }
  | { requestId: number; type: "inspect"; report: unknown }
  | { requestId: number; type: "split"; results: Array<{ name: string; data: Uint8Array }> }
  | { requestId: number; type: "error"; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleMessage(event.data);
};

async function handleMessage(request: WorkerRequest): Promise<void> {
  let response: WorkerResponse;
  try {
    response = await handleRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response = { requestId: request.requestId, type: "error", message };
  }
  postResponse(response);
}

async function handleRequest(request: WorkerRequest): Promise<WorkerResponse> {
  if (request.type === "analyze") {
    const input = await readWorkerFile(request.file);
    const source = readSourceBook(input);
    let key: number[] | undefined;
    let warning: string | undefined;
    try {
      key = orderKey(source);
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
    }
    return {
      requestId: request.requestId,
      type: "analyze",
      id: request.file.id,
      title: source.title,
      chapters: source.toc.length,
      orderKey: key,
      warning
    };
  }
  if (request.type === "merge") {
    const files = await Promise.all(request.files.map(readWorkerFile));
    const result = mergeEpubs(request.outputName, files, request.options);
    return { requestId: request.requestId, type: "merge", name: result.name, data: result.data };
  }
  if (request.type === "inspect") {
    const input = await readWorkerFile(request.file);
    return { requestId: request.requestId, type: "inspect", report: inspectEpub(input.data) };
  }
  const input = await readWorkerFile(request.file);
  const results = splitEpub(input.data);
  return { requestId: request.requestId, type: "split", results };
}

async function readWorkerFile(file: WorkerFile): Promise<InputFile> {
  if (file.data) return { name: file.name, data: file.data };
  if (file.file) return { name: file.name, data: new Uint8Array(await file.file.arrayBuffer()) };
  throw new Error(`${file.name}: missing file data`);
}

function postResponse(response: WorkerResponse): void {
  const transferables: Transferable[] = [];
  if (response.type === "merge") addTransferableBuffer(response.data, transferables);
  if (response.type === "split") {
    for (const result of response.results) addTransferableBuffer(result.data, transferables);
  }
  self.postMessage(response, transferables);
}

function addTransferableBuffer(data: Uint8Array, transferables: Transferable[]): void {
  if (data.buffer instanceof ArrayBuffer) transferables.push(data.buffer);
}
