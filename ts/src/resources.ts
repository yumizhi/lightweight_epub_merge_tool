import { InvalidEpubError } from "./errors.js";
import { dirnamePosix, relPosix, utf8Decode, utf8Encode } from "./utils.js";

export const isExternal = (href: string) =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
export const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
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
  const target = resolvePath(dirnamePosix(fromPath), href);
  const mapped = paths.get(target);
  if (mapped === undefined)
    throw new InvalidEpubError(
      `${fromPath}: reference points to a missing resource: ${href}`,
    );
  const suffix = href.slice(
    href.search(/[?#]/) < 0 ? href.length : href.search(/[?#]/),
  );
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
function cssReferences(
  text: string,
  rewrite: (href: string) => string,
): string {
  return text
    .split(/(\/\*[\s\S]*?\*\/)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(
              /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]*))\s*\)/gi,
              (_, double, single, bare) =>
                `url("${rewrite(double ?? single ?? bare)}")`,
            )
            .replace(
              /(@import\s+)(["'])(.*?)\2/gi,
              (_, prefix, quote, href) =>
                `${prefix}${quote}${rewrite(href)}${quote}`,
            ),
    )
    .join("");
}
// Preserve document markup; only rewrite URI-bearing attributes and CSS references.
export function rewriteReferences(
  data: Uint8Array,
  mediaType: string,
  rewrite: (href: string) => string,
): Uint8Array {
  const css = mediaType === "text/css";
  if (!css && !/xhtml|svg|html|xml/.test(mediaType)) return data;
  let text = utf8Decode(data);
  if (css) return utf8Encode(cssReferences(text, rewrite));
  text = text.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[a-z][^>]*>/gi,
    (tag) =>
      tag.startsWith("<!")
        ? tag
        : tag.replace(
            /(\s(?:href|src|poster|data|xlink:href|srcset|style)\s*=\s*)(["'])(.*?)\2/gi,
            (_, prefix: string, quote: string, value: string) => {
              const decoded = xmlDecode(value);
              let result: string;
              if (/style\s*=/i.test(prefix))
                result = cssReferences(decoded, rewrite);
              else if (/srcset\s*=/i.test(prefix))
                result = decoded.replace(
                  /(^|,\s*)(\S+?)(?=\s|,|$)/g,
                  (_, start, url) => start + rewrite(url),
                );
              else result = rewrite(decoded);
              if (result === decoded) return prefix + quote + value + quote;
              return (
                prefix +
                quote +
                result
                  .replaceAll("&", "&amp;")
                  .replaceAll(quote, quote === '"' ? "&quot;" : "&apos;") +
                quote
              );
            },
          ),
  );
  text = text.replace(
    /<!--[\s\S]*?-->|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (match, start, content, end) =>
      start ? start + cssReferences(content, rewrite) + end : match,
  );
  return utf8Encode(text);
}
