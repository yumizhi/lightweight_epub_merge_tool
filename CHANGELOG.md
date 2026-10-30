# Changelog

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
