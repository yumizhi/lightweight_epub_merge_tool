import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export const orderedParser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@_", preserveOrder: true,
  parseTagValue: false, parseAttributeValue: false, trimValues: false,
});

export const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  format: true,
  suppressEmptyNode: false,
});

export function parseXml(data: Uint8Array | string, preserveOrder = false): unknown {
  const text =
    typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
  const result = XMLValidator.validate(text);
  if (result !== true) throw new Error(`Invalid XML: ${result.err.msg}`);
  return (preserveOrder ? orderedParser : parser).parse(text) as unknown;
}

export function localKey(
  obj: Record<string, unknown>,
  desired: string,
): unknown {
  for (const [key, value] of Object.entries(obj)) {
    const local = key.includes(":") ? key.split(":").pop() : key;
    if (local === desired) return value;
  }
  return undefined;
}
