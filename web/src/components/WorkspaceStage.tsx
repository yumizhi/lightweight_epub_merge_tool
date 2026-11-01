import { forwardRef } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { TabsContent } from "./ui/tabs";
import { Card, CardContent } from "./ui/card";
import { Inspection } from "./Results";
import { ActionArea, MergeSettings, SourcePicker, SplitDetails } from "./WorkspacePanels";
import type { Workspace } from "../hooks/useWorkspace";
import type { Copy } from "../i18n";
import { MOTION } from "../lib/motion";

const WorkspaceDetails = forwardRef<HTMLDivElement, { w: Workspace; copy: Copy }>(function WorkspaceDetails({ w, copy }, ref) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const settings = w.mode === "merge";
  return (
    <motion.div
      ref={ref}
      className={`workspace-detail ${settings ? "settings-column" : "details-column"}`}
      data-detail={w.mode}
      inert={!present}
      aria-hidden={!present || undefined}
      layout={reduced ? false : "position"}
      initial={{ opacity: reduced ? 1 : 0, x: reduced || !settings ? 0 : 12, clipPath: reduced || !settings ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 0% 100%)" }}
      animate={{ opacity: 1, x: 0, clipPath: "inset(0% 0% 0% 0%)" }}
      exit={{ opacity: 0, x: reduced || !settings ? 0 : 12, clipPath: reduced || !settings ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 0% 100%)", transition: { duration: reduced ? 0 : MOTION.exit } }}
      transition={{ duration: reduced ? 0 : MOTION.layout, ease: MOTION.ease, opacity: { duration: reduced ? 0 : MOTION.content } }}
    >
      {settings ? <MergeSettings w={w} copy={copy} /> : w.mode === "split" ? <SplitDetails w={w} copy={copy} /> : (
        <Card>
          <CardContent className="inspect-body">
            {w.report ? <Inspection report={w.report} copy={copy} /> : <ActionArea w={w} copy={copy} />}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
});

export function WorkspaceStage({ w, copy }: { w: Workspace; copy: Copy }) {
  const reduced = useReducedMotion();
  const compact = w.mode === "split" || !w.books.length;
  const columns = w.mode === "merge" && w.books.length > 0;
  return (
    <TabsContent forceMount value={w.mode} className="workspace-content" data-workspace={w.mode}>
      <motion.div className={`workspace-stage${compact ? " compact-stage" : ""}`} layout={!reduced} style={{ originY: 0 }}>
        <motion.div className={`workspace-grid${columns ? " merge-columns" : " single-workspace"}${w.mode === "split" ? " split-workspace" : ""}`} layout={reduced ? false : "position"} style={{ originY: 0 }}>
          <SourcePicker w={w} copy={copy} />
          <AnimatePresence initial={false} mode="popLayout">
            {!!w.books.length && <WorkspaceDetails key={w.mode} w={w} copy={copy} />}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </TabsContent>
  );
}
