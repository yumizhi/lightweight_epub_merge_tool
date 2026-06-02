import { XMLBuilder, XMLParser } from "fast-xml-parser";

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});

export const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  format: true,
  suppressEmptyNode: false
});

export function parseXml(data: Uint8Array | string): unknown {
  const text = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
  return parser.parse(text) as unknown;
}

export function localKey(obj: Record<string, unknown>, desired: string): unknown {
  for (const [key, value] of Object.entries(obj)) {
    const local = key.includes(":") ? key.split(":").pop() : key;
    if (local === desired) return value;
  }
  return undefined;
}
