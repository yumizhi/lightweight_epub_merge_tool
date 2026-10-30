import { readZip, writeZip } from "../ts/src/zip.js";
import { baseZipEntries } from "../ts/src/epub-io.js";
import { utf8Decode as text, utf8Encode as bytes } from "../ts/src/utils.js";

// Small, generated EPUB 2/3 books with nested paths and a shared image.
export function fixture(
  volume = 1,
  version = 3,
  nestedNav = false,
): Uint8Array {
  const navPath = nestedNav ? "Navigation/nav.xhtml" : "nav.xhtml";
  const chapter = `${nestedNav ? "../" : ""}Text/chapter.xhtml`;
  const items = [
    ["chapter", "Text/chapter.xhtml", "application/xhtml+xml", ""],
    ["css", "Styles/book.css", "text/css", ""],
    ["image", "Images/pixel.png", "image/png", ""],
    version === 3
      ? ["nav", navPath, "application/xhtml+xml", ' properties="nav"']
      : ["ncx", "toc.ncx", "application/x-dtbncx+xml", ""],
  ];
  return writeZip([
    ...baseZipEntries(),
    {
      name: "OEBPS/content.opf",
      data: bytes(
        `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:volume:${volume}</dc:identifier><dc:title>Volume ${volume}</dc:title><dc:language>en</dc:language><dc:creator>Author</dc:creator>${version === 3 ? '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' : ""}</metadata><manifest>${items.map(([id, href, type, props]) => `<item id="${id}" href="${href}" media-type="${type}"${props}/>`).join("")}</manifest><spine${version === 2 ? ' toc="ncx"' : ""}><itemref idref="chapter"/></spine></package>`,
      ),
    },
    {
      name: "OEBPS/Text/chapter.xhtml",
      data: bytes(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${volume}</title><link rel="stylesheet" href="../Styles/book.css"/></head><body><h1 id="start">Chapter ${volume}</h1><img src="../Images/pixel.png" alt="Pixel"/><p>Volume ${volume}.</p></body></html>`,
      ),
    },
    {
      name: "OEBPS/Styles/book.css",
      data: bytes('body { background-image: url("../Images/pixel.png"); }'),
    },
    {
      name: "OEBPS/Images/pixel.png",
      data: Uint8Array.from(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
          "base64",
        ),
      ),
    },
    version === 3
      ? {
          name: `OEBPS/${navPath}`,
          data: bytes(
            `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="${chapter}#start">Chapter ${volume}</a></li></ol></nav></body></html>`,
          ),
        }
      : {
          name: "OEBPS/toc.ncx",
          data: bytes(
            `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:volume:${volume}"/></head><docTitle><text>Volume ${volume}</text></docTitle><navMap><navPoint id="p1" playOrder="1"><navLabel><text>Chapter ${volume}</text></navLabel><content src="Text/chapter.xhtml#start"/></navPoint></navMap></ncx>`,
          ),
        },
  ]);
}
export const input = (volume: number, version = 3, nestedNav = false) => ({
  name: `volume-${volume}.epub`,
  data: fixture(volume, version, nestedNav),
});

// The archive path is literal; the OPF href is a URI and encodes %, # and spaces.
export function compatibilityBook(volume = 1, version = 3) {
  const zip = readZip(fixture(volume, version, true));
  const oldOpf = text(zip.get("OEBPS/content.opf")!);
  const opfPath = "书库 100%/Package/book.opf";
  const root = "书库 100%/";
  const image = "Images/插图 #1.png";
  const imageUri = "../Images/%E6%8F%92%E5%9B%BE%20%231.png";
  const opf = oldOpf
    .replace(/href="(?!Navigation)([^"]+)"/g, 'href="../$1"')
    .replace('href="Navigation/nav.xhtml"', 'href="../Navigation/nav.xhtml"')
    .replace('href="../Images/pixel.png"', `href="${imageUri}"`)
    .replace(
      "</manifest>",
      '<item id="chapter2" href="../Text/part2.xhtml" media-type="application/xhtml+xml"/></manifest>',
    )
    .replace(
      "</metadata>",
      `<dc:publisher>出版社</dc:publisher><dc:rights>CC0 test fixture</dc:rights><dc:subject>测试</dc:subject><dc:description>Generated example</dc:description>${version === 2 ? '<meta name="cover" content="image"/>' : ""}</metadata>`,
    )
    .replace(
      'id="image"',
      version === 3 ? 'properties="cover-image" id="image"' : 'id="image"',
    )
    .replace("<spine", '<spine page-progression-direction="rtl"')
    .replace(
      '<itemref idref="chapter"/>',
      '<itemref idref="chapter" linear="no"/><itemref idref="chapter2"/>',
    );
  const entries = [...zip]
    .filter(
      ([name]) =>
        !["META-INF/container.xml", "OEBPS/content.opf"].includes(name),
    )
    .map(([name, data]) => ({
      name: name
        .replace("OEBPS/Images/pixel.png", root + image)
        .replace("OEBPS/", root),
      data: /chapter.xhtml$/.test(name)
        ? bytes(text(data).replace("../Images/pixel.png", imageUri))
        : /book.css$/.test(name)
          ? bytes(
              `body{background:url("${imageUri}")} .note:after{content:"url(missing.png)"}`,
            )
          : data,
      ...(name === "mimetype" ? { level: 0 as const } : {}),
    }));
  entries.push({
    name: root + "Text/part2.xhtml",
    data: bytes(
      text(zip.get("OEBPS/Text/chapter.xhtml")!).replace(
        "../Images/pixel.png",
        imageUri,
      ),
    ),
  });
  entries.push({
    name: "META-INF/container.xml",
    data: bytes(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opfPath.split("/").map(encodeURIComponent).join("/")}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
  });
  entries.push({ name: opfPath, data: bytes(opf) });
  return { name: `volume-${volume}.epub`, data: writeZip(entries) };
}

// Original minimal font and 2x2 JPEG generated specifically for these tests.
export function assetBook(volume = 1) {
  const zip = readZip(fixture(volume));
  zip.set(
    "OEBPS/nav.xhtml",
    bytes(
      text(zip.get("OEBPS/nav.xhtml")!).replace(
        /<li>([\s\S]*?)<\/li>/,
        "<li><span>Part <em>One</em></span><ol><li>$1</li></ol></li>",
      ),
    ),
  );
  zip.set(
    "OEBPS/content.opf",
    bytes(
      text(zip.get("OEBPS/content.opf")!).replace(
        "</manifest>",
        '<item id="font" href="Fonts/book.ttf" media-type="font/ttf"/><item id="jpeg" href="Images/photo.jpg" media-type="image/jpeg"/><item id="vector" href="Images/vector.svg" media-type="image/svg+xml"/></manifest>',
      ),
    ),
  );
  zip.set(
    "OEBPS/Fonts/book.ttf",
    Uint8Array.from(
      Buffer.from(
        "AAEAAAAKAIAAAwAgT1MvMkUARDUAAAEoAAAAYGNtYXAAdABcAAABkAAAADxnbHlmMVpbVgAAAdQAAAAwaGVhZC+Aa+wAAACsAAAANmhoZWEFFgH2AAAA5AAAACRobXR4AlgAAAAAAYgAAAAIbG9jYQAMACQAAAHMAAAACG1heHAABQAFAAABCAAAACBuYW1l26SjSwAAAgQAAAGAcG9zdAAIACQAAAOEAAAAKAABAAAAAQAAkqM3a18PPPUAAQPoAAAAAOcKFCgAAAAA5woUKAAyAAACJgK8AAAAAwACAAAAAAAAAAEAAAMg/zgAAAJYAAAAZAH0AAEAAAAAAAAAAAAAAAAAAAABAAEAAAADAAMAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwJYAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAQQMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAACWAAAAAAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAKAAAAAYABAABAAIAIABB//8AAAAgAEH////h/8EAAQAAAAAAAAAAAAwADAAYAAEAMgAAAiYCvAACAAAzExMy+voCvP1EAAEAMgAAAiYCvAACAAAzExMy+voCvP1EAAAADACWAAEAAAAAAAEADwAAAAEAAAAAAAIABwAPAAEAAAAAAAMAFgAWAAEAAAAAAAQAFwAsAAEAAAAAAAUACwBDAAEAAAAAAAYAFgAWAAMAAQQJAAEAHgBOAAMAAQQJAAIADgBsAAMAAQQJAAMALAB6AAMAAQQJAAQALgCmAAMAAQQJAAUAFgDUAAMAAQQJAAYALAB6VG9vbGtpdCBGaXh0dXJlUmVndWxhclRvb2xraXRGaXh0dXJlLVJlZ3VsYXJUb29sa2l0IEZpeHR1cmUgUmVndWxhclZlcnNpb24gMS4wAFQAbwBvAGwAawBpAHQAIABGAGkAeAB0AHUAcgBlAFIAZQBnAHUAbABhAHIAVABvAG8AbABrAGkAdABGAGkAeAB0AHUAcgBlAC0AUgBlAGcAdQBsAGEAcgBUAG8AbwBsAGsAaQB0ACAARgBpAHgAdAB1AHIAZQAgAFIAZQBnAHUAbABhAHIAVgBlAHIAcwBpAG8AbgAgADEALgAwAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAMAJA==",
        "base64",
      ),
    ),
  );
  zip.set(
    "OEBPS/Images/photo.jpg",
    Uint8Array.from(
      Buffer.from(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDBooorYyP/2Q==",
        "base64",
      ),
    ),
  );
  zip.set(
    "OEBPS/Images/vector.svg",
    bytes(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><image href="photo.jpg" width="2" height="2"/></svg>',
    ),
  );
  zip.set(
    "OEBPS/Styles/book.css",
    bytes(
      '@font-face{font-family:"Toolkit Fixture";src:url(../Fonts/book.ttf)} body{font-family:"Toolkit Fixture";background:url(../Images/photo.jpg)}',
    ),
  );
  return {
    name: `volume-${volume}.epub`,
    data: writeZip(
      [...zip].map(([name, data]) => ({
        name,
        data,
        level: name === "mimetype" ? 0 : 6,
      })),
    ),
  };
}
