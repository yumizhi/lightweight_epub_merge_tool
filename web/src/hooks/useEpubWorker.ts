import type { ProcessingProgress } from "../../../ts/src/models.js";
import { useCallback, useEffect, useRef } from "react";
import type {
  WorkerReply,
  WorkerResponse,
  WorkerTask,
} from "../worker-protocol";

export function useEpubWorker() {
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const pending = useRef<{
    id: number;
    onProgress?: (progress: ProcessingProgress) => void;
    resolve: (reply: WorkerResponse) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    pending.current?.reject(new DOMException("Task cancelled", "AbortError"));
    pending.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const run = useCallback(
    (
      task: WorkerTask,
      onProgress?: (progress: ProcessingProgress) => void,
    ): Promise<WorkerResponse> => {
      if (pending.current) throw new Error("A task is already running");
      if (!worker.current) {
        const instance = new Worker(
          new URL("../epub-worker.ts", import.meta.url),
          { type: "module" },
        );
        instance.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
          if (!pending.current || pending.current.id !== data.requestId) return;
          const task = pending.current;
          if (data.type === "progress") {
            task.onProgress?.(data.progress);
            return;
          }
          pending.current = null;
          if (data.type === "error") task.reject(new Error(data.message));
          else task.resolve(data);
        };
        const fail = (message: string) => {
          if (worker.current !== instance) return;
          pending.current?.reject(new Error(message));
          pending.current = null;
          instance.terminate();
          worker.current = null;
        };
        instance.onerror = (event) =>
          fail(event.message || "Worker failed to load");
        instance.onmessageerror = () =>
          fail("Worker response could not be read");
        worker.current = instance;
      }
      return new Promise((resolve, reject) => {
        const id = ++sequence.current;
        pending.current = { id, resolve, reject, onProgress };
        try {
          worker.current!.postMessage({ ...task, requestId: id });
        } catch (error) {
          pending.current = null;
          worker.current!.terminate();
          worker.current = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [],
  );
  return { run, cancel };
}
