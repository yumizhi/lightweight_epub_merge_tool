# How EPUB Toolkit works

## Local processing and task lifetime

React provides the workspace. A Web Worker receives the selected `File` objects, parses books, and produces downloads. No book content is uploaded or persisted. The PWA caches application assets, including the emitted Worker bundle; language and theme preferences are the only application data kept in local storage.

The Worker has one active request. Metadata analysis runs sequentially through the file queue. Processing messages carry a request ID and actual source/resource counts. Cancellation terminates the Worker, rejects its pending request, and invalidates the workspace generation. A subsequent request starts a fresh Worker. Old progress and results cannot replace newer state. Worker load, message decoding, and message submission failures clear the active request as well.

The Worker returns immutable `Blob` results. Structured cloning a Blob shares its backing storage, avoiding a complete output ArrayBuffer transfer and a second Blob construction on the main thread. Download URLs are revoked when results change or the workspace closes. Editing an output setting invalidates the old result.

## Analysis and execution

The processing path is:

`File → ZIP metadata → OPF/navigation → resource plan → binary pooling → reference checks/rewrites → ZIP entries → Blob → download`

`readBookSummary` uses fflate's ZIP filter to inflate only the container, package, and navigation. It scans ZIP member names to check manifest resources. It does not inflate images or fonts or compute a whole-book digest. Analysis and Inspect still read one complete **compressed** input buffer; the ZIP reader is not a seekable Blob reader.

Merge assigns source paths and compression choices in a small per-source plan. Binary images and plain fonts are processed first, so their canonical destinations are known before documents are checked. A resource is hashed once, pooled if the media type and SHA-256 agree, and written immediately when unique. SVG, XHTML and CSS are kept separate because they contain references. Whole-book SHA-256 values are no longer computed during merge: reconstruction has no consumer for them. The public `readSourceBook` API retains its existing digest and full asset map.

Documents are inflated one at a time. Every supported local reference is checked against the plan, including collections without duplicate resources. Only changed references are rewritten. Unchanged document bytes are passed to the ZIP writer directly, preserving formatting and avoiding another UTF-8 encoding pass.

The synchronous `mergeEpubs` API and asynchronous `mergeEpubFiles` entry point consume the same generator and resource plan. The latter loads one source Blob at a time. Automatic ordering needs a metadata prepass; explicit input order avoids that prepass. Neither path retains all source books' decoded resource maps.

Split reads the merge record and inflates individual members as needed. It reconstructs one output ZIP at a time. `splitEpubFile` returns Blobs; `splitEpub` keeps its synchronous Uint8Array API. Packing split downloads reads one output Blob at a time and stores its already compressed EPUB bytes without another deflate pass.

## ZIP implementation and memory limits

The application uses **one ZIP dependency: fflate**. Its `Zip`, `ZipDeflate` and `ZipPassThrough` APIs compress or store each incoming member and retain output chunks rather than all decoded entries. The `mimetype` member is first, uncompressed and has no extra field. Common compressed images and WOFF2 are stored; text and other resources use deflate.

A private executable comparison evaluated zip.js `BlobReader`, `ZipReader`, compressed pass-through and `ZipWriter`. The prototype retained unchanged PNG/JPEG entries' compression method, CRC32 and original size, rewrote XHTML/CSS, and produced an EPUBCheck-valid file. On the tested image workload its pass-through pipeline had higher elapsed cost than fflate repackaging. It would also require a second path for the existing synchronous API. Those results did not justify adding it to the shipped runtime. Private experiment scripts and measurements are excluded from Git.

`ZipPassThrough` in the shipped code stores **uncompressed member data**. It does not reuse original ZIP compressed streams. Reading a member still scans the central directory, and unchanged text is still compressed when the output is written. These are explicit tradeoffs of keeping the current small synchronous ZIP engine.

A source's compressed buffer, the current decoded member, and output chunks still consume memory. A Blob also needs backing storage, and all split output Blobs remain available for download. This reduces the decoded working set; it is **not an end-to-end bounded-memory pipeline**. Very large books remain limited by browser memory. The synchronous API also retains whatever input buffers its caller supplies.

## Paths and document references

A ZIP member name is a literal archive path. OPF `href`, navigation links and the container's `full-path` are URI references. URI paths are percent-decoded once when resolving an archive member and encoded when written as links. The merge record's `opf_path` is already a literal archive path and is not decoded again.

Every source gets its own `vN/` directory. The resource plan maps original archive paths to output and pooled destinations; manifest links and generated navigation use that mapping. Relative links are calculated from the file containing the reference, not from the OPF directory. Fragments and query strings survive. External and data URLs remain unchanged and are never fetched.

Reference handling covers URI-bearing XHTML/XML attributes, `srcset`, SVG links and URL-valued presentation attributes, inline styles, stylesheet `url(...)` and quoted `@import`. Quoted tag text, comments, CDATA and script contents are not treated as markup. CSS strings and comments are skipped before URL tokens are examined. CSS escapes are decoded for resolution. This is targeted reference rewriting, not a general HTML/CSS transformation system.

## Navigation and reconstruction metadata

The spine determines reading order. EPUB 2 NCX and EPUB 3 navigation are resolved relative to their own locations. Ordered XML parsing preserves mixed text in labels. Nested links and non-link section headings are retained. Volume mode adds a book level; flat mode keeps linked entries at one level and omits non-link grouping labels. Repeated titles are allowed.

Output packages are EPUB 3. The collection takes the first volume's language and page progression direction, combines creators and spine attributes, and uses the first declared cover. EPUB 2 cover declarations are normalized to `cover-image`. Each reconstructed volume restores its original OPF location, identifier, title, creators, language, publisher, description, rights, date, subjects, page progression direction and spine `linear`/`properties` attributes.

These fields live in optional `package_metadata` in the existing `epub-merge-tool/v1` record. Resource paths, replacements, reading order and TOC retain their existing meaning. Older records without the field are still readable. Older readers can ignore it. Unknown metadata extensions, package signatures, arbitrary chapter splitting and byte-for-byte ZIP reconstruction are outside the reconstruction contract.

The supported scope is reflowable EPUB 2/3. Encryption/obfuscation, fixed-layout packages and media overlays are rejected with a useful error rather than producing an incomplete package. Filenames with spaces are supported; EPUBCheck reports its expected PKG-010 warning about older reading systems for those deliberately retained paths.

## CLI and release verification

Node and the browser share the TypeScript core. Node's merge command opens file-backed Blobs so it can use the same sequential input path. Python retains its standard-library-only implementation and synchronizes correctness and merge-record changes. Interoperability tests run in both directions.

Vitest checks resource targets, navigation, pooling, binary bytes, metadata and old records. EPUBCheck validates merge and split outputs. Standard samples require zero errors and warnings; the space-name fixture permits only the specific PKG-010 warnings. Playwright checks downloads, real processing cancellation, URL cleanup, preferences, keyboard use, mobile layout, reduced motion and offline Worker processing at the Pages base path.

The manual release-package workflow builds Python wheel/sdist, an installable Node tarball and the Pages web build. Both installed CLIs run merge, split and inspect against generated EPUBs in clean environments. The Node tarball includes TypeScript declarations and only the core's runtime dependencies. Packaging does not publish a GitHub Release or deploy Pages. The existing manual Pages workflow is unchanged.
