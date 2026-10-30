import { expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mergeEpubs, splitEpub } from "../ts/src/index.js";
import { input } from "./fixtures.js";
it.skipIf(!process.env.EPUBCHECK_JAR)(
  "validates mixed EPUB 2/3 merge and every split output with EPUBCheck",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "epub-toolkit-check-"));
    try {
      for (const structure of ["volume", "flat"] as const) {
        const merged = mergeEpubs(
          `${structure}.epub`,
          [input(1, 3, true), input(2, 2)],
          { structure },
        );
        for (const output of [merged, ...splitEpub(merged.data)]) {
          const path = join(directory, output.name);
          writeFileSync(path, output.data);
          const result = spawnSync(
            "java",
            ["-jar", process.env.EPUBCHECK_JAR!, path],
            { encoding: "utf8" },
          );
          expect(result.stdout + result.stderr, output.name).toContain(
            "No errors or warnings detected",
          );
          expect(result.status, result.stdout + result.stderr).toBe(0);
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  60000,
);
