import { CheckCircle2, Download, FileArchive } from "lucide-react";
import { Button } from "./ui/button";
import { formatSize } from "../lib/utils";
import type { Copy } from "../i18n";
import type { OutputFile } from "../hooks/useWorkspace";
import type { InspectReport } from "../../../ts/src/inspect.js";
export function Downloads({ outputs, copy, busy, download, downloadAll }: { outputs: OutputFile[]; copy: Copy; busy: boolean; download: (output: OutputFile) => void; downloadAll: () => void }) {
  return <section className="results" aria-label={copy.downloaded}>
    <div className="section-heading"><h2 className="flex items-center gap-2"><CheckCircle2 size={18}/>{copy.results}</h2>{outputs.length > 1 && <Button variant="outline" size="sm" disabled={busy} onClick={downloadAll}><FileArchive/>{copy.downloadAll}</Button>}</div>
    {outputs.map(output => <div className="download-row" key={output.name}><FileArchive size={22}/><div><strong>{output.name}</strong><span>{formatSize(output.blob.size)}</span></div><Button disabled={busy} variant="outline" size="sm" onClick={() => download(output)}><Download/>{copy.download}</Button></div>)}
  </section>;
}
export function Inspection({ report, copy }: { report: InspectReport; copy: Copy }) {
  return <section className="inspection" aria-label={copy.metadata}>
    <div className="section-heading"><h2>{copy.metadata}</h2><CheckCircle2 size={18}/></div>
    <dl><dt>{copy.title}</dt><dd>{report.title}</dd><dt>{copy.creators}</dt><dd>{report.creators.join(", ") || copy.noCreator}</dd><dt>{copy.languageLabel}</dt><dd>{report.language}</dd><dt>EPUB</dt><dd>{report.version} · {report.resources} {copy.resources}</dd><dt>{copy.package}</dt><dd>{report.opf_path}</dd></dl>
    {report.sources.length > 0 && <><h3>{copy.sources}</h3><ol>{report.sources.map(source => <li key={source}>{source}</li>)}</ol></>}
    <details open><summary>{copy.toc} ({report.toc.length})</summary><ol>{report.toc.map((entry, index) => <li key={index} style={{ marginLeft: (entry.depth ?? 0) * 14 }}>{entry.title}<span className="toc-path">{entry.href}</span></li>)}</ol></details>
    <details><summary>{copy.spine} ({report.spine.length})</summary><ol>{report.spine.map((href, index) => <li key={index}>{index + 1}. {href}</li>)}</ol></details>
    <p className="operation-note">{copy.inspectNote}</p>
  </section>;
}
