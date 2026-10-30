import { InvalidEpubError } from "./errors.js";
import { dirnamePosix, relPosix, utf8Decode, utf8Encode } from "./utils.js";

export const isExternal = (href: string) =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
export const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
// ZIP names and merge-record opf_path values are literal archive paths.
export function archivePath(path: string): string {
  if (path.startsWith("/") || path.includes("\\")) throw new InvalidEpubError(`Unsupported archive path: ${path}`);
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new InvalidEpubError(`Archive path escapes the EPUB: ${path}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
export function resolvePath(base: string, href: string): string {
  const parts: string[] = [];
  const path = decodeURIComponent(href.split(/[?#]/, 1)[0]);
  if (isExternal(href) || path.startsWith("/"))
    throw new InvalidEpubError(`Unsupported resource path: ${href}`);
  for (const part of `${base}/${path}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length)
        throw new InvalidEpubError(`Resource path escapes the EPUB: ${href}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
export function remapReference(
  href: string,
  fromPath: string,
  outputPath: string,
  paths: Map<string, string>,
): string {
  if (!href || href.startsWith("#") || isExternal(href)) return href;
  const target = href.startsWith("?") ? fromPath : resolvePath(dirnamePosix(fromPath), href);
  const mapped = paths.get(target);
  if (mapped === undefined)
    throw new InvalidEpubError(
      `${fromPath}: reference points to a missing resource: ${href}`,
    );
  const suffix = href.slice(
    href.search(/[?#]/) < 0 ? href.length : href.search(/[?#]/),
  );
  if (relPosix(dirnamePosix(fromPath), target) === relPosix(dirnamePosix(outputPath), decodeURIComponent(mapped))) return href;
  return (
    encodePath(relPosix(dirnamePosix(outputPath), decodeURIComponent(mapped))) +
    suffix
  );
}
function xmlDecode(value: string) {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const names: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };
      return (
        names[entity] ??
        String.fromCodePoint(
          entity[2].toLowerCase() === "x"
            ? parseInt(entity.slice(3, -1), 16)
            : parseInt(entity.slice(2, -1), 10),
        )
      );
    },
  );
}
function cssReferences(text: string, rewrite: (href: string) => string): string {
  // Match complete comments and strings before looking inside CSS functions.
  // This leaves examples such as content: "url(missing.png)" alone.
  return text.replace(
    /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\burl\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\[\s\S]|[^\s)'"\\])*))\s*\)|@import\s+(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)')/gi,
    (token, double, single, bare, importDouble, importSingle) => {
      const raw = double ?? single ?? bare ?? importDouble ?? importSingle;
      if (raw === undefined) return token;
      const href = raw.replace(/\\([\da-f]{1,6}\s?|\r\n|[\s\S])/gi, (_: string, escaped: string) =>
        /^[\da-f]/i.test(escaped) ? String.fromCodePoint(parseInt(escaped.trim(), 16)) : /[\r\n\f]/.test(escaped) ? "" : escaped,
      );
      const result = rewrite(href);
      if (result === href) return token;
      const escaped = result.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      return /^@import/i.test(token) ? `@import "${escaped}"` : `url("${escaped}")`;
    },
  );
}
const CSS_ATTRIBUTES = new Set(["style", "fill", "stroke", "filter", "clip-path", "mask", "cursor", "marker", "marker-start", "marker-mid", "marker-end"]);
const URI_ATTRIBUTES = new Set(["href", "src", "poster", "data", "xlink:href"]);
function srcsetReferences(value: string, rewrite: (href: string) => string): string {
  // A data URL can contain commas. Its URL ends at whitespace, while ordinary
  // candidates may also end at a comma. Descriptors are left untouched.
  return value.replace(/(^|,\s*)(data:[^\s]+|[^\s,]+)([^,]*)/gi,
    (_, start, href, descriptor) => start + rewrite(href) + descriptor);
}
// Keep markup and unchanged bytes. Only actual attributes are visited, including
// > inside quotes; scripts, comments and CDATA are consumed as complete tokens.
export function rewriteReferences(
  data: Uint8Array,
  mediaType: string,
  rewrite: (href: string) => string,
): Uint8Array {
  const css = mediaType === "text/css";
  if (!css && !/xhtml|svg|html|xml/.test(mediaType)) return data;
  const original = utf8Decode(data);
  if (css) {
    const result = cssReferences(original, rewrite);
    return result === original ? data : utf8Encode(result);
  }
  const text = original.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>|<[a-z][\w:.-]*(?:[^>"']|"[^"]*"|'[^']*')*>|(<\/style\s*>)/gi,
    (tag) => {
      if (/^<!|^<script\b|^<\//i.test(tag)) return tag;
      return tag.replace(/(\s([\w:.-]+)\s*=\s*)(["'])([\s\S]*?)\3/g,
        (attribute, prefix: string, name: string, quote: string, value: string) => {
          name = name.toLowerCase();
          if (!URI_ATTRIBUTES.has(name) && !CSS_ATTRIBUTES.has(name) && name !== "srcset") return attribute;
          const decoded = xmlDecode(value);
          const result = CSS_ATTRIBUTES.has(name) ? cssReferences(decoded, rewrite)
            : name === "srcset" ? srcsetReferences(decoded, rewrite) : rewrite(decoded);
          if (result === decoded) return attribute;
          return prefix + quote + result.replaceAll("&", "&amp;").replaceAll(quote, quote === '"' ? "&quot;" : "&apos;") + quote;
        });
    },
  ).replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<script\b[^>]*>[\s\S]*?<\/script\s*>|(<style\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/style\s*>)/gi,
    (match, start, content, end) => start ? start + cssReferences(content, rewrite) + end : match);
  return text === original ? data : utf8Encode(text);
}
