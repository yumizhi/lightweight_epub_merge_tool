import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "./ui/button";
import { formatSize } from "../lib/utils";
import type { BookFile } from "../hooks/useWorkspace";
import type { Copy } from "../i18n";
export function FileQueue({
  books,
  merge,
  locked,
  copy,
  onAdd,
  onMove,
  onRemove,
  onSort,
  onClear,
}: {
  books: BookFile[];
  merge: boolean;
  locked: boolean;
  copy: Copy;
  onAdd: () => void;
  onMove: (index: number, direction: number) => void;
  onRemove: (id: string) => void;
  onSort: () => void;
  onClear: () => void;
}) {
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
              disabled={locked || books.length < 2}
              onClick={onSort}
            >
              {copy.auto}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={locked} onClick={onClear}>
            {copy.clear}
          </Button>
        </div>
      </div>
      <div className="book-list">
        <AnimatePresence initial={false}>
          {books.map((book, index) => (
            <motion.article
              className="book-row"
              key={book.id}
              layout
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{
                layout: { type: "spring", stiffness: 420, damping: 38 },
                opacity: { duration: 0.15 },
              }}
            >
              <span className="book-index">{index + 1}</span>
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
                  <span
                    className={
                      book.status === "error"
                        ? "text-destructive"
                        : "status-text"
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
                {book.error && <p className="file-error">{book.error}</p>}
              </div>
              <div className="book-actions">
                {merge && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${copy.up}: ${book.file.name}`}
                      disabled={locked || index === 0}
                      onClick={() => onMove(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${copy.down}: ${book.file.name}`}
                      disabled={locked || index === books.length - 1}
                      onClick={() => onMove(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${copy.remove}: ${book.file.name}`}
                  disabled={locked}
                  onClick={() => onRemove(book.id)}
                >
                  <X />
                </Button>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
      {merge && (
        <div className="queue-bottom">
          <span>{copy.manual}</span>
          <Button variant="ghost" size="sm" onClick={onAdd} disabled={locked}>
            <Plus />
            {copy.add}
          </Button>
        </div>
      )}
    </section>
  );
}
