# Changelog

## 1.2.0 — prepared for release

- Keep each tool’s files, settings and results when switching tabs. Clearing a workspace releases its download URLs; books are still kept only in memory.
- Arrange Merge inputs with mouse, touch or keyboard dragging, or with automatic sorting and arrow controls. Preview the actual grouped or flat navigation before merging.
- Use merged results directly in Inspect or Split. Split previews recoverable source books and keeps individual and ZIP downloads.
- Give Inspect a document-oriented view, with expandable navigation and on-demand resource paths. Long lists load in small batches.
- Keep processing feedback in the action area, allow cancellation from another tab, and replace obsolete downloads when inputs change.
- Unify short content transitions, spring layout changes and drag feedback, including reduced-motion support. Refresh responsive screenshots and a recording of the real workflow.

The v1.1 EPUB engine, ZIP implementation, CLI commands and manual Pages deployment remain in place.

## 1.1.0 — prepared for release

- Process Blob inputs sequentially and write ZIP members as they become available. Web downloads now return Blobs directly from the Worker.
- Preserve encoded resource paths, SVG presentation references, CSS literals, mixed navigation labels and non-link section headings. Check missing local references even when no resources are pooled.
- Restore essential package metadata and spine attributes on split. Recognize EPUB 2 covers and continue reading existing `epub-merge-tool/v1` records.
- Report actual reading, resource, writing, reconstruction and packing stages. Clear stale downloads when output settings change and recover cleanly from Worker failures.
- Add installable Node CLI/library artifacts alongside the Python wheel and source archive. Verify both installed CLIs with generated books.
- Expand generated EPUB, EPUBCheck and browser coverage, including cancellation during processing and download URL cleanup.

The ZIP runtime remains fflate. Original compressed ZIP streams are not reused. Input buffers and completed downloads still require memory. The supported scope is reflowable EPUB 2/3; encrypted/obfuscated resources, fixed layout and media overlays are unsupported. Split reconstructs volumes created by this tool, without promising identical original ZIP bytes or arbitrary chapter splitting.

The version has not been tagged, published or deployed by this change. The package workflow prepares artifacts; the Pages workflow remains manual.

## 1.0.0

Browser workspace with merge, split and inspect; shadcn/ui controls; English/Chinese; light/dark themes; responsive layout; offline PWA; Python and TypeScript CLIs; core, browser and EPUBCheck validation.
