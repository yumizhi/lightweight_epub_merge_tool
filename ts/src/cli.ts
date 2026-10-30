#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openAsBlob,
  createWriteStream,
} from "node:fs";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { EpubMergeError } from "./errors.js";
import { inspectEpub } from "./inspect.js";
import { mergeEpubFiles } from "./merge.js";
import { splitEpub } from "./split.js";

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (
    ["--help", "-h"].includes(command) ||
    args.includes("--help") ||
    args.includes("-h")
  ) {
    usage();
    return 0;
  }
  try {
    if (command === "merge") return await runMerge(args);
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

async function runMerge(args: string[]): Promise<number> {
  let title: string | undefined;
  let structure: "volume" | "flat" = "volume";
  let inputOrder = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--title") {
      title = args[++i];
      if (!title) throw new EpubMergeError("--title requires a value");
    } else if (arg === "--structure") {
      structure = args[++i] as "volume" | "flat";
      if (!structure) throw new EpubMergeError("--structure requires a value");
    } else if (arg === "--input-order") inputOrder = true;
    else if (arg.startsWith("--"))
      throw new EpubMergeError(`Unknown option: ${arg}`);
    else rest.push(arg);
  }
  if (rest.length < 2)
    throw new EpubMergeError("merge requires OUTPUT and INPUT...");
  const [output, ...inputs] = rest;
  const result = await mergeEpubFiles(
    basename(output),
    await Promise.all(
      inputs.map(async (name) => ({ name, file: await openAsBlob(name) })),
    ),
    { title, structure, inputOrder },
  );
  await pipeline(
    Readable.fromWeb(
      result.blob.stream() as import("node:stream/web").ReadableStream<Uint8Array>,
    ),
    createWriteStream(output),
  );
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
    else if (arg.startsWith("--"))
      throw new EpubMergeError(`Unknown option: ${arg}`);
    else rest.push(arg);
  }
  if (rest.length !== 1 || !outDir)
    throw new EpubMergeError("split requires INPUT --out-dir DIR");
  mkdirSync(outDir, { recursive: true });
  for (const result of splitEpub(readFileSync(rest[0]))) {
    writeFileSync(join(outDir, result.name), result.data);
  }
  return 0;
}

function usage(): void {
  console.log(`EPUB Toolkit 1.1.0
usage: epub-toolkit COMMAND
  merge OUTPUT INPUT... [--title TITLE] [--structure volume|flat] [--input-order]
  split INPUT --out-dir DIR
  inspect INPUT

Split reconstructs source volumes from EPUBs merged with this tool.`);
}

process.exitCode = await main(process.argv.slice(2));
