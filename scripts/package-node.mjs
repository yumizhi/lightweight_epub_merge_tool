import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = JSON.parse(readFileSync("package.json", "utf8"));
const target = resolve("dist/node");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync("dist-ts/src", `${target}/src`, { recursive: true });
cpSync("LICENSE", `${target}/LICENSE`);
writeFileSync(
  `${target}/README.md`,
  `# EPUB Toolkit for Node

Merge, split and inspect EPUB books locally. Requires Node 22.12+.

Install the downloaded tarball:

\`\`\`sh
npm install -g ./epub-toolkit-node-${root.version}.tgz
epub-toolkit merge collection.epub volume-1.epub volume-2.epub --input-order
epub-toolkit split collection.epub --out-dir recovered
epub-toolkit inspect collection.epub
\`\`\`

The package also exports the synchronous Uint8Array APIs and asynchronous Blob APIs, with TypeScript declarations.

\`\`\`js
import { mergeEpubs } from "epub-toolkit-node";
import { readFileSync, writeFileSync } from "node:fs";
const result = mergeEpubs("collection.epub", [
  { name: "volume-1.epub", data: readFileSync("volume-1.epub") },
], { inputOrder: true });
writeFileSync(result.name, result.data);
\`\`\`

Split reconstructs books merged by this tool. The supported scope is reflowable EPUB 2/3. No book files are uploaded.

[Web app](https://yumizhi.github.io/lightweight_epub_merge_tool/) · [Source and documentation](https://github.com/yumizhi/lightweight_epub_merge_tool)
`,
);
writeFileSync(
  `${target}/package.json`,
  JSON.stringify(
    {
      name: "epub-toolkit-node",
      version: root.version,
      type: "module",
      description: "Merge, split and inspect EPUB books locally",
      license: "Apache-2.0",
      author: "monad",
      engines: { node: ">=22.12.0" },
      bin: { "epub-toolkit": "./src/cli.js" },
      exports: { ".": { types: "./src/index.d.ts", import: "./src/index.js" } },
      files: ["src", "README.md", "LICENSE"],
      dependencies: Object.fromEntries(
        ["fflate", "fast-xml-parser"].map((name) => [
          name,
          root.dependencies[name],
        ]),
      ),
      repository: {
        type: "git",
        url: "https://github.com/yumizhi/lightweight_epub_merge_tool.git",
      },
    },
    null,
    2,
  ) + "\n",
);
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", target, "--pack-destination", resolve("dist")],
  { stdio: "inherit" },
);
