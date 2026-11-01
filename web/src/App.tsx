import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { LayoutGroup, motion, MotionConfig, useReducedMotion } from "motion/react";
import { Toaster } from "sonner";
import { Button } from "./components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { PwaStatus } from "./components/PwaStatus";
import { TaskStatus } from "./components/WorkspacePanels";
import { WorkspaceStage } from "./components/WorkspaceStage";
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
  const workspace = useRef<HTMLDivElement>(null);
  const lastMode = useRef(w.mode);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    localStorage.setItem("epubMergeLanguage", language);
  }, [language]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("epubTheme", dark ? "dark" : "light");
  }, [dark]);
  useLayoutEffect(() => {
    if (lastMode.current === w.mode) return;
    lastMode.current = w.mode;
    if (document.activeElement === document.body || workspace.current?.querySelector(".workspace-stage")?.contains(document.activeElement)) {
      workspace.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    }
  }, [w.mode]);
  return (
    <MotionConfig reducedMotion="user" transition={{ layout: reduced ? { duration: 0 } : MOTION.spatial }}>
      <LayoutGroup>
        <div className="app-shell">
          <header className="site-header">
            <a href={import.meta.env.BASE_URL} className="brand">
              <h1>EPUB Toolkit</h1>
            </a>
            <nav className="header-tools" aria-label={copy.appControls}>
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
              <PwaStatus copy={copy} locked={w.locked} />
              <span className="header-divider" aria-hidden />
              <Button variant="ghost" size="sm" asChild>
                <a href="https://github.com/yumizhi/lightweight_epub_merge_tool">
                  GitHub
                </a>
              </Button>
            </nav>
          </header>
          <main>
            <Tabs
              ref={workspace}
              value={w.mode}
              onValueChange={(value) => w.changeMode(value as Mode)}
              className="workspace"
            >
              <div className="workspace-toolbar">
                <TabsList aria-label={copy.tools}>
                  {(["merge", "split", "inspect"] as const).map((mode) => (
                    <TabsTrigger key={mode} value={mode} aria-description={w.saved[mode] ? copy.hasWork : undefined} title={w.saved[mode] ? copy.hasWork : undefined}>
                      {w.mode === mode && <motion.span className="tab-highlight" layoutId={reduced ? undefined : "active-tool"} transition={reduced ? { duration: 0 } : MOTION.spatial} aria-hidden />}
                      {copy[mode]}
                      {w.saved[mode] && (
                        <span className="saved-dot" aria-hidden />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {w.task && (
                <div className="background-task">
                  <TaskStatus w={w} copy={copy} />
                </div>
              )}
              <WorkspaceStage w={w} copy={copy} />
            </Tabs>
          </main>
          <motion.footer layout={reduced ? false : "position"} transition={{ layout: reduced ? { duration: 0 } : MOTION.spatial }}>
            <span>{copy.privacyHint}</span>
            <div className="footer-links">
              <a href="https://github.com/yumizhi/lightweight_epub_merge_tool#what-it-does" target="_blank" rel="noreferrer">{copy.guide}</a>
              <span aria-hidden>·</span>
              <a href="https://github.com/yumizhi/lightweight_epub_merge_tool/blob/main/LICENSE" target="_blank" rel="noreferrer">Apache-2.0</a>
            </div>
          </motion.footer>
          <Toaster
            theme={dark ? "dark" : "light"}
            position="top-center"
            toastOptions={{ duration: 2200 }}
            closeButton
          />
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
