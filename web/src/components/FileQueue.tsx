import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  GripVertical,
  LoaderCircle,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  DragDropProvider,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/react";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import { Accessibility, Feedback } from "@dnd-kit/dom";
import { Button } from "./ui/button";
import { formatSize } from "../lib/utils";
import { MOTION } from "../lib/motion";
import type { BookFile } from "../hooks/useWorkspace";
import type { Copy } from "../i18n";

type Props = {
  books: BookFile[];
  merge: boolean;
  locked: boolean;
  copy: Copy;
  onMove: (index: number, direction: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onSort: () => void;
  onClear: () => void;
};
function BookRow({
  book,
  index,
  count,
  merge,
  locked,
  sorting,
  copy,
  onMove,
  onRemove,
}: Omit<Props, "books" | "onReorder" | "onSort" | "onClear"> & {
  book: BookFile;
  index: number;
  count: number;
  sorting: boolean;
}) {
  const reduced = useReducedMotion();
  const { ref, handleRef, isDragSource, isDropTarget, isDropping } =
    useSortable({
      id: book.id,
      index,
      disabled: locked || !merge,
      transition: reduced ? null : { ...MOTION.sort, idle: false },
    });
  return (
    <motion.div
      ref={ref}
      layout={reduced || sorting || isDropping ? false : "position"}
      transition={{ layout: MOTION.spring }}
      className={`sortable-book ${isDragSource ? "lifted" : ""} ${isDropTarget && !isDragSource ? "drop-target" : ""}`}
    >
      <motion.article
        className="book-row"
        initial={{ opacity: 0, y: reduced ? 0 : 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{
          type: "tween",
          ease: MOTION.ease,
          duration: reduced ? 0 : MOTION.content,
        }}
      >
        {merge ? (
          <Button
            ref={handleRef}
            className="drag-handle"
            variant="ghost"
            size="icon"
            disabled={locked}
            aria-label={`${copy.reorder}: ${book.file.name}`}
            aria-describedby="queue-instructions"
          >
            <GripVertical />
          </Button>
        ) : (
          <span className="book-index">{index + 1}</span>
        )}
        <div className="book-info">
          <h3>{book.title || book.file.name}</h3>
          <p title={book.file.name}>{book.file.name}</p>
          <div className="book-meta">
            <span>{formatSize(book.file.size)}</span>
            {book.chapters !== undefined && (
              <span>
                {book.chapters} {copy.chapters}
              </span>
            )}
            {book.orderKey && merge && (
              <span>
                {copy.volumeNumber} {book.orderKey.join(".")}
              </span>
            )}
            <span
              className={
                book.status === "error" ? "text-destructive" : "status-text"
              }
            >
              {book.status === "reading" ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  {copy.reading}
                </>
              ) : book.status === "error" ? (
                <>
                  <CircleAlert />
                  {copy.failed}
                </>
              ) : (
                <>
                  <Check />
                  {copy.ready}
                </>
              )}
            </span>
          </div>
          {book.error && (
            <p className="file-error" role="alert">
              {book.error}
            </p>
          )}
        </div>
        <div className="book-actions">
          {merge && (
            <div className="reorder-actions">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${copy.up}: ${book.file.name}`}
                disabled={locked || sorting || index === 0}
                onClick={() => onMove(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${copy.down}: ${book.file.name}`}
                disabled={locked || sorting || index === count - 1}
                onClick={() => onMove(index, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${copy.remove}: ${book.file.name}`}
            disabled={locked || sorting}
            onClick={() => onRemove(book.id)}
          >
            <X />
          </Button>
        </div>
      </motion.article>
    </motion.div>
  );
}
export function FileQueue({
  books,
  merge,
  locked,
  copy,
  onMove,
  onReorder,
  onRemove,
  onSort,
  onClear,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const reduced = useReducedMotion();
  return (
    <section className="queue" aria-label={copy.queue}>
      <div className="section-heading">
        <h2>
          {merge ? copy.queue : copy.source}
          <span className="file-count">{books.length}</span>
        </h2>
        <div className="flex gap-1">
          {merge && (
            <Button
              variant="ghost"
              size="sm"
              disabled={
                locked ||
                dragging ||
                books.length < 2 ||
                books.some((b) => b.status !== "ready")
              }
              onClick={onSort}
            >
              {copy.auto}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={locked || dragging}
            onClick={onClear}
          >
            {copy.clear}
          </Button>
        </div>
      </div>
      <DragDropProvider
        plugins={(defaults) => [
          ...defaults.filter(
            (plugin) => plugin !== Accessibility && plugin !== Feedback,
          ),
          Accessibility.configure({
            screenReaderInstructions: { draggable: copy.dragInstructions },
            announcements: {
              dragstart: ({ operation }: DragStartEvent) =>
                `${books.find((b) => b.id === operation.source?.id)?.title ?? ""}. ${copy.pickedUp}`,
              dragover: ({ operation }: DragOverEvent) =>
                isSortable(operation.source)
                  ? `${copy.position} ${operation.source.index + 1} / ${books.length}`
                  : undefined,
              dragend: (event: DragEndEvent) =>
                event.canceled ? copy.cancelled : copy.orderUpdated,
            },
          }),
          Feedback.configure({
            dropAnimation: reduced ? null : MOTION.sort,
            keyboardTransition: reduced ? null : MOTION.sort,
          }),
        ]}
        onDragStart={() => setDragging(true)}
        onDragEnd={(event) => {
          setDragging(false);
          if (!event.canceled && isSortable(event.operation.source)) {
            const { initialIndex, index } = event.operation.source;
            onReorder(initialIndex, index);
          }
        }}
      >
        <div className="book-list">
          <AnimatePresence initial={false}>
            {books.map((book, index) => (
              <BookRow
                key={book.id}
                book={book}
                index={index}
                count={books.length}
                merge={merge}
                locked={locked}
                sorting={dragging}
                copy={copy}
                onMove={onMove}
                onRemove={onRemove}
              />
            ))}
          </AnimatePresence>
        </div>
      </DragDropProvider>
      {merge && (
        <p id="queue-instructions" className="queue-bottom">
          {copy.manual}
          <span className="sr-only">{copy.dragInstructions}</span>
        </p>
      )}
    </section>
  );
}
