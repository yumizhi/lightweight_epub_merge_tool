import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Download,
  FilePlus,
  GripVertical,
  Info,
  Languages,
  Play,
  Settings,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import type { MergeOptions } from "../../ts/src/models.js";

type Mode = "merge" | "split" | "inspect";
type Structure = "volume" | "flat";
type FileStatus = "reading" | "ready" | "warning" | "error";
type Language = "en" | "zh";
type StatusKey = "ready" | "reading" | "needsAttention" | "merging" | "merged" | "splitting" | "splitComplete" | "inspecting" | "inspectionReady";

interface FileRecord {
  id: string;
  name: string;
  size: number;
  file: File;
  title?: string;
  chapters?: number;
  orderKey?: number[];
  status: FileStatus;
  message?: string;
}

interface OutputItem {
  name: string;
  url: string;
  size: number;
}

interface WorkerResponse {
  requestId: number;
  type: "analyze" | "merge" | "inspect" | "split" | "error";
  id?: string;
  title?: string;
  chapters?: number;
  orderKey?: number[];
  warning?: string;
  name?: string;
  data?: Uint8Array;
  report?: unknown;
  results?: Array<{ name: string; data: Uint8Array }>;
  message?: string;
}

const COPY = {
  en: {
    language: "Language",
    modes: { merge: "Merge", split: "Split", inspect: "Inspect" },
    openSettings: "Open settings",
    closeSettings: "Close settings",
    addEpubs: "Add EPUBs",
    chooseFiles: "Choose Files",
    clear: "Clear",
    download: "Download",
    disabledDownload: "Download",
    steps: { files: "Files", settings: "Settings", download: "Download" },
    dropEmptyTitle: "Drop EPUB files here",
    dropFilledTitle: "Add more EPUBs",
    dropEmptySubtitle: "or choose local files",
    dropFilledSubtitle: "The queue updates in place.",
    queueTitle: "Merge queue",
    splitTitle: "Source EPUB",
    inspectTitle: "Inspection source",
    mergeQueueAuto: "Automatic order appears after analysis. Turn on input order to arrange files manually.",
    mergeQueueManual: "Files are merged in the list order below.",
    singleSourceHint: "Use a single EPUB for this mode.",
    sortMode: "Sort mode",
    autoSort: "Auto",
    inputSort: "Input",
    table: { order: "Order", file: "File", inferred: "Inferred", title: "Title", chapters: "Chapters", size: "Size", status: "Status" },
    readyMessage: "Ready for local processing",
    chooseEpubError: "Choose one or more .epub files.",
    workerNotReady: "Worker is not ready",
    mergeNoOutput: "Merge did not return an EPUB",
    splitNoOutput: "No split outputs were produced",
    status: {
      ready: "Ready",
      reading: "Reading",
      needsAttention: "Needs attention",
      merging: "Merging",
      merged: "Merged",
      splitting: "Splitting",
      splitComplete: "Split complete",
      inspecting: "Inspecting",
      inspectionReady: "Inspection ready"
    },
    fileStatus: { reading: "Reading", ready: "Ready", warning: "Warning", error: "Error" },
    readingFiles: (count: number) => `Reading ${count} file${count === 1 ? "" : "s"}`,
    settingsTitle: { merge: "Merge Settings", split: "Split Settings", inspect: "Inspect Settings" },
    noFiles: "No files selected",
    selected: "selected",
    tocStructure: "TOC structure",
    volumeToc: "Volume TOC",
    flatToc: "Flat TOC",
    useInputOrder: "Use input order",
    useInputOrderHint: "Preserve the list order above.",
    outputFilename: "Output filename",
    currentSource: "Current source",
    chooseOne: "Choose one EPUB",
    validation: "Validation",
    errorsFound: "Errors found",
    warningsFound: "Warnings found",
    totalSize: "Total size",
    warnings: "Warnings",
    privacy: "Files stay in this browser session.",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove",
    files: (count: number) => `${count} file${count === 1 ? "" : "s"}`,
    warningsCount: (count: number) => `${count} warning${count === 1 ? "" : "s"}`
  },
  zh: {
    language: "语言",
    modes: { merge: "合并", split: "拆分", inspect: "检查" },
    openSettings: "打开设置",
    closeSettings: "关闭设置",
    addEpubs: "添加 EPUB",
    chooseFiles: "选择文件",
    clear: "清空",
    download: "下载",
    disabledDownload: "下载",
    steps: { files: "文件", settings: "设置", download: "下载" },
    dropEmptyTitle: "把 EPUB 文件拖到这里",
    dropFilledTitle: "继续添加 EPUB",
    dropEmptySubtitle: "或选择本地文件",
    dropFilledSubtitle: "队列会自动更新。",
    queueTitle: "合并队列",
    splitTitle: "源 EPUB",
    inspectTitle: "检查源",
    mergeQueueAuto: "解析完成后显示自动推断顺序。打开输入顺序后可手动调整。",
    mergeQueueManual: "将按下面列表顺序合并。",
    singleSourceHint: "此模式只使用一个 EPUB。",
    sortMode: "排序",
    autoSort: "自动",
    inputSort: "输入",
    table: { order: "顺序", file: "文件", inferred: "推断", title: "标题", chapters: "章节", size: "大小", status: "状态" },
    readyMessage: "已准备在本地处理",
    chooseEpubError: "请选择一个或多个 .epub 文件。",
    workerNotReady: "后台处理尚未准备好",
    mergeNoOutput: "合并没有返回 EPUB",
    splitNoOutput: "没有生成拆分结果",
    status: {
      ready: "就绪",
      reading: "读取中",
      needsAttention: "需要处理",
      merging: "合并中",
      merged: "已合并",
      splitting: "拆分中",
      splitComplete: "拆分完成",
      inspecting: "检查中",
      inspectionReady: "检查完成"
    },
    fileStatus: { reading: "读取中", ready: "就绪", warning: "警告", error: "错误" },
    readingFiles: (count: number) => `正在读取 ${count} 个文件`,
    settingsTitle: { merge: "合并设置", split: "拆分设置", inspect: "检查设置" },
    noFiles: "未选择文件",
    selected: "个已选择",
    tocStructure: "目录结构",
    volumeToc: "按卷目录",
    flatToc: "平铺目录",
    useInputOrder: "使用输入顺序",
    useInputOrderHint: "保留上方列表顺序。",
    outputFilename: "输出文件名",
    currentSource: "当前源文件",
    chooseOne: "选择一个 EPUB",
    validation: "校验",
    errorsFound: "发现错误",
    warningsFound: "发现警告",
    totalSize: "总大小",
    warnings: "警告",
    privacy: "文件只保留在此浏览器会话中。",
    moveUp: "上移",
    moveDown: "下移",
    remove: "移除",
    files: (count: number) => `${count} 个文件`,
    warningsCount: (count: number) => `${count} 个警告`
  }
} satisfies Record<Language, {
  language: string;
  modes: Record<Mode, string>;
  openSettings: string;
  closeSettings: string;
  addEpubs: string;
  chooseFiles: string;
  clear: string;
  download: string;
  disabledDownload: string;
  steps: Record<"files" | "settings" | "download", string>;
  dropEmptyTitle: string;
  dropFilledTitle: string;
  dropEmptySubtitle: string;
  dropFilledSubtitle: string;
  queueTitle: string;
  splitTitle: string;
  inspectTitle: string;
  mergeQueueAuto: string;
  mergeQueueManual: string;
  singleSourceHint: string;
  sortMode: string;
  autoSort: string;
  inputSort: string;
  table: Record<"order" | "file" | "inferred" | "title" | "chapters" | "size" | "status", string>;
  readyMessage: string;
  chooseEpubError: string;
  workerNotReady: string;
  mergeNoOutput: string;
  splitNoOutput: string;
  status: Record<StatusKey, string>;
  fileStatus: Record<FileStatus, string>;
  readingFiles: (count: number) => string;
  settingsTitle: Record<Mode, string>;
  noFiles: string;
  selected: string;
  tocStructure: string;
  volumeToc: string;
  flatToc: string;
  useInputOrder: string;
  useInputOrderHint: string;
  outputFilename: string;
  currentSource: string;
  chooseOne: string;
  validation: string;
  errorsFound: string;
  warningsFound: string;
  totalSize: string;
  warnings: string;
  privacy: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  files: (count: number) => string;
  warningsCount: (count: number) => string;
}>;

type Copy = typeof COPY.en;

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>("merge");
  const [language, setLanguage] = useState<Language>(() => readStoredLanguage());
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [structure, setStructure] = useState<Structure>("volume");
  const [useInputOrder, setUseInputOrder] = useState(false);
  const [outputName, setOutputName] = useState("merged.epub");
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [statusKey, setStatusKey] = useState<StatusKey>("ready");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [pendingReads, setPendingReads] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [inspectReport, setInspectReport] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingReadsRef = useRef(0);
  const queueGenerationRef = useRef(0);
  const callbacksRef = useRef(new Map<number, (response: WorkerResponse) => void>());

  useEffect(() => {
    const worker = new Worker(new URL("./epub-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const callback = callbacksRef.current.get(event.data.requestId);
      if (!callback) return;
      callbacksRef.current.delete(event.data.requestId);
      callback(event.data);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    return () => {
      for (const output of outputs) URL.revokeObjectURL(output.url);
    };
  }, [outputs]);

  useEffect(() => {
    localStorage.setItem("epubMergeLanguage", language);
  }, [language]);

  const copy = COPY[language];
  const displayedFiles = useMemo(() => orderFilesForDisplay(files, useInputOrder), [files, useInputOrder]);
  const readyFiles = displayedFiles.filter((file) => file.status === "ready" || file.status === "warning");
  const isReading = pendingReads > 0 || files.some((file) => file.status === "reading");
  const warningCount = files.filter((file) => file.status === "warning").length;
  const errorCount = files.filter((file) => file.status === "error").length;
  const canRun = !isReading && (mode === "merge" ? readyFiles.length > 0 : readyFiles.length === 1);
  const actionLabel = copy.modes[mode];
  const selectedFile = mode === "merge" ? displayedFiles[0] : readyFiles[0] ?? displayedFiles[0];
  const statusText = statusKey === "reading" && pendingReads > 0
    ? copy.readingFiles(pendingReads)
    : statusKey === "reading" && statusDetail
      ? `${copy.status.reading} ${statusDetail}`
      : copy.status[statusKey];

  const fileSummary = useMemo(() => {
    const totalChapters = files.reduce((sum, file) => sum + (file.chapters ?? 0), 0);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    return { totalChapters, totalSize };
  }, [files]);

  async function runWorker<T extends WorkerResponse>(payload: Omit<Record<string, unknown>, "requestId">): Promise<T> {
    const worker = workerRef.current;
    if (!worker) throw new Error(copy.workerNotReady);
    const requestId = ++requestIdRef.current;
    return new Promise<T>((resolve, reject) => {
      callbacksRef.current.set(requestId, (response) => {
        if (response.type === "error") reject(new Error(response.message ?? "Worker error"));
        else resolve(response as T);
      });
      worker.postMessage({ ...payload, requestId });
    });
  }

  function addFiles(fileList: FileList | File[]): void {
    const accepted = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".epub"));
    if (!accepted.length) {
      setErrorText(copy.chooseEpubError);
      return;
    }
    setErrorText(null);
    clearOutputs();
    const generation = queueGenerationRef.current;
    const records = accepted.map((file): FileRecord => {
      const id = `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
      return { id, name: file.name, size: file.size, file, status: "reading" };
    });

    setFiles((current) => [...current, ...records]);
    setPendingReadCount(pendingReadsRef.current + records.length);
    setStatusKey("reading");
    setStatusDetail(null);

    for (const record of records) {
      void analyzeFile(record, generation);
    }
  }

  async function analyzeFile(record: FileRecord, generation: number): Promise<void> {
    try {
      const response = await runWorker<WorkerResponse>({ type: "analyze", file: { id: record.id, name: record.name, file: record.file } });
      if (generation !== queueGenerationRef.current) return;
      setFiles((current) => current.map((item) => item.id === record.id ? {
        ...item,
        title: response.title,
        chapters: response.chapters,
        orderKey: response.orderKey,
        status: response.warning ? "warning" : "ready",
        message: response.warning
      } : item));
    } catch (error) {
      if (generation !== queueGenerationRef.current) return;
      setFiles((current) => current.map((item) => item.id === record.id ? {
        ...item,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      } : item));
    } finally {
      if (generation === queueGenerationRef.current) {
        const nextPending = Math.max(0, pendingReadsRef.current - 1);
        setPendingReadCount(nextPending);
        if (nextPending === 0) {
          setStatusKey("ready");
          setStatusDetail(null);
        }
      }
    }
  }

  async function runPrimaryAction(): Promise<void> {
    if (!canRun || isWorking) return;
    setIsWorking(true);
    setErrorText(null);
    clearOutputs();
    setInspectReport(null);
    try {
      if (mode === "merge") await runMerge();
      else if (mode === "split") await runSplit();
      else await runInspect();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setStatusKey("needsAttention");
      setStatusDetail(null);
    } finally {
      setIsWorking(false);
    }
  }

  async function runMerge(): Promise<void> {
    setStatusKey("merging");
    setStatusDetail(null);
    const options: MergeOptions = {
      title: outputName.replace(/\.epub$/i, ""),
      structure,
      inputOrder: useInputOrder
    };
    const response = await runWorker<WorkerResponse>({
      type: "merge",
      outputName: normalizedOutputName(),
      files: readyFiles.map((file) => ({ id: file.id, name: file.name, file: file.file })),
      options
    });
    if (!response.data || !response.name) throw new Error(copy.mergeNoOutput);
    setOutputs([makeOutput(response.name, response.data)]);
    setStatusKey("merged");
  }

  async function runSplit(): Promise<void> {
    if (!selectedFile) return;
    setStatusKey("splitting");
    setStatusDetail(null);
    const response = await runWorker<WorkerResponse>({ type: "split", file: { id: selectedFile.id, name: selectedFile.name, file: selectedFile.file } });
    const results = response.results ?? [];
    if (!results.length) throw new Error(copy.splitNoOutput);
    setOutputs(results.map((result) => makeOutput(result.name, result.data)));
    setStatusKey("splitComplete");
  }

  async function runInspect(): Promise<void> {
    if (!selectedFile) return;
    setStatusKey("inspecting");
    setStatusDetail(null);
    const response = await runWorker<WorkerResponse>({ type: "inspect", file: { id: selectedFile.id, name: selectedFile.name, file: selectedFile.file } });
    setInspectReport(response.report);
    setStatusKey("inspectionReady");
  }

  function makeOutput(name: string, data: Uint8Array): OutputItem {
    const blob = new Blob([data], { type: "application/epub+zip" });
    return { name, url: URL.createObjectURL(blob), size: data.byteLength };
  }

  function clearOutputs(): void {
    setOutputs((current) => {
      for (const output of current) URL.revokeObjectURL(output.url);
      return [];
    });
    setInspectReport(null);
  }

  function normalizedOutputName(): string {
    const trimmed = outputName.trim() || "merged.epub";
    return trimmed.toLowerCase().endsWith(".epub") ? trimmed : `${trimmed}.epub`;
  }

  function moveFile(index: number, direction: -1 | 1): void {
    setFiles((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  function removeFile(id: string): void {
    setFiles((current) => current.filter((file) => file.id !== id));
    clearOutputs();
  }

  function clearAll(): void {
    queueGenerationRef.current++;
    setPendingReadCount(0);
    setFiles([]);
    setErrorText(null);
    setStatusKey("ready");
    setStatusDetail(null);
    clearOutputs();
  }

  function setPendingReadCount(count: number): void {
    pendingReadsRef.current = count;
    setPendingReads(count);
  }

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="brand">
          <span className="brand-icon"><BookOpen size={18} /></span>
          <span>EPUB Merge Tool</span>
        </div>
        <div className="mode-control" role="tablist" aria-label="Tool mode">
          {(["merge", "split", "inspect"] as Mode[]).map((item) => (
            <button
              key={item}
              className={mode === item ? "selected" : ""}
              type="button"
              onClick={() => {
                setMode(item);
                clearOutputs();
                setInspectReport(null);
              }}
            >
              {copy.modes[item]}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <div className="language-control" aria-label={copy.language}>
            <Languages size={16} />
            <button type="button" className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}>EN</button>
            <button type="button" className={language === "zh" ? "selected" : ""} onClick={() => setLanguage("zh")}>中文</button>
          </div>
          <button className="ghost-button settings-toggle" type="button" onClick={() => setIsSettingsOpen(true)} aria-label={copy.openSettings}>
            <Settings size={17} />
          </button>
          <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()}>
            <FilePlus size={17} />
            <span>{copy.addEpubs}</span>
          </button>
          <button className="primary-button" type="button" disabled={!canRun || isWorking} onClick={runPrimaryAction}>
            {isWorking ? <span className="spinner" aria-hidden="true" /> : <Play size={16} />}
            <span>{actionLabel}</span>
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,application/epub+zip"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </header>

      <main className="workspace">
        <section className="content-pane">
          <div className="mobile-steps" aria-label="Progress">
            <span className={files.length ? "done" : "active"}>{copy.steps.files}</span>
            <span className={files.length ? "active" : ""}>{copy.steps.settings}</span>
            <span className={outputs.length || inspectReport ? "done" : ""}>{copy.steps.download}</span>
          </div>

          <div
            className={`drop-zone ${isDragging ? "dragging" : ""} ${files.length ? "compact" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <div className="drop-copy">
              <FilePlus size={24} />
              <div>
                <strong>{files.length ? copy.dropFilledTitle : copy.dropEmptyTitle}</strong>
                <span>{files.length ? copy.dropFilledSubtitle : copy.dropEmptySubtitle}</span>
              </div>
            </div>
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>{copy.chooseFiles}</button>
          </div>

          <FileList
            files={displayedFiles}
            mode={mode}
            copy={copy}
            canReorder={useInputOrder}
            onMove={moveFile}
            onRemove={removeFile}
            onClear={clearAll}
          />

          {(errorText || inspectReport || outputs.length > 0) && (
            <ResultPanel errorText={errorText} inspectReport={inspectReport} outputs={outputs} />
          )}
        </section>

        <SettingsPanel
          open={isSettingsOpen}
          mode={mode}
          copy={copy}
          structure={structure}
          setStructure={setStructure}
          useInputOrder={useInputOrder}
          setUseInputOrder={setUseInputOrder}
          outputName={outputName}
          setOutputName={setOutputName}
          fileCount={files.length}
          selectedFile={selectedFile}
          totalChapters={fileSummary.totalChapters}
          totalSize={fileSummary.totalSize}
          warningCount={warningCount}
          errorCount={errorCount}
          onClose={() => setIsSettingsOpen(false)}
        />
      </main>

      {isSettingsOpen && <button className="sheet-backdrop" type="button" aria-label={copy.closeSettings} onClick={() => setIsSettingsOpen(false)} />}

      <footer className="status-strip">
        <span className={`status-dot ${errorText || errorCount ? "error" : warningCount ? "warning" : "ready"}`} />
        <span>{statusText}</span>
        <span>{copy.files(files.length)}</span>
        <span>{copy.warningsCount(warningCount)}</span>
        {outputs[0] ? (
          <a className="download-link" href={outputs[0].url} download={outputs[0].name}>
            <Download size={15} />
            <span>{copy.download}</span>
          </a>
        ) : (
          <span className="download-link disabled"><Download size={15} /> {copy.disabledDownload}</span>
        )}
      </footer>
    </div>
  );
}

function FileList(props: {
  files: FileRecord[];
  mode: Mode;
  copy: Copy;
  canReorder: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}): JSX.Element {
  if (!props.files.length) return <div className="empty-spacer" />;
  return (
    <section className="file-panel" aria-label="EPUB queue">
      <div className="file-panel-header">
        <div>
          <h1>{props.mode === "merge" ? props.copy.queueTitle : props.mode === "split" ? props.copy.splitTitle : props.copy.inspectTitle}</h1>
          <p>{props.mode === "merge" ? (props.canReorder ? props.copy.mergeQueueManual : props.copy.mergeQueueAuto) : props.copy.singleSourceHint}</p>
        </div>
        {props.mode === "merge" && (
          <div className="sort-chip">
            <span>{props.copy.sortMode}</span>
            <strong>{props.canReorder ? props.copy.inputSort : props.copy.autoSort}</strong>
          </div>
        )}
        <button className="ghost-button clear-button" type="button" onClick={props.onClear}>
          <X size={16} />
          <span>{props.copy.clear}</span>
        </button>
      </div>
      <div className="file-table">
        <div className="file-head">
          <span>{props.copy.table.order}</span>
          <span>{props.copy.table.file}</span>
          <span>{props.copy.table.inferred}</span>
          <span>{props.copy.table.title}</span>
          <span>{props.copy.table.chapters}</span>
          <span>{props.copy.table.size}</span>
          <span>{props.copy.table.status}</span>
          <span />
        </div>
        {props.files.map((file, index) => (
          <div className={`file-row ${file.status}`} key={file.id}>
            <div className="order-cell">
              <GripVertical size={15} />
              <span>{index + 1}</span>
            </div>
            <div className="file-name">
              <strong>{file.name}</strong>
              <span>{file.message ?? props.copy.readyMessage}</span>
            </div>
            <span>{formatOrder(file.orderKey)}</span>
            <span>{file.title ?? "-"}</span>
            <span>{file.chapters ?? "-"}</span>
            <span>{formatBytes(file.size)}</span>
            <span className="status-label">
              {iconForStatus(file.status)}
              {props.copy.fileStatus[file.status]}
            </span>
            <div className="row-actions">
              <button type="button" className="icon-button" aria-label={`${props.copy.moveUp} ${file.name}`} disabled={!props.canReorder || index === 0} onClick={() => props.onMove(index, -1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" className="icon-button" aria-label={`${props.copy.moveDown} ${file.name}`} disabled={!props.canReorder || index === props.files.length - 1} onClick={() => props.onMove(index, 1)}>
                <ArrowDown size={14} />
              </button>
              <button type="button" className="icon-button danger" aria-label={`${props.copy.remove} ${file.name}`} onClick={() => props.onRemove(file.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel(props: {
  open: boolean;
  mode: Mode;
  copy: Copy;
  structure: Structure;
  setStructure: (structure: Structure) => void;
  useInputOrder: boolean;
  setUseInputOrder: (value: boolean) => void;
  outputName: string;
  setOutputName: (name: string) => void;
  fileCount: number;
  selectedFile?: FileRecord;
  totalChapters: number;
  totalSize: number;
  warningCount: number;
  errorCount: number;
  onClose: () => void;
}): JSX.Element {
  return (
    <aside className={`settings-panel ${props.open ? "open" : ""}`}>
      <div className="panel-title">
        <div>
          <h2>{props.copy.settingsTitle[props.mode]}</h2>
          <p>{props.fileCount ? `${props.fileCount} ${props.copy.selected}` : props.copy.noFiles}</p>
        </div>
        <button className="icon-button close-panel" type="button" onClick={props.onClose} aria-label={props.copy.closeSettings}>
          <X size={16} />
        </button>
      </div>

      {props.mode === "merge" ? (
        <>
          <label className="field-label">{props.copy.tocStructure}</label>
          <div className="segmented-control">
            <button type="button" className={props.structure === "volume" ? "selected" : ""} onClick={() => props.setStructure("volume")}>{props.copy.volumeToc}</button>
            <button type="button" className={props.structure === "flat" ? "selected" : ""} onClick={() => props.setStructure("flat")}>{props.copy.flatToc}</button>
          </div>

          <label className="switch-row">
            <span>
              <strong>{props.copy.useInputOrder}</strong>
              <small>{props.copy.useInputOrderHint}</small>
            </span>
            <input type="checkbox" checked={props.useInputOrder} onChange={(event) => props.setUseInputOrder(event.target.checked)} />
          </label>

          <label className="field-label" htmlFor="output-name">{props.copy.outputFilename}</label>
          <input id="output-name" className="text-field" value={props.outputName} onChange={(event) => props.setOutputName(event.target.value)} />
        </>
      ) : (
        <div className="selection-card">
          <span>{props.copy.currentSource}</span>
          <strong>{props.selectedFile?.name ?? props.copy.chooseOne}</strong>
        </div>
      )}

      <div className="validation-card">
        <div>
          <span>{props.copy.validation}</span>
          <strong>{props.errorCount ? props.copy.errorsFound : props.warningCount ? props.copy.warningsFound : props.copy.status.ready}</strong>
        </div>
        <span className={`status-dot ${props.errorCount ? "error" : props.warningCount ? "warning" : "ready"}`} />
      </div>

      <dl className="summary-list">
        <div><dt>{props.copy.table.chapters}</dt><dd>{props.totalChapters || "-"}</dd></div>
        <div><dt>{props.copy.totalSize}</dt><dd>{formatBytes(props.totalSize)}</dd></div>
        <div><dt>{props.copy.warnings}</dt><dd>{props.warningCount}</dd></div>
      </dl>

      <div className="privacy-note">
        <ShieldCheck size={17} />
        <span>{props.copy.privacy}</span>
      </div>
    </aside>
  );
}

function ResultPanel(props: { errorText: string | null; inspectReport: unknown; outputs: OutputItem[] }): JSX.Element {
  return (
    <section className="result-panel" aria-live="polite">
      {props.errorText && (
        <div className="result-message error">
          <AlertTriangle size={18} />
          <span>{props.errorText}</span>
        </div>
      )}
      {props.outputs.length > 0 && (
        <div className="output-list">
          {props.outputs.map((output) => (
            <a key={output.url} className="output-item" href={output.url} download={output.name}>
              <Download size={17} />
              <span>{output.name}</span>
              <small>{formatBytes(output.size)}</small>
            </a>
          ))}
        </div>
      )}
      {Boolean(props.inspectReport) && (
        <pre className="inspect-report">{JSON.stringify(props.inspectReport, null, 2)}</pre>
      )}
    </section>
  );
}

function iconForStatus(status: FileStatus): JSX.Element {
  if (status === "error") return <AlertTriangle size={15} />;
  if (status === "warning") return <Info size={15} />;
  if (status === "reading") return <span className="spinner small" aria-hidden="true" />;
  return <CheckCircle2 size={15} />;
}

function readStoredLanguage(): Language {
  try {
    return localStorage.getItem("epubMergeLanguage") === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

function orderFilesForDisplay(files: FileRecord[], useInputOrder: boolean): FileRecord[] {
  if (useInputOrder) return files;
  if (files.some((file) => file.status === "reading")) return files;
  const originalIndex = new Map(files.map((file, index) => [file.id, index]));
  return [...files].sort((a, b) => {
    const keyComparison = compareOrderKeys(a.orderKey, b.orderKey);
    if (keyComparison !== 0) return keyComparison;
    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });
}

function compareOrderKeys(a?: number[], b?: number[]): number {
  if (a && !b) return -1;
  if (!a && b) return 1;
  if (!a || !b) return 0;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const av = a[index] ?? -1;
    const bv = b[index] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function formatOrder(key?: number[]): string {
  if (!key) return "-";
  return key.map((part, index) => index > 0 && part > 999 ? Number(`0.${String(part).padStart(6, "0")}`) : part).join(".");
}

function formatBytes(bytes: number): string {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
