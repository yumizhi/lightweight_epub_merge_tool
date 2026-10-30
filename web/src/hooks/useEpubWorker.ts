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
  const run = useCallback((task: WorkerTask): Promise<WorkerResponse> => {
    if (pending.current) throw new Error("A task is already running");
    if (!worker.current) {
      const instance = new Worker(
        new URL("../epub-worker.ts", import.meta.url),
        { type: "module" },
      );
      instance.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (!pending.current || pending.current.id !== data.requestId) return;
        const task = pending.current;
        pending.current = null;
        if (data.type === "error") task.reject(new Error(data.message));
        else task.resolve(data);
      };
      instance.onerror = (event) => {
        pending.current?.reject(
          new Error(event.message || "Worker failed to load"),
        );
        pending.current = null;
        instance.terminate();
        worker.current = null;
      };
      worker.current = instance;
    }
    return new Promise((resolve, reject) => {
      const id = ++sequence.current;
      pending.current = { id, resolve, reject };
      worker.current!.postMessage({ ...task, requestId: id });
    });
  }, []);
  return { run, cancel };
}
