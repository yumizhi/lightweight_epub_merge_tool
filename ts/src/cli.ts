#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { EpubMergeError } from "./errors.js";
import { inspectEpub } from "./inspect.js";
import { mergeEpubs } from "./merge.js";
import { splitEpub } from "./split.js";

function main(argv: string[]): number {
  const [command, ...args] = argv;
  try {
    if (command === "merge") return runMerge(args);
    if (command === "inspect") return runInspect(args);
    if (command === "split") return runSplit(args);
    usage();
    return 2;
  } catch (error) {
    if (error instanceof EpubMergeError || error instanceof Error) {
      console.error(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

function runMerge(args: string[]): number {
  let title: string | undefined;
  let structure: "volume" | "flat" = "volume";
  let inputOrder = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--title") title = args[++i];
    else if (arg === "--structure") structure = args[++i] as "volume" | "flat";
    else if (arg === "--input-order") inputOrder = true;
    else rest.push(arg);
  }
  if (rest.length < 2) throw new EpubMergeError("merge requires OUTPUT and INPUT...");
  const [output, ...inputs] = rest;
  const result = mergeEpubs(output, inputs.map((name) => ({ name, data: readFileSync(name) })), { title, structure, inputOrder });
  writeFileSync(output, result.data);
  return 0;
}

function runInspect(args: string[]): number {
  if (args.length !== 1) throw new EpubMergeError("inspect requires INPUT");
  console.log(JSON.stringify(inspectEpub(readFileSync(args[0])), null, 2));
  return 0;
}

function runSplit(args: string[]): number {
  let outDir = "";
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out-dir") outDir = args[++i];
    else rest.push(arg);
  }
  if (rest.length !== 1 || !outDir) throw new EpubMergeError("split requires INPUT --out-dir DIR");
  mkdirSync(outDir, { recursive: true });
  for (const result of splitEpub(readFileSync(rest[0]))) {
    writeFileSync(join(outDir, result.name), result.data);
  }
  return 0;
}

function usage(): void {
  console.error("usage: ts-epub-merge {merge,split,inspect} ...");
}

process.exitCode = main(process.argv.slice(2));
