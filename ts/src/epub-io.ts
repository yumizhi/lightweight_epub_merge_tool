import { builder, localKey, parseXml } from "./xml.js";
import { InvalidEpubError, ManifestError } from "./errors.js";
import type {
  InputFile,
  PackageMetadata,
  ManifestItem,
  SourceBook,
  TocEntry,
} from "./models.js";
import {
  asArray,
  dirnamePosix,
  escapeXml,
  safeBasename,
  sha256,
  textValue,
  utf8Decode,
  utf8Encode,
} from "./utils.js";
import { resolvePath, encodePath } from "./resources.js";
import { relPosix } from "./utils.js";
import { zipNames, readZip, type ZipEntry } from "./zip.js";

export const EPUB_MIMETYPE = "application/epub+zip";
export const MERGE_MANIFEST_PATH = "META-INF/epub-merge-tool.json";

export function readSourceBook(input: InputFile): SourceBook {
  return parseBook(input, false);
}

export function readBookSummary(input: InputFile): SourceBook {
  return parseBook(input, true);
}

function parseBook(input: InputFile, metadataOnly: boolean): SourceBook {
  const basename = safeBasename(input.name);
  // fflate's filter scans ZIP headers without inflating unrequested members.
  const zip = metadataOnly
    ? { get: (name: string) => readZip(input.data, new Set([name])).get(name) }
    : readZip(input.data);
  if (zip.get("META-INF/encryption.xml"))
    throw new InvalidEpubError(
      `${basename}: encrypted or obfuscated resources are not supported`,
    );
  const opfPath = readOpfPath(zip);
  const opfDir = dirnamePosix(opfPath);
  const opfData = zip.get(opfPath);
  if (!opfData)
    throw new InvalidEpubError(`${basename}: missing OPF ${opfPath}`);
  const opfRoot = rootObject(parseXml(opfData), "package");
  const metadata = objectOrThrow(
    localKey(opfRoot, "metadata"),
    `${basename}: missing metadata`,
  );
  const manifestNode = objectOrThrow(
    localKey(opfRoot, "manifest"),
    `${basename}: missing manifest`,
  );
  const spineNode = objectOrThrow(
    localKey(opfRoot, "spine"),
    `${basename}: missing spine`,
  );

  const metaNodes = asArray(localKey(metadata, "meta")) as Array<
    Record<string, unknown>
  >;
  if (
    metaNodes.some(
      (node) =>
        node["@_property"] === "rendition:layout" &&
        textValue(node) === "pre-paginated",
    ) ||
    asArray(localKey(spineNode, "itemref")).some((node) =>
      (stringAttr(node as Record<string, unknown>, "properties") ?? "")
        .split(/\s+/)
        .includes("rendition:layout-pre-paginated"),
    )
  )
    throw new InvalidEpubError(
      `${basename}: fixed-layout EPUBs are not supported`,
    );
  if (
    asArray(localKey(manifestNode, "item")).some(
      (node) => !!(node as Record<string, unknown>)["@_media-overlay"],
    )
  )
    throw new InvalidEpubError(
      `${basename}: EPUB media overlays are not supported`,
    );

  const title =
    textValue(localKey(metadata, "title")) ?? basename.replace(/\.epub$/i, "");
  const language = textValue(localKey(metadata, "language")) ?? "en";
  const creators = asArray(localKey(metadata, "creator"))
    .map(textValue)
    .filter((v): v is string => Boolean(v));

  const items = asArray(localKey(manifestNode, "item")).map((node, idx) => {
    const item = objectOrThrow(node, `${basename}: invalid manifest item`);
    const href = attr(item, "href", `${basename}: manifest item missing href`);
    resolvePath(opfDir, href);
    const mediaType = attr(
      item,
      "media-type",
      `${basename}: manifest item missing media-type`,
    );
    const id = stringAttr(item, "id") ?? `item${idx}`;
    const properties = (stringAttr(item, "properties") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    return { id, href, mediaType, properties };
  });

  const coverId = asArray(localKey(metadata, "meta")).find(
    (value) =>
      value &&
      typeof value === "object" &&
      (value as Record<string, unknown>)["@_name"] === "cover",
  ) as Record<string, unknown> | undefined;
  const cover = items.find((item) => item.id === coverId?.["@_content"]);
  if (cover && !cover.properties.includes("cover-image"))
    cover.properties.push("cover-image");
  const identifierId = stringAttr(opfRoot, "unique-identifier");
  const identifiers = asArray(localKey(metadata, "identifier"));
  const identifier =
    identifiers.find(
      (value) =>
        value &&
        typeof value === "object" &&
        (value as Record<string, unknown>)["@_id"] === identifierId,
    ) ?? identifiers[0];
  const packageMetadata: PackageMetadata = {
    identifier: textValue(identifier),
    publisher: textValue(localKey(metadata, "publisher")),
    description: textValue(localKey(metadata, "description")),
    rights: textValue(localKey(metadata, "rights")),
    date: textValue(localKey(metadata, "date")),
    subjects: asArray(localKey(metadata, "subject"))
      .map(textValue)
      .filter((v): v is string => !!v),
    pageProgressionDirection: stringAttr(
      spineNode,
      "page-progression-direction",
    ),
    spine: asArray(localKey(spineNode, "itemref")).map((value) => {
      const node = value as Record<string, unknown>;
      return {
        linear: stringAttr(node, "linear"),
        properties: stringAttr(node, "properties"),
      };
    }),
  };
  const names = metadataOnly ? zipNames(input.data) : undefined;
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new InvalidEpubError(`${basename}: duplicate manifest IDs`);
  for (const item of items) {
    if (names && !names.has(resolvePath(opfDir, item.href)))
      throw new InvalidEpubError(`${basename}: missing resource ${item.href}`);
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemData = new Map<string, Uint8Array>();
  for (const item of metadataOnly ? [] : items) {
    const name = resolvePath(opfDir, item.href);
    const data = zip.get(name);
    if (!data)
      throw new InvalidEpubError(`${basename}: missing zip member ${name}`);
    itemData.set(item.href, data);
  }

  const spineIds = asArray(localKey(spineNode, "itemref")).map((node) => {
    const ref = attr(
      objectOrThrow(node, `${basename}: invalid spine item`),
      "idref",
      `${basename}: spine item missing idref`,
    );
    if (!itemById.has(ref))
      throw new InvalidEpubError(
        `${basename}: spine references missing item ${ref}`,
      );
    return ref;
  });
  if (!spineIds.length)
    throw new InvalidEpubError(`${basename}: spine is empty`);

  const toc = readToc(
    zip,
    opfDir,
    basename,
    items,
    spineNode,
    spineIds,
    itemById,
  );
  return {
    version: stringAttr(opfRoot, "version") ?? "unknown",
    basename,
    sha256: metadataOnly ? "" : sha256(input.data),
    opfPath,
    opfDir,
    title,
    language,
    creators,
    manifestItems: items,
    spineIds,
    toc,
    itemData,
    packageMetadata,
  };
}

export function baseZipEntries(opfPath = "OEBPS/content.opf"): ZipEntry[] {
  return [
    { name: "mimetype", data: utf8Encode(EPUB_MIMETYPE), level: 0 },
    {
      name: "META-INF/container.xml",
      data: utf8Encode(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${escapeXml(encodePath(opfPath))}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`),
    },
  ];
}

export function buildOpf(
  title: string,
  language: string,
  creators: string[],
  items: ManifestItem[],
  spineIds: string[],
  navHref = "nav-merged.xhtml",
  metadata: PackageMetadata = {},
): Uint8Array {
  let navId = "nav";
  while (items.some((item) => item.id === navId)) navId = "_" + navId;
  const manifestItems = items.map((item) => {
    const attrs: Record<string, string> = {
      "@_id": item.id,
      "@_href": item.href,
      "@_media-type": item.mediaType,
    };
    const props = item.properties.filter((p) => p !== "nav");
    if (props.length) attrs["@_properties"] = props.join(" ");
    return attrs;
  });
  const root = {
    package: {
      "@_xmlns": "http://www.idpf.org/2007/opf",
      "@_version": "3.0",
      "@_unique-identifier": "bookid",
      metadata: {
        "@_xmlns:dc": "http://purl.org/dc/elements/1.1/",
        "dc:identifier": {
          "@_id": "bookid",
          "#text": metadata.identifier ?? `urn:uuid:${crypto.randomUUID()}`,
        },
        meta: {
          "@_property": "dcterms:modified",
          "#text": new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
        ...Object.fromEntries(
          ["publisher", "description", "rights", "date"]
            .filter((key) => metadata[key as keyof PackageMetadata])
            .map((key) => [
              `dc:${key}`,
              metadata[key as keyof PackageMetadata],
            ]),
        ),
        ...(metadata.subjects?.length
          ? { "dc:subject": metadata.subjects }
          : {}),
        "dc:title": title,
        "dc:language": language,
        ...(creators.length ? { "dc:creator": creators } : {}),
      },
      manifest: {
        item: [
          {
            "@_id": navId,
            "@_href": navHref,
            "@_media-type": "application/xhtml+xml",
            "@_properties": "nav",
          },
          ...manifestItems,
        ],
      },
      spine: {
        ...(metadata.pageProgressionDirection
          ? {
              "@_page-progression-direction": metadata.pageProgressionDirection,
            }
          : {}),
        itemref: spineIds.map((id, index) => ({
          "@_idref": id,
          ...(metadata.spine?.[index]?.linear
            ? { "@_linear": metadata.spine[index].linear }
            : {}),
          ...(metadata.spine?.[index]?.properties
            ? { "@_properties": metadata.spine[index].properties }
            : {}),
        })),
      },
    },
  };
  return utf8Encode(
    `<?xml version="1.0" encoding="utf-8"?>\n${builder.build(root)}`,
  );
}

export function buildVolumeNav(
  title: string,
  bookHref: string,
  volumes: Array<{ title: string; href: string; entries: TocEntry[] }>,
): Uint8Array {
  const entries: TocEntry[] = [];
  for (const volume of volumes) {
    entries.push({ title: volume.title, href: volume.href });
    entries.push(
      ...volume.entries.map((entry) => ({
        ...entry,
        depth: (entry.depth ?? 0) + 1,
      })),
    );
  }
  return utf8Encode(navShell(title, bookHref, tocList(entries)));
}

export function buildFlatNav(
  title: string,
  bookHref: string,
  entries: TocEntry[],
): Uint8Array {
  return utf8Encode(navShell(title, bookHref, tocList(entries)));
}

function tocList(entries: TocEntry[]): string {
  let html = "",
    previous = 0;
  entries.forEach((entry, index) => {
    const depth = Math.min(entry.depth ?? 0, index === 0 ? 0 : previous + 1);
    if (index) {
      if (depth > previous) html += "<ol>";
      else html += "</li>" + "</ol></li>".repeat(previous - depth);
    }
    html += entry.href
      ? `<li><a href="${escapeXml(entry.href)}">${escapeXml(entry.title)}</a>`
      : `<li><span>${escapeXml(entry.title)}</span>`;
    previous = depth;
  });
  return html + (entries.length ? "</li>" + "</ol></li>".repeat(previous) : "");
}

export function requireMergeManifest(
  data: Uint8Array,
): Record<string, unknown> {
  const parsed = JSON.parse(utf8Decode(data)) as Record<string, unknown>;
  if (parsed.schema !== "epub-merge-tool/v1")
    throw new ManifestError("unsupported epub-merge-tool manifest schema");
  if (!Array.isArray(parsed.sources) || !parsed.sources.length)
    throw new ManifestError("merge record has no source volumes");
  return parsed;
}

function navShell(title: string, href: string, nested: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${escapeXml(title)}</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <ol>${nested}</ol>
    </nav>
  </body>
</html>
`;
}

function readOpfPath(zip: Pick<Map<string, Uint8Array>, "get">): string {
  const data = zip.get("META-INF/container.xml");
  if (!data) throw new InvalidEpubError("missing META-INF/container.xml");
  const container = rootObject(parseXml(data), "container");
  const rootfiles = objectOrThrow(
    localKey(container, "rootfiles"),
    "missing rootfiles",
  );
  const rootfile = objectOrThrow(
    asArray(localKey(rootfiles, "rootfile"))[0],
    "missing rootfile",
  );
  return resolvePath(
    "",
    attr(rootfile, "full-path", "rootfile missing full-path"),
  );
}

function readToc(
  zip: Pick<Map<string, Uint8Array>, "get">,
  opfDir: string,
  basename: string,
  items: ManifestItem[],
  spineNode: Record<string, unknown>,
  spineIds: string[],
  itemById: Map<string, ManifestItem>,
): TocEntry[] {
  const nav = items.find((item) => item.properties.includes("nav"));
  if (nav)
    return relativeToc(
      parseNav(
        requiredZip(zip, resolvePath(opfDir, nav.href), basename),
        basename,
      ),
      opfDir,
      resolvePath(opfDir, nav.href),
    );
  const ncx = findNcx(items, spineNode);
  if (ncx)
    return relativeToc(
      parseNcx(
        requiredZip(zip, resolvePath(opfDir, ncx.href), basename),
        basename,
      ),
      opfDir,
      resolvePath(opfDir, ncx.href),
    );
  return spineIds.map((id, idx) => ({
    title: `Chapter ${idx + 1}`,
    href: itemById.get(id)!.href,
  }));
}

function relativeToc(
  entries: TocEntry[],
  opfDir: string,
  tocPath: string,
): TocEntry[] {
  return entries.map((entry) => {
    if (!entry.href) return entry;
    const index = entry.href.search(/[?#]/);
    const suffix = index < 0 ? "" : entry.href.slice(index);
    return {
      ...entry,
      href:
        encodePath(
          relPosix(
            opfDir,
            /^[?#]/.test(entry.href)
              ? tocPath
              : resolvePath(dirnamePosix(tocPath), entry.href),
          ),
        ) + suffix,
    };
  });
}

function findNcx(
  items: ManifestItem[],
  spineNode: Record<string, unknown>,
): ManifestItem | undefined {
  const tocId = stringAttr(spineNode, "toc");
  if (tocId) return items.find((item) => item.id === tocId);
  return items.find(
    (item) =>
      item.mediaType === "application/x-dtbncx+xml" ||
      item.href.toLowerCase().endsWith(".ncx"),
  );
}

type OrderedNode = Record<string, unknown>;
function orderedChildren(node: OrderedNode, name: string): OrderedNode[] {
  const key = Object.keys(node).find((key) => localName(key) === name);
  return key && Array.isArray(node[key]) ? (node[key] as OrderedNode[]) : [];
}
function orderedText(nodes: OrderedNode[]): string {
  return nodes
    .map((node) =>
      typeof node["#text"] === "string"
        ? node["#text"]
        : Object.keys(node)
            .filter((key) => key !== ":@")
            .map((key) =>
              Array.isArray(node[key])
                ? orderedText(node[key] as OrderedNode[])
                : "",
            )
            .join(""),
    )
    .join("");
}
function walkOrdered(
  nodes: OrderedNode[],
  cb: (
    name: string,
    children: OrderedNode[],
    attrs: Record<string, string>,
    depth: number,
  ) => void,
  depth = 0,
): void {
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (!Array.isArray(value)) continue;
      const name = localName(key);
      const next = depth + (["ol", "navPoint"].includes(name) ? 1 : 0);
      cb(name, value, (node[":@"] ?? {}) as Record<string, string>, next);
      walkOrdered(value, cb, next);
    }
  }
}
function orderedDocument(data: Uint8Array): OrderedNode[] {
  // Reuse XML validation, then preserve mixed text order in navigation labels.
  return parseXml(data, true) as OrderedNode[];
}
function parseNav(data: Uint8Array, basename: string): TocEntry[] {
  const navs: Array<{ children: OrderedNode[]; type: string }> = [];
  walkOrdered(orderedDocument(data), (name, children, attrs) => {
    if (name === "nav")
      navs.push({
        children,
        type: attrs["@_epub:type"] ?? attrs["@_type"] ?? "",
      });
  });
  const toc =
    navs.find((nav) => nav.type.split(/\s+/).includes("toc")) ?? navs[0];
  if (!toc)
    throw new InvalidEpubError(`${basename}: nav file has no nav element`);
  const entries: TocEntry[] = [];
  walkOrdered(toc.children, (name, children, _, depth) => {
    if (name !== "li") return;
    const label = children.find((node) =>
      Object.keys(node).some((key) => ["a", "span"].includes(localName(key))),
    );
    if (!label) return;
    const title = orderedText(
      orderedChildren(label, "a").length
        ? orderedChildren(label, "a")
        : orderedChildren(label, "span"),
    ).trim();
    const attrs = (label[":@"] ?? {}) as Record<string, string>;
    if (title)
      entries.push({
        title,
        href: attrs["@_href"] ?? "",
        ...(depth > 1 ? { depth: depth - 1 } : {}),
      });
  });
  if (!entries.some((entry) => entry.href))
    throw new InvalidEpubError(`${basename}: nav file has no TOC links`);
  return entries;
}
function parseNcx(data: Uint8Array, basename: string): TocEntry[] {
  const entries: TocEntry[] = [];
  walkOrdered(orderedDocument(data), (name, children, _, depth) => {
    if (name !== "navPoint") return;
    const label = children.find(
      (node) => orderedChildren(node, "navLabel").length,
    );
    const content = children.find((node) =>
      Object.keys(node).some((key) => localName(key) === "content"),
    );
    const title = label
      ? orderedText(orderedChildren(label, "navLabel")).trim()
      : "";
    const href = ((content?.[":@"] ?? {}) as Record<string, string>)["@_src"];
    if (title && href)
      entries.push({ title, href, ...(depth > 1 ? { depth: depth - 1 } : {}) });
  });
  if (!entries.length)
    throw new InvalidEpubError(`${basename}: toc.ncx has no navPoint entries`);
  return entries;
}

function requiredZip(
  zip: Pick<Map<string, Uint8Array>, "get">,
  name: string,
  basename: string,
): Uint8Array {
  const data = zip.get(name);
  if (!data)
    throw new InvalidEpubError(`${basename}: missing zip member ${name}`);
  return data;
}

function rootObject(
  parsed: unknown,
  expectedLocal: string,
): Record<string, unknown> {
  const obj = objectOrThrow(parsed, `invalid ${expectedLocal} XML`);
  for (const [key, value] of Object.entries(obj)) {
    if (localName(key) === expectedLocal)
      return objectOrThrow(value, `invalid ${expectedLocal} root`);
  }
  throw new InvalidEpubError(`missing ${expectedLocal} root`);
}

function objectOrThrow(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InvalidEpubError(message);
  return value as Record<string, unknown>;
}

function attr(
  node: Record<string, unknown>,
  name: string,
  message: string,
): string {
  const value = stringAttr(node, name);
  if (!value) throw new InvalidEpubError(message);
  return value;
}

function stringAttr(
  node: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = node[`@_${name}`];
  return typeof value === "string" ? value : undefined;
}

function localName(key: string): string {
  return key.includes(":") ? key.split(":").pop()! : key;
}
