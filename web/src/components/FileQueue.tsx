import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CircleAlert,
  LoaderCircle,
  Plus,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
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
        <div className="flex items-center gap-2">
          <h2>{merge ? copy.queue : copy.source}</h2>
          <Badge variant="secondary">
            {books.length.toString().padStart(2, "0")}
          </Badge>
        </div>
        <div className="flex gap-1">
          {merge && (
            <Button
              variant="ghost"
              size="sm"
              disabled={locked || books.length < 2}
              onClick={onSort}
            >
              <WandSparkles />
              {copy.auto}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={locked} onClick={onClear}>
            {copy.clear}
          </Button>
        </div>
      </div>
      <div className="book-list">
        {books.map((book, index) => (
          <article className="book-row" key={book.id}>
            <span className="book-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className={`book-cover cover-${index % 4}`} aria-hidden="true">
              <BookOpen size={22} strokeWidth={1.5} />
              <span>EPUB</span>
            </div>
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
              {book.error && <p className="file-error">{book.error}</p>}
            </div>
            <div className="book-actions">
              {merge && (
                <div className="order-buttons">
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
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${copy.remove}: ${book.file.name}`}
                disabled={locked}
                onClick={() => onRemove(book.id)}
              >
                <Trash2 />
              </Button>
            </div>
          </article>
        ))}
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
