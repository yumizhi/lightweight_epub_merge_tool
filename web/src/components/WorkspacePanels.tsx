import { useMemo, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Upload, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { FileQueue } from "./FileQueue";
import { Contents } from "./Contents";
import { Downloads } from "./Results";
import type { Workspace } from "../hooks/useWorkspace";
import type { Copy } from "../i18n";
import { previewContents } from "../lib/toc";
import { MOTION } from "../lib/motion";
import { formatSize } from "../lib/utils";

export function SourcePicker({ w, copy }: { w: Workspace; copy: Copy }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const reduced = useReducedMotion();
  const merge = w.mode === "merge";
  return (
    <Card className="file-panel">
      {!w.books.length && (
        <CardHeader>
          <CardTitle>{merge ? copy.queue : copy.source}</CardTitle>
          <CardDescription>{copy[`${w.mode}Hint`]}</CardDescription>
        </CardHeader>
      )}
      <CardContent className={w.books.length ? "pt-6" : undefined}>
        <input
          ref={input}
          type="file"
          accept=".epub,application/epub+zip"
          multiple={merge}
          className="sr-only"
          aria-label={copy.browse}
          disabled={w.locked}
          onChange={(event) => {
            void w.add(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
        <motion.div
          layout={!reduced}
          transition={MOTION.spring}
          className={`dropzone ${dragging ? "dragging" : ""} ${w.books.length ? "compact" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!w.locked && event.dataTransfer.types.includes("Files"))
              setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!w.locked) void w.add(Array.from(event.dataTransfer.files));
          }}
        >
          <Upload className="drop-icon" size={20} aria-hidden />
          <div>
            <h2>{merge ? copy.drop : copy.dropOne}</h2>
            <p>{copy.dropHint}</p>
          </div>
          <Button
            variant="outline"
            disabled={w.locked}
            onClick={() => input.current?.click()}
          >
            {w.books.length && merge ? copy.add : copy.browse}
          </Button>
        </motion.div>
        {!!w.books.length && (
          <FileQueue
            books={w.books}
            merge={merge}
            locked={w.locked}
            copy={copy}
            onClear={w.reset}
            onMove={w.move}
            onReorder={w.reorder}
            onRemove={w.remove}
            onSort={w.sort}
          />
        )}
        {!merge && <TaskError w={w} copy={copy} />}
      </CardContent>
    </Card>
  );
}
export function TaskStatus({ w, copy }: { w: Workspace; copy: Copy }) {
  if (!w.task) return null;
  const progress = w.progress;
  return (
    <div className="task-status" role="status" aria-live="polite">
      <LoaderCircle className="animate-spin" size={18} aria-hidden />
      <div className="task-description">
        <strong>
          {progress
            ? copy.stages[progress.phase]
            : w.reading
              ? copy.reading
              : copy.working}
        </strong>
        {progress?.file && (
          <small className="task-file" title={progress.file}>
            {progress.file}
          </small>
        )}
        {progress && progress.phase !== "writing" && (
          <div className="resource-progress">
            <progress
              value={progress.completed}
              max={progress.total || 1}
              aria-label={copy.stages[progress.phase]}
            />
            <small>
              {progress.completed} / {progress.total}
            </small>
          </div>
        )}
      </div>
      {w.task.mode !== w.mode && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => w.changeMode(w.task!.mode)}
        >
          {copy.viewTask}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={w.stop}>
        <X />
        {copy.cancel}
      </Button>
    </div>
  );
}
export function TaskError({ w, copy }: { w: Workspace; copy: Copy }) {
  return w.error ? (
    <Alert variant="destructive" className="task-error">
      <CircleAlert className="h-4 w-4" />
      <AlertTitle>{copy.error}</AlertTitle>
      <AlertDescription className="break-words">{w.error}</AlertDescription>
    </Alert>
  ) : null;
}
export function ActionArea({ w, copy }: { w: Workspace; copy: Copy }) {
  const reduced = useReducedMotion();
  const canRun =
    !!w.books.length &&
    w.books.every((b) => b.status === "ready") &&
    !w.locked &&
    (w.mode !== "split" || !!w.books[0].summary?.tool_generated);
  const label =
    w.mode === "merge"
      ? copy.mergeAction
      : w.mode === "split"
        ? copy.splitAction
        : copy.inspectAction;
  const currentTask = w.task?.mode === w.mode;
  return (
    <div className="action-area">
      {w.mode === "merge" && <TaskError w={w} copy={copy} />}
      {currentTask && <TaskStatus w={w} copy={copy} />}
      {!!w.outputs.length ? (
        <motion.div
          key={w.outputs[0].url}
          initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "tween",
            ease: MOTION.ease,
            duration: reduced ? 0 : MOTION.result,
          }}
        >
          <Downloads
            outputs={w.outputs}
            copy={copy}
            busy={w.locked}
            download={w.download}
            downloadAll={w.downloadAll}
            inspect={(output) => w.useOutput(output, "inspect")}
            split={
              w.mode === "merge"
                ? (output) => w.useOutput(output, "split")
                : undefined
            }
          />
        </motion.div>
      ) : (
        !currentTask && (
          <>
            {w.stale && (
              <p className="stale-note" role="status">
                {copy.resultsChanged}
              </p>
            )}
            <Button
              className="primary-action"
              disabled={!canRun}
              onClick={w.process}
            >
              {label}
            </Button>
          </>
        )
      )}
    </div>
  );
}
export function MergeSettings({ w, copy }: { w: Workspace; copy: Copy }) {
  const entries = useMemo(
    () => previewContents(w.books, w.structure),
    [w.books, w.structure],
  );
  const chapters = w.books.reduce((sum, b) => sum + (b.chapters || 0), 0);
  return (
    <aside className="merge-settings">
      <Card>
        <CardHeader>
          <CardTitle>{copy.settings}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="settings-fields">
            <label htmlFor="collection-title">
              {copy.bookTitle}
              <Input
                id="collection-title"
                value={w.title}
                placeholder={(w.outputName.trim() || "collection").replace(
                  /\.epub$/i,
                  "",
                )}
                disabled={w.locked}
                onChange={(event) => w.setTitle(event.target.value)}
              />
            </label>
            <label htmlFor="output-name">
              {copy.outputName}
              <Input
                id="output-name"
                value={w.outputName}
                disabled={w.locked}
                onChange={(event) => w.setOutputName(event.target.value)}
              />
            </label>
            <div>
              <label id="toc-label">{copy.structure}</label>
              <Select
                value={w.structure}
                onValueChange={(value) =>
                  w.setStructure(value as "volume" | "flat")
                }
                disabled={w.locked}
              >
                <SelectTrigger aria-labelledby="toc-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="volume">{copy.volume}</SelectItem>
                  <SelectItem value="flat">{copy.flat}</SelectItem>
                </SelectContent>
              </Select>
              <p className="field-hint">
                {w.structure === "volume" ? copy.volumeHint : copy.flatHint}
              </p>
            </div>
          </div>
          {!!w.books.length && (
            <section className="toc-preview" aria-label={copy.preview}>
              <div className="section-heading">
                <h2>{copy.preview}</h2>
              </div>
              <h3 className="preview-title">
                {w.title.trim() ||
                  (w.outputName.trim() || "collection").replace(/\.epub$/i, "")}
              </h3>
              <div className="preview-scroll">
                {entries.length ? (
                  <Contents entries={entries} copy={copy} />
                ) : (
                  <p className="field-hint">
                    {w.books.length ? copy.noContents : copy.previewEmpty}
                  </p>
                )}
              </div>
              <p className="preview-summary">
                {w.books.length} {copy.books} · {chapters} {copy.chapters} ·{" "}
                {formatSize(w.books.reduce((sum, b) => sum + b.file.size, 0))}
              </p>
            </section>
          )}
          <ActionArea w={w} copy={copy} />
        </CardContent>
      </Card>
    </aside>
  );
}
export function SplitWorkspace({ w, copy }: { w: Workspace; copy: Copy }) {
  const source = w.books[0]?.summary;
  return (
    <div className="single-workspace split-workspace">
      <SourcePicker w={w} copy={copy} />
      {!!w.books.length && (
        <Card>
          <CardHeader>
            <CardTitle>{copy.sourcePreview}</CardTitle>
            <CardDescription>{copy.splitNote}</CardDescription>
          </CardHeader>
          <CardContent>
            {source &&
              (source.tool_generated ? (
                <ol className="source-volumes">
                  {source.sources.map((name, index) => (
                    <li key={index}>
                      <span className="book-index">{index + 1}</span>
                      <span>{name}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Alert className="split-notice">
                  <CircleAlert className="h-4 w-4" />
                  <AlertDescription>{copy.notSplittable}</AlertDescription>
                </Alert>
              ))}
            <ActionArea w={w} copy={copy} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
