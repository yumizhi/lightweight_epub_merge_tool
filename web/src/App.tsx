import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Moon, Sun, Upload, X, CircleAlert } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { PwaStatus } from "./components/PwaStatus";
import { FileQueue } from "./components/FileQueue";
import { Downloads, Inspection } from "./components/Results";
import { useWorkspace, type Mode } from "./hooks/useWorkspace";
import { COPY, type Language } from "./i18n";
import { formatSize } from "./lib/utils";

export function App() {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem("epubMergeLanguage") === "zh" ? "zh" : "en",
  );
  const [dark, setDark] = useState(() =>
    localStorage.getItem("epubTheme")
      ? localStorage.getItem("epubTheme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [dragging, setDragging] = useState(false);
  const copy = COPY[language];
  const w = useWorkspace(copy);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    localStorage.setItem("epubMergeLanguage", language);
  }, [language]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("epubTheme", dark ? "dark" : "light");
  }, [dark]);
  const choose = () => input.current?.click();
  const totalSize = w.books.reduce((sum, b) => sum + b.file.size, 0);
  const totalChapters = w.books.reduce((sum, b) => sum + (b.chapters || 0), 0);
  const actionLabel =
    w.mode === "merge"
      ? copy.mergeAction
      : w.mode === "split"
        ? copy.splitAction
        : copy.inspectAction;
  const canRun =
    !!w.books.length && w.books.every((b) => b.status === "ready") && !w.locked;
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="site-header">
          <a href={import.meta.env.BASE_URL} className="brand">
            <h1>EPUB Toolkit</h1>
          </a>
          <nav className="header-tools" aria-label={copy.settings}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={copy.language}
              onClick={() => setLanguage(language === "en" ? "zh" : "en")}
            >
              {language === "en" ? "中文" : "EN"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={copy.theme}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            <span className="header-divider" />
            <Button variant="ghost" size="sm" asChild>
              <a href="https://github.com/yumizhi/lightweight_epub_merge_tool">
                GitHub
              </a>
            </Button>
          </nav>
        </header>
        <main>
          <Tabs
            value={w.mode}
            onValueChange={(value) => w.changeMode(value as Mode)}
            className="workspace"
          >
            <div className="workspace-toolbar">
              <TabsList aria-label="EPUB tools">
                {(["merge", "split", "inspect"] as const).map((mode) => (
                  <TabsTrigger key={mode} value={mode} disabled={w.locked}>
                    {copy[mode]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {(["merge", "split", "inspect"] as const).map((mode) => (
              <TabsContent
                value={mode}
                key={mode}
                className="workspace-content"
              >
                <motion.div
                  className="workspace-grid"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  <Card className="file-panel">
                    <CardHeader>
                      <CardTitle>{copy[mode]}</CardTitle>
                      <CardDescription>{copy[`${mode}Hint`]}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <input
                        ref={w.mode === mode ? input : undefined}
                        type="file"
                        accept=".epub,application/epub+zip"
                        multiple={mode === "merge"}
                        className="sr-only"
                        aria-label={copy.browse}
                        disabled={w.locked}
                        onChange={(event) => {
                          void w.add(Array.from(event.target.files || []));
                          event.target.value = "";
                        }}
                      />
                      <div
                        className={`dropzone ${dragging ? "dragging" : ""} ${w.books.length ? "compact" : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (!w.locked) setDragging(true);
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node,
                            )
                          )
                            setDragging(false);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragging(false);
                          if (!w.locked)
                            void w.add(Array.from(event.dataTransfer.files));
                        }}
                      >
                        <Upload className="drop-icon" size={20} />
                        <div>
                          <h2>{mode === "merge" ? copy.drop : copy.dropOne}</h2>
                          <p>{copy.dropHint}</p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={w.locked}
                          onClick={choose}
                        >
                          {copy.browse}
                        </Button>
                      </div>
                      {w.books.length > 0 && (
                        <FileQueue
                          books={w.books}
                          merge={mode === "merge"}
                          locked={w.locked}
                          copy={copy}
                          onAdd={choose}
                          onClear={w.reset}
                          onMove={w.move}
                          onRemove={w.remove}
                          onSort={w.sort}
                        />
                      )}
                      {mode === "split" && (
                        <p className="operation-note">{copy.splitNote}</p>
                      )}
                      {w.error && (
                        <Alert variant="destructive" className="mt-5">
                          <CircleAlert className="h-4 w-4" />
                          <AlertTitle>{copy.error}</AlertTitle>
                          <AlertDescription className="break-words">
                            {w.error}
                          </AlertDescription>
                        </Alert>
                      )}
                      <AnimatePresence>
                        {w.locked && (
                          <motion.div
                            className="task-status"
                            role="status"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <LoaderCircle className="animate-spin" size={16} />
                            <span>
                              {w.progress ? (
                                <>
                                  {copy.stages[w.progress.phase]}
                                  {w.progress.phase !== "writing" &&
                                    ` · ${w.progress.completed}/${w.progress.total}`}
                                  {w.progress.file && (
                                    <small className="task-file">
                                      {w.progress.file}
                                    </small>
                                  )}
                                </>
                              ) : w.reading ? (
                                copy.reading
                              ) : (
                                copy.working
                              )}
                            </span>
                            <Button variant="ghost" size="sm" onClick={w.stop}>
                              <X />
                              {copy.cancel}
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {!!w.outputs.length && (
                          <motion.div
                            key="outputs"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Downloads
                              outputs={w.outputs}
                              copy={copy}
                              busy={w.locked}
                              download={w.download}
                              downloadAll={w.downloadAll}
                            />
                          </motion.div>
                        )}
                        {w.report && (
                          <motion.div
                            key="inspection"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                          >
                            <Inspection report={w.report} copy={copy} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                  <aside>
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {mode === "merge" ? copy.settings : copy[mode]}
                        </CardTitle>
                        <CardDescription>
                          {mode === "merge"
                            ? copy.volumeHint
                            : mode === "split"
                              ? copy.splitHint
                              : copy.inspectHint}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {mode === "merge" && (
                          <div className="settings-fields">
                            <label htmlFor="collection-title">
                              {copy.bookTitle}
                              <Input
                                id="collection-title"
                                value={w.title}
                                placeholder={
                                  language === "en" ? "Collection" : "合集"
                                }
                                disabled={w.locked}
                                onChange={(event) =>
                                  w.setTitle(event.target.value)
                                }
                              />
                            </label>
                            <label htmlFor="output-name">
                              {copy.outputName}
                              <Input
                                id="output-name"
                                value={w.outputName}
                                disabled={w.locked}
                                onChange={(event) =>
                                  w.setOutputName(event.target.value)
                                }
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
                                  <SelectItem value="volume">
                                    {copy.volume}
                                  </SelectItem>
                                  <SelectItem value="flat">
                                    {copy.flat}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="field-hint">
                                {w.structure === "volume"
                                  ? copy.volumeHint
                                  : copy.flatHint}
                              </p>
                            </div>
                          </div>
                        )}
                        <dl className="file-summary">
                          <div>
                            <dt>{language === "en" ? "Files" : "文件"}</dt>
                            <dd>{w.books.length}</dd>
                          </div>
                          <div>
                            <dt>{language === "en" ? "Chapters" : "章节"}</dt>
                            <dd>{totalChapters}</dd>
                          </div>
                          <div>
                            <dt>
                              {language === "en" ? "Total size" : "总大小"}
                            </dt>
                            <dd>{formatSize(totalSize)}</dd>
                          </div>
                        </dl>
                        <Button
                          className="w-full"
                          disabled={!canRun}
                          onClick={w.process}
                        >
                          {w.busy && <LoaderCircle className="animate-spin" />}
                          {actionLabel}
                        </Button>
                      </CardContent>
                    </Card>
                  </aside>
                </motion.div>
              </TabsContent>
            ))}
          </Tabs>
        </main>
        <footer>
          <div className="footer-info">
            <span>{copy.privacyHint}</span>
            <PwaStatus copy={copy} locked={w.locked} />
          </div>
          <div className="footer-links">
            <span>Apache-2.0</span>
            <a
              href="https://github.com/yumizhi/lightweight_epub_merge_tool#readme"
              target="_blank"
              rel="noreferrer"
            >
              {copy.guide}
            </a>
          </div>
        </footer>
        <Toaster theme={dark ? "dark" : "light"} closeButton />
      </div>
    </MotionConfig>
  );
}
