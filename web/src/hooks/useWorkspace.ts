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
  summary?: InspectReport;
  orderKey?: number[];
  status: "reading" | "ready" | "error";
  error?: string;
};
export type OutputFile = { name: string; blob: Blob; url: string };
type Session = {
  books: BookFile[];
  outputs: OutputFile[];
  report: InspectReport | null;
  error: string;
  stale: boolean;
};
type Task = {
  mode: Mode;
  kind: "reading" | "processing" | "packing";
  progress: ProcessingProgress | null;
};
const emptySession = (): Session => ({
  books: [],
  outputs: [],
  report: null,
  error: "",
  stale: false,
});
const workerFile = (file: File) => ({ name: file.name, file });
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const isCancelled = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";
const invalidated = (session: Session): Session => ({
  ...session,
  outputs: [],
  report: null,
  error: "",
  stale: session.stale || session.outputs.length > 0 || !!session.report,
});

export function useWorkspace(copy: Copy) {
  const [mode, setMode] = useState<Mode>("merge");
  const [sessions, setSessions] = useState<Record<Mode, Session>>({
    merge: emptySession(),
    split: emptySession(),
    inspect: emptySession(),
  });
  const [task, setTask] = useState<Task | null>(null);
  const taskRef = useRef<Task | null>(null);
  const [title, setTitle] = useState("");
  const [outputName, setOutputName] = useState("collection.epub");
  const [structure, setStructure] = useState<"volume" | "flat">("volume");
  const { run, cancel } = useEpubWorker();
  const generation = useRef(0);
  const urls = useRef(new Set<string>());
  const temporaryUrls = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const active = sessions[mode];

  // A mode switch leaves URLs alive. Only removed results and unmount release them.
  useEffect(() => {
    const next = new Set(
      Object.values(sessions).flatMap((s) => s.outputs.map((o) => o.url)),
    );
    for (const url of urls.current)
      if (!next.has(url)) URL.revokeObjectURL(url);
    urls.current = next;
  }, [sessions]);
  useEffect(
    () => () => {
      generation.current++;
      for (const url of urls.current) URL.revokeObjectURL(url);
      for (const [url, timer] of temporaryUrls.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  function update(target: Mode, change: (session: Session) => Session) {
    setSessions((current) => ({
      ...current,
      [target]: change(current[target]),
    }));
  }
  function begin(target: Mode, kind: Task["kind"]) {
    const next = { mode: target, kind, progress: null };
    taskRef.current = next;
    setTask(next);
    return ++generation.current;
  }
  function finish(current: number) {
    if (current !== generation.current) return;
    taskRef.current = null;
    setTask(null);
  }
  function onProgress(current: number, progress: ProcessingProgress) {
    if (current === generation.current)
      setTask((task) => task && { ...task, progress });
  }
  function stop() {
    const target = taskRef.current?.mode;
    generation.current++;
    cancel();
    taskRef.current = null;
    setTask(null);
    if (target)
      update(target, (s) => ({
        ...s,
        books: s.books.filter((b) => b.status !== "reading"),
      }));
    toast(copy.cancelled);
  }
  function reset() {
    if (taskRef.current) return;
    update(mode, emptySession);
  }
  async function add(
    files: File[],
    target: Mode = mode,
    inspectResult = false,
  ) {
    if (taskRef.current || !files.length) return;
    if (files.some((f) => !f.name.toLowerCase().endsWith(".epub"))) {
      update(target, (s) => ({ ...s, error: copy.unsupported }));
      return;
    }
    if (target !== "merge" && files.length !== 1) {
      update(target, (s) => ({ ...s, error: copy.single }));
      return;
    }
    const records: BookFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "reading",
    }));
    update(target, (s) => ({
      ...invalidated(s),
      books: target === "merge" ? [...s.books, ...records] : records,
    }));
    const current = begin(target, "reading");
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      onProgress(current, {
        phase: "reading",
        completed: index,
        total: records.length,
        file: record.file.name,
      });
      try {
        const response = await run({
          type: "analyze",
          file: workerFile(record.file),
        });
        if (current !== generation.current) return;
        if (response.type === "analyze")
          update(target, (s) => ({
            ...s,
            books: s.books.map((b) =>
              b.id === record.id
                ? {
                    ...b,
                    summary: response.report,
                    title: response.report.title,
                    chapters: response.report.spine.length,
                    orderKey: response.orderKey,
                    status: "ready",
                  }
                : b,
            ),
            ...(inspectResult ? { report: response.report, stale: false } : {}),
          }));
      } catch (error) {
        if (current !== generation.current || isCancelled(error)) return;
        update(target, (s) => ({
          ...s,
          books: s.books.map((b) =>
            b.id === record.id
              ? { ...b, status: "error", error: message(error) }
              : b,
          ),
        }));
      }
    }
    finish(current);
  }
  function reorder(from: number, to: number) {
    if (taskRef.current || from === to || to < 0 || to >= active.books.length)
      return;
    update(mode, (s) => {
      const books = [...s.books];
      books.splice(to, 0, books.splice(from, 1)[0]);
      return { ...invalidated(s), books };
    });
  }
  function remove(id: string) {
    if (taskRef.current) return;
    update(mode, (s) => ({
      ...invalidated(s),
      books: s.books.filter((b) => b.id !== id),
    }));
  }
  function sort() {
    if (taskRef.current) return;
    const keys = active.books.map((b) => b.orderKey?.join("."));
    if (keys.some((k) => !k) || new Set(keys).size !== active.books.length) {
      toast.error(copy.autoError);
      return;
    }
    update(mode, (s) => ({
      ...invalidated(s),
      books: [...s.books].sort((a, b) => {
        const x = a.orderKey!,
          y = b.orderKey!;
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
          const d = (x[i] ?? -1) - (y[i] ?? -1);
          if (d) return d;
        }
        return 0;
      }),
    }));
    toast.success(copy.autoDone);
  }
  function createOutput(name: string, blob: Blob): OutputFile {
    return { name, blob, url: URL.createObjectURL(blob) };
  }
  async function process() {
    const { books } = active;
    if (
      taskRef.current ||
      !books.length ||
      books.some((b) => b.status !== "ready")
    )
      return;
    if (mode === "inspect") {
      update(mode, (s) => ({
        ...s,
        report: books[0].summary!,
        error: "",
        stale: false,
      }));
      return;
    }
    if (mode === "split" && !books[0].summary?.tool_generated) return;
    const target = mode;
    update(target, (s) => ({ ...invalidated(s), stale: false }));
    const current = begin(target, "processing");
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
          : { type: "split", file: workerFile(books[0].file) },
        (progress) => onProgress(current, progress),
      );
      if (current !== generation.current) return;
      if (response.type === "merge") {
        const outputs = [createOutput(response.name, response.blob)];
        update(target, (s) => ({ ...s, outputs }));
      }
      if (response.type === "split") {
        const outputs = response.results.map((r) =>
          createOutput(r.name, r.blob),
        );
        update(target, (s) => ({ ...s, outputs }));
      }
      toast.success(copy.completed);
    } catch (error) {
      if (current === generation.current && !isCancelled(error)) {
        update(target, (s) => ({ ...s, error: message(error) }));
        toast.error(copy.error);
      }
    } finally {
      finish(current);
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
    if (taskRef.current || !active.outputs.length) return;
    const target = mode;
    update(target, (s) => ({ ...s, error: "" }));
    const current = begin(target, "packing");
    try {
      const response = await run(
        {
          type: "archive",
          files: active.outputs.map((o) => ({ name: o.name, file: o.blob })),
        },
        (progress) => onProgress(current, progress),
      );
      if (current !== generation.current) return;
      if (response.type === "archive") {
        const output = createOutput(response.name, response.blob);
        download(output);
        // Let the browser consume the download URL; clean it on unmount too.
        temporaryUrls.current.set(
          output.url,
          setTimeout(() => {
            URL.revokeObjectURL(output.url);
            temporaryUrls.current.delete(output.url);
          }, 60_000),
        );
      }
    } catch (error) {
      if (current === generation.current && !isCancelled(error))
        update(target, (s) => ({ ...s, error: message(error) }));
    } finally {
      finish(current);
    }
  }
  function useOutput(output: OutputFile, target: "inspect" | "split") {
    if (taskRef.current) return;
    setMode(target);
    // File/Blob construction shares immutable bytes; no download or ZIP round trip.
    void add(
      [new File([output.blob], output.name, { type: "application/epub+zip" })],
      target,
      target === "inspect",
    );
  }
  function edit(setting: () => void) {
    if (taskRef.current) return;
    update("merge", invalidated);
    setting();
  }
  return {
    ...active,
    mode,
    changeMode: setMode,
    task,
    locked: !!task,
    busy: task?.kind !== "reading" && !!task,
    reading: task?.kind === "reading",
    progress: task?.progress ?? null,
    title,
    setTitle: (value: string) => edit(() => setTitle(value)),
    outputName,
    setOutputName: (value: string) => edit(() => setOutputName(value)),
    structure,
    setStructure: (value: "volume" | "flat") => edit(() => setStructure(value)),
    add,
    reset,
    stop,
    reorder,
    move: (index: number, direction: number) =>
      reorder(index, index + direction),
    remove,
    sort,
    process,
    download,
    downloadAll,
    useOutput,
    saved: Object.fromEntries(
      Object.entries(sessions).map(([key, s]) => [key, s.books.length > 0]),
    ),
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
