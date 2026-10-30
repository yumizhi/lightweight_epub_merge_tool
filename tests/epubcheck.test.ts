import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mergeEpubs, splitEpub } from "../ts/src/index.js";
import { assetBook, input } from "./fixtures.js";
it.skipIf(!process.env.EPUBCHECK_JAR)(
  "validates mixed EPUB 2/3 merge and every split output with EPUBCheck",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "epub-toolkit-check-"));
    try {
      for (const structure of ["volume", "flat"] as const) {
        const merged = mergeEpubs(
          `${structure}.epub`,
          [input(1, 3, true), input(2, 2), assetBook(3), assetBook(4)],
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

it.skipIf(!process.env.EPUBCHECK_JAR)(
  "validates encoded paths, covers and restored metadata",
  async () => {
    const { compatibilityBook } = await import("./fixtures.js");
    const directory = mkdtempSync(join(tmpdir(), "epub-compat-check-"));
    try {
      const merged = mergeEpubs("collection.epub", [
        compatibilityBook(1),
        compatibilityBook(2, 2),
      ]);
      for (const output of [merged, ...splitEpub(merged.data)]) {
        const path = join(directory, output.name);
        writeFileSync(path, output.data);
        const reportPath = path + ".json";
        const result = spawnSync(
          "java",
          ["-jar", process.env.EPUBCHECK_JAR!, path, "--json", reportPath],
          { encoding: "utf8" },
        );
        const report = JSON.parse(readFileSync(reportPath, "utf8"));
        // The fixture deliberately has spaces in ZIP member names. EPUBCheck's
        // PKG-010 interoperability warning is expected for those exact names.
        expect(report.messages.length).toBeGreaterThan(0);
        for (const message of report.messages) {
          expect(message.ID, JSON.stringify(message)).toBe("PKG-010");
          expect(message.severity).toBe("WARNING");
        }
        expect(result.status, result.stdout + result.stderr).toBe(0);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  60000,
);
