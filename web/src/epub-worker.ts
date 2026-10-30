import { readBookSummary } from "../../ts/src/epub-io.js";
import {
  inspectEpub,
  mergeEpubFiles,
  splitEpubFile,
} from "../../ts/src/index.js";
import { orderKey } from "../../ts/src/ordering.js";
import { archiveFiles } from "../../ts/src/zip.js";
import type {
  WorkerFile,
  WorkerReply,
  WorkerRequest,
  WorkerResponse,
} from "./worker-protocol";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;
  const onProgress = (
    progress: import("../../ts/src/models.js").ProcessingProgress,
  ) => {
    if (
      progress.phase === "resources" &&
      progress.completed % 16 &&
      progress.completed !== progress.total
    )
      return;
    self.postMessage({
      type: "progress",
      progress,
      requestId: request.requestId,
    } satisfies WorkerReply);
  };
  try {
    if (request.type === "analyze") {
      const source = readBookSummary(await readFile(request.file));
      let key: number[] | undefined;
      try {
        key = orderKey(source);
      } catch {
        /* Manual ordering remains available. */
      }
      response = {
        type: "analyze",
        title: source.title,
        chapters: source.spineIds.length,
        orderKey: key,
      };
    } else if (request.type === "merge") {
      response = {
        type: "merge",
        ...(await mergeEpubFiles(
          request.outputName,
          request.files,
          request.options,
          { onProgress },
        )),
      };
    } else if (request.type === "inspect") {
      response = {
        type: "inspect",
        report: inspectEpub((await readFile(request.file)).data),
      };
    } else if (request.type === "split") {
      response = {
        type: "split",
        results: await splitEpubFile(request.file.file, { onProgress }),
      };
    } else {
      response = {
        type: "archive",
        name: "epub-volumes.zip",
        blob: await archiveFiles(request.files, onProgress),
      };
    }
  } catch (error) {
    response = {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  // Blob structured cloning shares immutable backing storage. No ArrayBuffer
  // result copy or full output concatenation is needed on the main thread.
  self.postMessage({
    ...response,
    requestId: request.requestId,
  } satisfies WorkerReply);
};
async function readFile(file: WorkerFile) {
  return {
    name: file.name,
    data: new Uint8Array(await file.file.arrayBuffer()),
  };
}
