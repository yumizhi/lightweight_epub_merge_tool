import { readSourceBook } from "../../ts/src/epub-io.js";
import { inspectEpub, mergeEpubs, splitEpub } from "../../ts/src/index.js";
import { orderKey } from "../../ts/src/ordering.js";
import { writeZip } from "../../ts/src/zip.js";
import type { WorkerFile, WorkerReply, WorkerRequest, WorkerResponse } from "./worker-protocol";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;
  try {
    if (request.type === "analyze") {
      const source = readSourceBook(await readFile(request.file));
      let key: number[] | undefined;
      try { key = orderKey(source); } catch { /* Manual ordering remains available. */ }
      response = { type: "analyze", title: source.title, chapters: source.spineIds.length, orderKey: key };
    } else if (request.type === "merge") {
      const inputs = [];
      for (const file of request.files) inputs.push(await readFile(file));
      response = { type: "merge", ...mergeEpubs(request.outputName, inputs, request.options) };
    } else if (request.type === "inspect") {
      response = { type: "inspect", report: inspectEpub((await readFile(request.file)).data) };
    } else if (request.type === "split") {
      response = { type: "split", results: splitEpub((await readFile(request.file)).data) };
    } else {
      const entries = [];
      for (const file of request.files) entries.push({ ...await readFile(file), level: 0 as const });
      response = { type: "archive", name: "epub-volumes.zip", data: writeZip(entries) };
    }
  } catch (error) {
    response = { type: "error", message: error instanceof Error ? error.message : String(error) };
  }
  const buffers: Transferable[] = [];
  if (response.type === "merge" || response.type === "archive") buffers.push(response.data.buffer as ArrayBuffer);
  if (response.type === "split") for (const file of response.results) buffers.push(file.data.buffer as ArrayBuffer);
  self.postMessage({ ...response, requestId: request.requestId } satisfies WorkerReply, { transfer: buffers });
};
async function readFile(file: WorkerFile) {
  return { name: file.name, data: new Uint8Array(await file.file.arrayBuffer()) };
}
