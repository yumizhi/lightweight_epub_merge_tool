import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, ChevronRight, CircleAlert, Files, Code2, Languages, ListTree, LoaderCircle, LockKeyhole, Moon, Scissors, ShieldCheck, Sun, Upload, X } from "lucide-react";
import { Toaster } from "sonner";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { FileQueue } from "./components/FileQueue";
import { Downloads, Inspection } from "./components/Results";
import { useWorkspace, type Mode } from "./hooks/useWorkspace";
import { COPY, type Language } from "./i18n";
import { formatSize } from "./lib/utils";

const icons = { merge: Files, split: Scissors, inspect: ListTree };
export function App() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("epubMergeLanguage") === "zh" ? "zh" : "en");
  const [dark, setDark] = useState(() => localStorage.getItem("epubTheme") ? localStorage.getItem("epubTheme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  const [dragging, setDragging] = useState(false);
  const copy = COPY[language];
  const workspace = useWorkspace(copy);
  const w = workspace;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; localStorage.setItem("epubMergeLanguage", language); }, [language]);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("epubTheme", dark ? "dark" : "light"); }, [dark]);
  const choose = () => input.current?.click();
  const totalSize = w.books.reduce((sum, b) => sum + b.file.size, 0);
  const totalChapters = w.books.reduce((sum, b) => sum + (b.chapters || 0), 0);
  const actionLabel = w.mode === "merge" ? copy.mergeAction : w.mode === "split" ? copy.splitAction : copy.inspectAction;
  const canRun = !!w.books.length && w.books.every(b => b.status === "ready") && !w.locked;
  return <div className="app-shell">
    <header className="site-header"><a href={import.meta.env.BASE_URL} className="brand" aria-label="EPUB Toolkit"><span className="brand-mark"><BookOpen size={21} strokeWidth={1.7}/></span><span>epub<span className="brand-light">toolkit</span></span><span className="version">1.0</span></a><nav className="header-tools" aria-label={copy.settings}><Button variant="ghost" size="icon" aria-label={copy.language} onClick={() => setLanguage(language === "en" ? "zh" : "en")}><Languages/></Button><Button variant="ghost" size="icon" aria-label={copy.theme} onClick={() => setDark(!dark)}>{dark ? <Sun/> : <Moon/>}</Button><span className="header-divider"/><Button variant="ghost" size="icon" asChild><a href="https://github.com/yumizhi/lightweight_epub_merge_tool" aria-label="GitHub"><Code2/></a></Button></nav></header>
    <main>
      <section className="intro"><div className="eyebrow"><span className="status-dot"/>YOUR LIBRARY, SIMPLIFIED</div><h1>{copy.intro}</h1><p>{copy.description}</p></section>
      <Tabs value={w.mode} onValueChange={value => w.changeMode(value as Mode)} className="workspace">
        <div className="workspace-bar"><TabsList aria-label="EPUB tools">{(["merge", "split", "inspect"] as const).map(mode => { const Icon = icons[mode]; return <TabsTrigger key={mode} value={mode} disabled={w.locked}><Icon size={16}/>{copy[mode]}</TabsTrigger>; })}</TabsList><span className="local-badge"><LockKeyhole size={13}/>{language === "en" ? "100% on-device" : "完全本地处理"}</span></div>
        {(["merge", "split", "inspect"] as const).map(mode => <TabsContent value={mode} key={mode} className="workspace-content"><div className="work-area">
          <div className="work-heading"><span className="step-number">01</span><div><h2>{copy[mode]}</h2><p>{copy[`${mode}Hint`]}</p></div></div>
          <input ref={w.mode === mode ? input : undefined} type="file" accept=".epub,application/epub+zip" multiple={mode === "merge"} className="sr-only" aria-label={copy.browse} disabled={w.locked} onChange={event => { void w.add(Array.from(event.target.files || [])); event.target.value = ""; }}/>
          <div className={`dropzone ${dragging ? "dragging" : ""} ${w.books.length ? "compact" : ""}`} onDragOver={e => { e.preventDefault(); if (!w.locked) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (!w.locked) void w.add(Array.from(e.dataTransfer.files)); }}>
            <div className="upload-symbol"><Upload size={24} strokeWidth={1.5}/></div><div><h3>{mode === "merge" ? copy.drop : copy.dropOne}</h3><p>{copy.dropHint}</p></div><Button variant="outline" disabled={w.locked} onClick={choose}>{copy.browse}<ChevronRight/></Button>
          </div>
          {w.books.length > 0 ? <FileQueue books={w.books} merge={mode === "merge"} locked={w.locked} copy={copy} onAdd={choose} onClear={w.reset} onMove={w.move} onRemove={w.remove} onSort={w.sort}/> : <p className="empty-caption">{copy.empty}</p>}
          {mode === "split" && <p className="operation-note"><CircleAlert size={16}/>{copy.splitNote}</p>}
          {w.error && <Alert variant="destructive" className="mt-6"><CircleAlert className="h-4 w-4"/><AlertTitle>{copy.error}</AlertTitle><AlertDescription className="break-words">{w.error}</AlertDescription></Alert>}
          {(w.busy || w.reading) && <div className="task-status" role="status"><LoaderCircle className="animate-spin" size={18}/><span>{w.reading ? copy.reading : copy.working}</span><Button variant="ghost" size="sm" onClick={w.stop}><X/>{copy.cancel}</Button></div>}
          {!!w.outputs.length && <Downloads outputs={w.outputs} copy={copy} busy={w.locked} download={w.download} downloadAll={w.downloadAll}/>}
          {w.report && <Inspection report={w.report} copy={copy}/>}
        </div><aside className="settings-area">
          <Card className="settings-card"><CardHeader><div className="flex items-center gap-3"><span className="step-number">02</span><CardTitle>{mode === "merge" ? copy.settings : copy[mode]}</CardTitle></div></CardHeader><CardContent>
            {mode === "merge" ? <div className="settings-fields"><label htmlFor="collection-title">{copy.bookTitle}<Input id="collection-title" value={w.title} placeholder={language === "en" ? "My collected volumes" : "我的藏书合集"} disabled={w.locked} onChange={e => w.setTitle(e.target.value)}/></label><label htmlFor="output-name">{copy.outputName}<Input id="output-name" value={w.outputName} disabled={w.locked} onChange={e => w.setOutputName(e.target.value)}/></label><div><label id="toc-label">{copy.structure}</label><Select value={w.structure} onValueChange={value => w.setStructure(value as "volume" | "flat")} disabled={w.locked}><SelectTrigger aria-labelledby="toc-label"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="volume">{copy.volume}</SelectItem><SelectItem value="flat">{copy.flat}</SelectItem></SelectContent></Select><p className="field-hint">{w.structure === "volume" ? copy.volumeHint : copy.flatHint}</p></div></div> : <p className="aside-description">{mode === "split" ? copy.splitNote : copy.inspectNote}</p>}
            <div className="summary-line"><span>{w.books.length} {copy.books}</span><span>{totalChapters} {copy.chapters}</span><span>{formatSize(totalSize)}</span></div><Button className="primary-action w-full" disabled={!canRun} onClick={w.process}>{w.busy ? <LoaderCircle className="animate-spin"/> : null}{actionLabel}<ArrowRight/></Button>
          </CardContent></Card>
          <div className="privacy-note"><ShieldCheck size={21} strokeWidth={1.5}/><div><h3>{copy.privacy}</h3><p>{copy.privacyHint}</p></div></div>
          <a className="help-link" href="https://github.com/yumizhi/lightweight_epub_merge_tool#readme" target="_blank" rel="noreferrer">{copy.guide}<ArrowRight size={14}/></a>
        </aside></TabsContent>)}
      </Tabs>
      <div className="bottom-note"><BookOpen size={15}/><span>{copy.tagline}</span></div>
    </main><footer><span>{copy.footer}</span><a href="https://github.com/yumizhi/lightweight_epub_merge_tool/blob/main/LICENSE">Apache-2.0<ArrowRight size={12}/></a></footer>
    <Toaster theme={dark ? "dark" : "light"} richColors closeButton/>
  </div>;
}
