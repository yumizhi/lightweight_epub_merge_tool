import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TocEntry } from "../../../ts/src/models.js";
import type { Copy } from "../i18n";
import { contentsTree, type TocNode } from "../lib/toc";
import { Button } from "./ui/button";

const PAGE_SIZE = 24;
function Branch({
  node,
  copy,
  showPaths,
  initiallyOpen,
}: {
  node: TocNode;
  copy: Copy;
  showPaths: boolean;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <li>
      {node.children.length ? (
        <>
          <button
            className="toc-toggle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight className={open ? "expanded" : ""} size={14} />
            <span>{node.title}</span>
            <small>{node.children.length}</small>
          </button>
          {open && (
            <Branches nodes={node.children} copy={copy} showPaths={showPaths} />
          )}
        </>
      ) : (
        <div className="toc-leaf">
          <span>{node.title}</span>
        </div>
      )}
      {showPaths && node.href && (
        <small className="toc-path">{node.href}</small>
      )}
    </li>
  );
}
function Branches({
  nodes,
  copy,
  showPaths,
  openRoots = false,
}: {
  nodes: TocNode[];
  copy: Copy;
  showPaths: boolean;
  openRoots?: boolean;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  return (
    <>
      <ol className="contents-tree">
        {nodes.slice(0, visible).map((node) => (
          <Branch
            key={`${node.key}:${node.title}:${node.href}`}
            node={node}
            copy={copy}
            showPaths={showPaths}
            initiallyOpen={openRoots && nodes.length < 8}
          />
        ))}
      </ol>
      {visible < nodes.length && (
        <Button
          variant="ghost"
          size="sm"
          className="toc-more"
          onClick={() => setVisible(visible + PAGE_SIZE)}
        >
          {copy.showMore} ({nodes.length - visible})
        </Button>
      )}
    </>
  );
}
export function Contents({
  entries,
  copy,
  showPaths = false,
}: {
  entries: TocEntry[];
  copy: Copy;
  showPaths?: boolean;
}) {
  const tree = useMemo(() => contentsTree(entries), [entries]);
  return <Branches nodes={tree} copy={copy} showPaths={showPaths} openRoots />;
}
