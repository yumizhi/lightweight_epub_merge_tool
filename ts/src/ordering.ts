import { OrderingError } from "./errors.js";
import type { SourceBook } from "./models.js";

const SPECIAL_MARKERS = ["bd", "blu-ray", "bluray", "特典", "特装", "限定", "another"];
const CHINESE_DIGITS = new Map<string, number>([
  ["零", 0], ["〇", 0], ["一", 1], ["二", 2], ["三", 3], ["四", 4],
  ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9]
]);

export function sortSources(sources: SourceBook[]): SourceBook[] {
  const keyed = sources.map((source) => ({ key: orderKey(source), source }));
  const seen = new Map<string, string>();
  for (const item of keyed) {
    const key = item.key.join(".");
    const other = seen.get(key);
    if (other) {
      throw new OrderingError(`Ambiguous input order: '${item.source.basename}' and '${other}' share order key (${item.key.join(",")})`);
    }
    seen.set(key, item.source.basename);
  }
  return keyed.sort((a, b) => compareKey(a.key, b.key)).map((item) => item.source);
}

export function orderKey(source: SourceBook): number[] {
  const filename = source.basename.replace(/\.epub$/i, "");
  const decimal = decimalKey(filename);
  if (decimal) return decimal;
  const special = specialKey(filename);
  if (special) return special;
  for (const text of [filename, source.title, source.toc[0]?.title ?? ""]) {
    const numbers = numberList(text);
    if (numbers.length) return numbers;
  }
  throw new OrderingError(`Could not determine input order for '${source.basename}'`);
}

function compareKey(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function decimalKey(text: string): number[] | undefined {
  const match = text.match(/(\d+)\.(\d+)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2].padEnd(6, "0").slice(0, 6))];
}

function specialKey(text: string): number[] | undefined {
  const lowered = text.toLowerCase();
  if (!SPECIAL_MARKERS.some((marker) => lowered.includes(marker))) return undefined;
  const values = [...numberList(text), ...chineseOrdinals(text)].sort((a, b) => a - b);
  if (!values.length) return undefined;
  return [10_000, ...values];
}

function numberList(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function chineseOrdinals(text: string): number[] {
  return [...text.matchAll(/第([一二三四五六七八九十〇零]+)/g)]
    .map((match) => parseChineseNumber(match[1]))
    .filter((value): value is number => value !== undefined);
}

function parseChineseNumber(text: string): number | undefined {
  if (text === "十") return 10;
  if (text.includes("十")) {
    const [left, right = ""] = text.split("十");
    const tens = left ? CHINESE_DIGITS.get(left) : 1;
    const ones = right ? CHINESE_DIGITS.get(right) : 0;
    if (tens === undefined || ones === undefined) return undefined;
    return tens * 10 + ones;
  }
  let total = 0;
  for (const char of text) {
    const digit = CHINESE_DIGITS.get(char);
    if (digit === undefined) return undefined;
    total = total * 10 + digit;
  }
  return total;
}
