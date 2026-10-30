import type { ProcessingProgress } from "../../../ts/src/models.js";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { InspectReport } from "../../../ts/src/inspect.js";
import type { Copy } from "../i18n";
import { useEpubWorker } from "./useEpubWorker";
export type Mode = "merge" | "split" | "inspect";
export type BookFile = {
  id: string;
  file: File;
  title?: string;
  chapters?: number;
  orderKey?: number[];
  status: "reading" | "ready" | "error";
  error?: string;
};
export type OutputFile = { name: string; blob: Blob; url: string };
const workerFile = (file: File) => ({ name: file.name, file });
const isCancelled = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";
export function useWorkspace(copy: Copy) {
  const [mode, setMode] = useState<Mode>("merge");
  const [books, setBooks] = useState<BookFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [report, setReport] = useState<InspectReport | null>(null);
  const [title, setTitle] = useState("");
  const [outputName, setOutputName] = useState("collection.epub");
  const [structure, setStructure] = useState<"volume" | "flat">("volume");
  const { run, cancel } = useEpubWorker();
  const generation = useRef(0);
  const locked = busy || reading;
  useEffect(
    () => () => outputs.forEach((o) => URL.revokeObjectURL(o.url)),
    [outputs],
  );
  const invalidate = () => {
    setOutputs([]);
    setReport(null);
    setError("");
    setProgress(null);
  };
  function reset() {
    generation.current++;
    cancel();
    setBooks([]);
    setBusy(false);
    setReading(false);
    invalidate();
  }
  function changeMode(value: Mode) {
    reset();
    setMode(value);
  }
  async function add(files: File[]) {
    if (locked) return;
    if (!files.length) return;
    if (files.some((f) => !f.name.toLowerCase().endsWith(".epub"))) {
      setError(copy.unsupported);
      return;
    }
    if (mode !== "merge" && files.length !== 1) {
      setError(copy.single);
      return;
    }
    invalidate();
    const records: BookFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "reading",
    }));
    setBooks((current) =>
      mode === "merge" ? [...current, ...records] : records,
    );
    setReading(true);
    const current = generation.current;
    for (const record of records) {
      try {
        const response = await run({
          type: "analyze",
          file: workerFile(record.file),
        });
        if (current !== generation.current) return;
        if (response.type === "analyze")
          setBooks((books) =>
            books.map((b) =>
              b.id === record.id ? { ...b, ...response, status: "ready" } : b,
            ),
          );
      } catch (error) {
        if (current !== generation.current || isCancelled(error)) return;
        setBooks((books) =>
          books.map((b) =>
            b.id === record.id
              ? {
                  ...b,
                  status: "error",
                  error: String(error instanceof Error ? error.message : error),
                }
              : b,
          ),
        );
      }
    }
    if (current === generation.current) setReading(false);
  }
  function stop() {
    generation.current++;
    cancel();
    setBooks((books) => books.filter((b) => b.status !== "reading"));
    setBusy(false);
    setReading(false);
    setProgress(null);
    toast(copy.cancelled);
  }
  function move(index: number, direction: number) {
    invalidate();
    setBooks((books) => {
      const next = [...books];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  function remove(id: string) {
    invalidate();
    setBooks((books) => books.filter((b) => b.id !== id));
  }
  function sort() {
    const keys = books.map((b) => b.orderKey?.join("."));
    if (keys.some((k) => !k) || new Set(keys).size !== books.length) {
      toast.error(copy.autoError);
      return;
    }
    invalidate();
    setBooks((books) =>
      [...books].sort((a, b) => {
        const x = a.orderKey!,
          y = b.orderKey!;
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
          const d = (x[i] ?? -1) - (y[i] ?? -1);
          if (d) return d;
        }
        return 0;
      }),
    );
    toast.success(copy.autoDone);
  }
  function createOutput(name: string, blob: Blob): OutputFile {
    return { name, blob, url: URL.createObjectURL(blob) };
  }
  async function process() {
    if (locked || !books.length || books.some((b) => b.status !== "ready"))
      return;
    invalidate();
    setBusy(true);
    const current = generation.current;
    try {
      const response = await run(
        mode === "merge"
          ? {
              type: "merge",
              files: books.map((b) => workerFile(b.file)),
              outputName:
                (outputName.trim() || "collection").replace(/\.epub$/i, "") +
                ".epub",
              options: {
                title: title.trim() || undefined,
                structure,
                inputOrder: true,
              },
            }
          : { type: mode, file: workerFile(books[0].file) },
        (progress) => {
          if (current === generation.current) setProgress(progress);
        },
      );
      if (current !== generation.current) return;
      if (response.type === "merge")
        setOutputs([createOutput(response.name, response.blob)]);
      if (response.type === "split")
        setOutputs(response.results.map((r) => createOutput(r.name, r.blob)));
      if (response.type === "inspect") setReport(response.report);
      toast.success(copy.completed);
    } catch (error) {
      if (current === generation.current && !isCancelled(error)) {
        setError(error instanceof Error ? error.message : String(error));
        toast.error(copy.error);
      }
    } finally {
      if (current === generation.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }
  function download(output: OutputFile) {
    const link = document.createElement("a");
    link.href = output.url;
    link.download = output.name;
    link.click();
    toast.success(copy.downloadStarted);
  }
  async function downloadAll() {
    if (locked || !outputs.length) return;
    setError("");
    setProgress(null);
    setBusy(true);
    const current = generation.current;
    try {
      const response = await run(
        {
          type: "archive",
          files: outputs.map((o) => ({ name: o.name, file: o.blob })),
        },
        (progress) => {
          if (current === generation.current) setProgress(progress);
        },
      );
      if (current !== generation.current) return;
      if (response.type === "archive") {
        const output = createOutput(response.name, response.blob);
        download(output);
        // Give the browser time to consume the object URL, then release it.
        setTimeout(() => URL.revokeObjectURL(output.url), 60_000);
      }
    } catch (error) {
      if (current === generation.current && !isCancelled(error))
        setError(String(error));
    } finally {
      if (current === generation.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }
  return {
    mode,
    changeMode,
    books,
    busy,
    progress,
    reading,
    locked,
    error,
    outputs,
    report,
    title,
    setTitle: (value: string) => {
      invalidate();
      setTitle(value);
    },
    outputName,
    setOutputName: (value: string) => {
      invalidate();
      setOutputName(value);
    },
    structure,
    setStructure: (value: "volume" | "flat") => {
      invalidate();
      setStructure(value);
    },
    add,
    reset,
    stop,
    move,
    remove,
    sort,
    process,
    download,
    downloadAll,
  };
}
