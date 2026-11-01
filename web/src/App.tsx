import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import { Toaster } from "sonner";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Card, CardContent } from "./components/ui/card";
import { PwaStatus } from "./components/PwaStatus";
import { Inspection } from "./components/Results";
import {
  ActionArea,
  MergeSettings,
  SourcePicker,
  SplitWorkspace,
  TaskStatus,
} from "./components/WorkspacePanels";
import { useWorkspace, type Mode } from "./hooks/useWorkspace";
import { COPY, type Language } from "./i18n";
import { MOTION } from "./lib/motion";

export function App() {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem("epubMergeLanguage") === "zh" ? "zh" : "en",
  );
  const [dark, setDark] = useState(() =>
    localStorage.getItem("epubTheme")
      ? localStorage.getItem("epubTheme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const copy = COPY[language];
  const w = useWorkspace(copy);
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const lastMode = useRef(w.mode);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    localStorage.setItem("epubMergeLanguage", language);
  }, [language]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("epubTheme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (lastMode.current === w.mode) return;
    lastMode.current = w.mode;
    if (document.activeElement === document.body) {
      panel.current?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ block: "start" });
    }
  }, [w.mode]);
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
                  <TabsTrigger key={mode} value={mode}>
                    {copy[mode]}
                    {w.saved[mode] && (
                      <span className="saved-dot" aria-hidden />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <span className="workspace-hint">{copy.savedWork}</span>
            </div>
            {w.task && w.task.mode !== w.mode && (
              <div className="background-task">
                <TaskStatus w={w} copy={copy} />
              </div>
            )}
            <TabsContent
              ref={panel}
              key={w.mode}
              value={w.mode}
              className="workspace-content"
            >
              <motion.div
                key={w.mode}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "tween",
                  ease: MOTION.ease,
                  duration: reduced ? 0 : MOTION.content,
                }}
              >
                {w.mode === "merge" ? (
                  <div className="workspace-grid">
                    <SourcePicker w={w} copy={copy} />
                    <MergeSettings w={w} copy={copy} />
                  </div>
                ) : w.mode === "split" ? (
                  <SplitWorkspace w={w} copy={copy} />
                ) : (
                  <div className="inspect-workspace">
                    <SourcePicker w={w} copy={copy} />
                    {!!w.books.length && (
                      <Card>
                        <CardContent className="inspect-body">
                          {w.report ? (
                            <Inspection report={w.report} copy={copy} />
                          ) : (
                            <ActionArea w={w} copy={copy} />
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </motion.div>
            </TabsContent>
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
        <Toaster
          theme={dark ? "dark" : "light"}
          position="top-center"
          toastOptions={{ duration: 2200 }}
          closeButton
        />
      </div>
    </MotionConfig>
  );
}
