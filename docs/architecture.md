# How EPUB Toolkit works

## Keep the book on the device

React and TypeScript provide the workspace. A dedicated Web Worker reads and processes the selected `File` objects. The main thread receives completed output buffers through transferable messages, then creates download URLs. Closing or resetting the workspace releases these URLs.

The workload needs local ZIP/XML processing and file downloads. A backend would add file transfers and storage to that flow. The static app can be served from GitHub Pages and cached for offline use.

The Worker accepts one active operation at a time. Metadata analysis runs through the queue sequentially. Cancellation terminates the Worker, rejects its pending request, and invalidates the active task generation. The next task creates a fresh Worker. This also interrupts synchronous ZIP work and prevents a late response from replacing newer state.

## Read metadata before assets

`readBookSummary` uses fflate's ZIP filter to inflate only the container, package, and navigation. ZIP member names are scanned to check that manifest resources exist. Previewing a book does not inflate its images or fonts, compute a full-file digest, or retain an asset map.

Merge orders these summaries first, then reads one complete source at a time. Source objects are released after their resources have been added to the output. The output and its ZIP buffer still need memory, so very large collections remain limited by the browser's available memory. The implementation keeps synchronous compression inside the Worker; it does not introduce a streaming framework.

## Map resources once

Every source gets an independent `vN/` directory. The mapping uses normalized archive paths, resolved relative to the source OPF. This prevents source filenames from colliding with each other or with the generated package and navigation.

XHTML URI attributes, `srcset`, SVG links, inline styles, CSS `url(...)`, and quoted CSS imports are resolved from the file that contains them. The output reference is relative to that file's new location. Query strings and fragments survive; external and data URIs remain external and are never fetched by the processing code.

Binary images and plain fonts are pooled by media type and SHA-256. SVGs stay separate because their contents can contain relative references. XHTML and stylesheets also stay separate. Each source's merge record stores the resource mapping and reference replacements needed for reconstruction.

Already compressed image formats and WOFF2 fonts are stored without another compression pass. XML and CSS use ZIP deflate. The EPUB `mimetype` entry is first and uncompressed.

## Preserve reading order and navigation

The spine remains the reading order. EPUB 2 NCX links and EPUB 3 navigation links are resolved relative to the navigation file, which can be in a different directory from the OPF. Nested navigation keeps its depth. Volume mode adds a level for each book; flat mode puts the chapters at one level. Repeated chapter names are allowed.

Generated books use an EPUB 3 package with a unique identifier, modification time, navigation document, and the combined authors. Split restores each source's OPF location and resource paths, and regenerates its package and navigation. This preserves content and assets rather than the original ZIP bytes or every source metadata field. The merge-record schema remains `epub-merge-tool/v1` so existing tool-generated collections can be opened.

Reflowable EPUB 2/3 is the supported scope. Encrypted and obfuscated resources are rejected with a visible message, because copying them under a new package identifier would leave their decoding information inconsistent.

## Share the core where the runtimes match

The browser Worker and Node CLI call the same TypeScript functions. Python retains a separate implementation to keep its installation free of Node and third-party runtime requirements. Tests check TypeScript-to-Python and Python-to-TypeScript reconstruction, including binary assets and CSS references.

## Cache the app, not the books

The PWA precaches the static application and emitted Worker bundle under Vite's resolved base path. It does not persist inputs or outputs. An update waits for the user to apply it, with the update button disabled during a task. The Pages workflow stays manual.

Vitest covers package parsing, ordering, navigation, resource mapping, binary preservation, and CLI interoperability. Playwright exercises the built application at the repository's Pages path, including downloads, cancellation, mobile layout, preferences, and processing after an offline reload. EPUBCheck validates the generated EPUB 3 packages from mixed EPUB 2/3 inputs.
