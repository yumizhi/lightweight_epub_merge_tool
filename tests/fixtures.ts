import { writeZip } from "../ts/src/zip.js";
import { baseZipEntries } from "../ts/src/epub-io.js";
import { utf8Encode as bytes } from "../ts/src/utils.js";

// Small, generated EPUB 2/3 books with nested paths and a shared image.
export function fixture(volume = 1, version = 3, nestedNav = false): Uint8Array {
  const navPath = nestedNav ? "Navigation/nav.xhtml" : "nav.xhtml";
  const chapter = `${nestedNav ? "../" : ""}Text/chapter.xhtml`;
  const items = [
    ['chapter', 'Text/chapter.xhtml', 'application/xhtml+xml', ''],
    ['css', 'Styles/book.css', 'text/css', ''],
    ['image', 'Images/pixel.png', 'image/png', ''],
    version === 3 ? ['nav', navPath, 'application/xhtml+xml', ' properties="nav"'] : ['ncx', 'toc.ncx', 'application/x-dtbncx+xml', '']
  ];
  return writeZip([
    ...baseZipEntries(),
    { name: "OEBPS/content.opf", data: bytes(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:volume:${volume}</dc:identifier><dc:title>Volume ${volume}</dc:title><dc:language>en</dc:language><dc:creator>Author</dc:creator>${version === 3 ? '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' : ''}</metadata><manifest>${items.map(([id, href, type, props]) => `<item id="${id}" href="${href}" media-type="${type}"${props}/>`).join('')}</manifest><spine${version === 2 ? ' toc="ncx"' : ''}><itemref idref="chapter"/></spine></package>`) },
    { name: "OEBPS/Text/chapter.xhtml", data: bytes(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${volume}</title><link rel="stylesheet" href="../Styles/book.css"/></head><body><h1 id="start">Chapter ${volume}</h1><img src="../Images/pixel.png" alt="Pixel"/><p>Volume ${volume}.</p></body></html>`) },
    { name: "OEBPS/Styles/book.css", data: bytes('body { background-image: url("../Images/pixel.png"); }') },
    { name: "OEBPS/Images/pixel.png", data: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64')) },
    version === 3
      ? { name: `OEBPS/${navPath}`, data: bytes(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="${chapter}#start">Chapter ${volume}</a></li></ol></nav></body></html>`) }
      : { name: "OEBPS/toc.ncx", data: bytes(`<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:volume:${volume}"/></head><docTitle><text>Volume ${volume}</text></docTitle><navMap><navPoint id="p1" playOrder="1"><navLabel><text>Chapter ${volume}</text></navLabel><content src="Text/chapter.xhtml#start"/></navPoint></navMap></ncx>`) }
  ]);
}
export const input = (volume: number, version = 3, nestedNav = false) => ({ name: `volume-${volume}.epub`, data: fixture(volume, version, nestedNav) });
