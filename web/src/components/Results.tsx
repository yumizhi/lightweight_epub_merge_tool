import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileArchive } from "lucide-react";
import { Button } from "./ui/button";
import { Contents } from "./Contents";
import { formatSize } from "../lib/utils";
import type { Copy } from "../i18n";
import type { OutputFile } from "../hooks/useWorkspace";
import type { InspectReport } from "../../../ts/src/inspect.js";

export function Downloads({
  outputs,
  copy,
  busy,
  download,
  downloadAll,
  inspect,
  split,
}: {
  outputs: OutputFile[];
  copy: Copy;
  busy: boolean;
  download: (output: OutputFile) => void;
  downloadAll: () => void;
  inspect: (output: OutputFile) => void;
  split?: (output: OutputFile) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Preserve focus on the Tabs when revisiting a saved result.
    if (document.activeElement === document.body)
      heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="results" aria-label={copy.downloaded}>
      <div className="section-heading">
        <h2 ref={heading} tabIndex={-1}>
          <CheckCircle2 size={18} />
          {copy.readyDownload}
        </h2>
        {outputs.length > 1 && (
          <Button
            variant="default"
            size="sm"
            disabled={busy}
            onClick={downloadAll}
          >
            <FileArchive />
            {copy.downloadAll}
          </Button>
        )}
      </div>
      {outputs.map((output) => (
        <div className="output-item" key={output.name}>
          <div className="download-row">
            <FileArchive size={22} aria-hidden />
            <div>
              <strong>{output.name}</strong>
              <span>{formatSize(output.blob.size)}</span>
            </div>
            <Button
              disabled={busy}
              variant={outputs.length === 1 ? "default" : "outline"}
              size="sm"
              onClick={() => download(output)}
            >
              <Download />
              {copy.download}
            </Button>
          </div>
          <div className="result-actions">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => inspect(output)}
            >
              {copy.inspectResult}
            </Button>
            {split && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => split(output)}
              >
                {copy.splitResult}
              </Button>
            )}
          </div>
        </div>
      ))}
      <p className="sr-only" role="status">
        {copy.completed}
      </p>
    </section>
  );
}
function PathDetails({
  label,
  items,
  copy,
}: {
  label: string;
  items: Array<{ path: string; type?: string }>;
  copy: Copy;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(24);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {label} ({items.length})
      </summary>
      {open && (
        <>
          <ol className="path-list">
            {items.slice(0, visible).map((item, index) => (
              <li key={index}>
                <span className="book-index">{index + 1}</span>
                <span>
                  {item.path}
                  {item.type && <small className="toc-path">{item.type}</small>}
                </span>
              </li>
            ))}
          </ol>
          {visible < items.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisible(visible + 24)}
            >
              {copy.showMore} ({items.length - visible})
            </Button>
          )}
        </>
      )}
    </details>
  );
}
export function Inspection({
  report,
  copy,
}: {
  report: InspectReport;
  copy: Copy;
}) {
  return (
    <section className="inspection" aria-label={copy.metadata}>
      <div className="inspection-summary">
        <h2>{report.title}</h2>
        <p className="inspection-author">
          {report.creators.join(", ") || copy.noCreator}
        </p>
        <dl>
          <dt>{copy.languageLabel}</dt>
          <dd>{report.language}</dd>
          <dt>EPUB</dt>
          <dd>{report.version}</dd>
          <dt>{copy.chaptersLabel}</dt>
          <dd>{report.spine.length}</dd>
          <dt>{copy.resources}</dt>
          <dd>{report.resources}</dd>
        </dl>
        <p className="parsed-status">
          <CheckCircle2 size={15} aria-hidden />
          {copy.noIssues}
        </p>
        {report.sources.length > 0 && (
          <PathDetails
            label={copy.sources}
            items={report.sources.map((path) => ({ path }))}
            copy={copy}
          />
        )}
        <PathDetails
          label={copy.spine}
          items={report.spine.map((path) => ({ path }))}
          copy={copy}
        />
        <details>
          <summary>{copy.package}</summary>
          <p className="toc-path">{report.opf_path}</p>
        </details>
        <PathDetails
          label={copy.resourcePaths}
          items={report.resource_items.map((item) => ({
            path: item.href,
            type: item.media_type,
          }))}
          copy={copy}
        />
        <p className="operation-note">{copy.inspectNote}</p>
      </div>
      <div className="inspection-contents">
        <h3>
          {copy.toc}
          <span className="file-count">{report.toc.length}</span>
        </h3>
        {report.toc.length ? (
          <Contents entries={report.toc} copy={copy} />
        ) : (
          <p className="field-hint">{copy.noContents}</p>
        )}
      </div>
    </section>
  );
}
