import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixture } from "../fixtures.js";
import { inspectEpub } from "../../ts/src/index.js";
import { readZip, writeZip } from "../../ts/src/zip.js";

const upload = (volume: number) => ({
  name: `volume-${volume}.epub`,
  mimeType: "application/epub+zip",
  buffer: Buffer.from(fixture(volume, 3, true)),
});
const order = (page: Page) => page.locator(".book-list .book-row h3");
async function mouseReorder(page: Page, from: number, to: number) {
  const handle = page.locator(".drag-handle").nth(from);
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!,
    target = (await page.locator(".book-row").nth(to).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2,
    start.y + start.height / 2 + 10,
    { steps: 3 },
  );
  await expect(page.locator(".lifted[data-dnd-dragging]")).toHaveCount(1);
  await page.mouse.move(
    start.x + start.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

test("keeps all three workspaces and reuses output Blobs without uploading again", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    (window as any).urls = { created: [], revoked: [] };
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      (window as any).urls.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      (window as any).urls.revoked.push(url);
      revoke(url);
    };
  });
  await page.goto("./");
  await page
    .getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/)
    .setInputFiles([upload(1), upload(2)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByLabel("Output filename").fill("  saved.EPUB  ");
  await expect(page.locator(".preview-title")).toHaveText("saved");
  await page.getByLabel("Collection title").fill("Saved collection");
  await page.getByRole("tab", { name: "Inspect", exact: true }).click();
  await page
    .getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/)
    .setInputFiles(upload(3));
  await expect(
    page.getByRole("button", { name: "Inspect book" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Inspect book" }).click();
  await expect(
    page.getByRole("region", { name: "Book details" }),
  ).toContainText("Volume 3");
  await page.getByRole("tab", { name: "Merge", exact: true }).click();
  await expect(order(page)).toHaveText(["Volume 1", "Volume 2"]);
  await expect(page.getByLabel("Collection title")).toHaveValue(
    "Saved collection",
  );
  await page.getByRole("button", { name: "Merge books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect result", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Book details" }),
  ).toContainText("Saved collection");
  await page.getByRole("tab", { name: "Merge", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).urls.revoked)).toEqual([]);
  await page.getByRole("button", { name: "Split result", exact: true }).click();
  await expect(page.locator(".source-volumes li")).toHaveText([
    "1volume-1.epub",
    "2volume-2.epub",
  ]);
  await page.getByRole("button", { name: "Split into books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("tab", { name: "Merge", exact: true }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).urls.revoked.length))
    .toBe(1);
  // Clearing Merge revokes its URL but the reused immutable File remains usable.
  await page.getByRole("tab", { name: "Inspect", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Book details" }),
  ).toContainText("Saved collection");
  await page.getByRole("tab", { name: "Split", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).urls.created.every((url: string) =>
          (window as any).urls.revoked.includes(url),
        ),
      ),
    )
    .toBe(true);
});

test("mouse dragging updates preview and actual merge order, then supports removal and append", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/)
    .setInputFiles([upload(1), upload(2), upload(3)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await mouseReorder(page, 0, 2);
  await expect(order(page)).toHaveText(["Volume 2", "Volume 3", "Volume 1"]);
  const preview = page.getByRole("region", { name: "Contents preview" });
  await expect(preview.locator(".toc-toggle > span")).toHaveText([
    "Volume 2",
    "Volume 3",
    "Volume 1",
  ]);
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "One chapter list" }).click();
  await expect(preview.locator(".toc-leaf")).toHaveText([
    "Chapter 2",
    "Chapter 3",
    "Chapter 1",
  ]);
  await page.getByRole("button", { name: "Merge books" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const data = readFileSync((await (await downloaded).path())!);
  expect(inspectEpub(data).toc.map((entry) => entry.title)).toEqual([
    "Chapter 2",
    "Chapter 3",
    "Chapter 1",
  ]);
  await page.getByRole("button", { name: "Remove: volume-3.epub" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Inputs changed. Process again to get an updated result."),
  ).toBeVisible();
  await page
    .getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/)
    .setInputFiles(upload(4));
  await expect(order(page)).toHaveText(["Volume 2", "Volume 1", "Volume 4"]);
  await page.getByRole("button", { name: "Auto sort" }).click();
  await expect(order(page)).toHaveText(["Volume 1", "Volume 2", "Volume 4"]);
});

test("keyboard dragging commits or cancels without losing focus or publishing stale output", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/)
    .setInputFiles([upload(1), upload(2)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByRole("button", { name: "Reorder: volume-1.epub" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".lifted[data-dnd-dragging]")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(order(page)).toHaveText(["Volume 2", "Volume 1"]);
  await expect(
    page.getByRole("button", { name: "Reorder: volume-1.epub" }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(order(page)).toHaveText(["Volume 2", "Volume 1"]);
  await page.getByRole("button", { name: "Merge books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reorder: volume-1.epub" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Move up: volume-1.epub" }).click();
  await expect(order(page)).toHaveText(["Volume 1", "Volume 2"]);
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(0);
});

test("large navigation is expandable, paginated, and inspected from the parsed data", async ({
  page,
}) => {
  const zip = readZip(fixture());
  zip.set(
    "OEBPS/nav.xhtml",
    new TextEncoder().encode(
      new TextDecoder()
        .decode(zip.get("OEBPS/nav.xhtml")!)
        .replace(
          /<ol>[\s\S]*<\/ol>/,
          `<ol>${Array.from({ length: 1200 }, (_, i) => `<li><a href="Text/chapter.xhtml#start">Section ${i + 1}</a></li>`).join("")}</ol>`,
        ),
    ),
  );
  await page.goto("./");
  await page.getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/).setInputFiles({
    name: "volume-1.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(
      writeZip(
        [...zip].map(([name, data]) => ({
          name,
          data,
          level: name === "mimetype" ? 0 : 6,
        })),
      ),
    ),
  });
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  const preview = page.getByRole("region", { name: "Contents preview" });
  await expect(preview.locator(".toc-leaf")).toHaveCount(24);
  await preview.getByRole("button", { name: /Show more/ }).click();
  await expect(preview.locator(".toc-leaf")).toHaveCount(48);
  await preview.getByRole("button", { name: /Volume 1/ }).click();
  await expect(preview.locator(".toc-leaf")).toHaveCount(0);
  await preview.getByRole("button", { name: /Volume 1/ }).click();
  await expect(preview.locator(".toc-leaf")).toHaveCount(24);
  await page.getByRole("button", { name: "Merge books" }).click();
  await page.getByRole("button", { name: "Inspect result" }).click();
  const inspection = page.getByRole("region", { name: "Book details" });
  await expect(inspection).toContainText("1201");
  await expect(inspection.locator(".toc-leaf")).toHaveCount(24);
  await inspection.getByText("Resource paths", { exact: false }).click();
  await expect(inspection.locator(".path-list")).toContainText("image/png");
});

test.describe("touch sorting", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("moves a book using a touch handle while the page remains scrollable", async ({
    page,
    context,
  }) => {
    await page.goto("./");
    await page
      .getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/)
      .setInputFiles([upload(1), upload(2)]);
    await expect(
      page.getByRole("button", { name: "Merge books" }),
    ).toBeEnabled();
    await page.locator(".drag-handle").first().scrollIntoViewIfNeeded();
    const start = (await page.locator(".drag-handle").first().boundingBox())!,
      target = (await page.locator(".book-row").nth(1).boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const x = start.x + start.width / 2,
      y = start.y + start.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await expect(page.locator(".lifted[data-dnd-dragging]")).toHaveCount(1);
    for (let i = 1; i <= 12; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x, y: y + ((target.y + target.height / 2 - y) * i) / 12 },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(order(page)).toHaveText(["Volume 2", "Volume 1"]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await cdp.detach();
  });
});

for (const width of [1440, 768, 390]) {
  test(`shows real processing and supports cancellation at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const zip = readZip(fixture());
    zip.set(
      "OEBPS/Text/chapter.xhtml",
      new TextEncoder().encode(
        new TextDecoder()
          .decode(zip.get("OEBPS/Text/chapter.xhtml")!)
          .replace(
            "</body>",
            "<p>Generated text for a real processing task.</p>".repeat(48000) +
              "</body>",
          ),
      ),
    );
    const data = Buffer.from(
      writeZip(
        [...zip].map(([name, data]) => ({
          name,
          data,
          level: name === "mimetype" ? 0 : 6,
        })),
      ),
    );
    await page.goto("./");
    await page.getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/).setInputFiles(
      Array.from({ length: 24 }, (_, i) => ({
        name: `volume-${i + 1}.epub`,
        mimeType: "application/epub+zip",
        buffer: data,
      })),
    );
    await expect(
      page.getByRole("button", { name: "Merge books" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Merge books" }).click();
    await expect(page.locator(".task-status")).toBeVisible();
    await page.locator(".task-status").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`${width}-processing.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".task-status")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Merge books" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Download", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

for (const width of [1440, 768, 390]) {
  test(`fits empty, populated, result and error states at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("./");
    const capture = async (state: string) => {
      await expect(page.locator(".workspace-detail[inert], .queue[inert]")).toHaveCount(0);
      await expect.poll(() => page.locator(".workspace-stage").evaluate(node => getComputedStyle(node).transform)).toBe("none");
      await expect
        .poll(() =>
          page
            .locator(".dropzone")
            .evaluate((node) => getComputedStyle(node).transform),
        )
        .toBe("none");
      await expect
        .poll(() =>
          page
            .getByRole("tabpanel").locator(":scope > div")
            .evaluate((node) => getComputedStyle(node).transform),
        )
        .toBe("none");
      if (await page.locator(".results").count()) {
        await expect
          .poll(() =>
            page
              .locator(".results")
              .evaluate(
                (node) => getComputedStyle(node.parentElement!).opacity,
              ),
          )
          .toBe("1");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${width}-${state}.png`),
        fullPage: true,
      });
    };
    await capture("empty");
    await page.getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/).setInputFiles([
      upload(2),
      {
        ...upload(1),
        name: "volume-1-with-a-very-long-filename-中文-用于布局检查.epub",
      },
    ]);
    await expect(
      page.getByRole("button", { name: "Merge books" }),
    ).toBeEnabled();
    await capture("populated");
    await page.getByRole("button", { name: "Merge books" }).click();
    await expect(
      page.getByRole("button", { name: "Download", exact: true }),
    ).toBeVisible();
    await capture("result");
    await page.getByRole("button", { name: "Split result" }).click();
    await expect(page.locator(".source-volumes li")).toHaveCount(2);
    await capture("split");
    await page.getByRole("button", { name: "Split into books" }).click();
    await expect(
      page.getByRole("button", { name: "Download", exact: true }),
    ).toHaveCount(2);
    await capture("split-results");
    await page.getByRole("tab", { name: "Merge", exact: true }).click();
    await page.getByRole("button", { name: "Inspect result" }).click();
    await expect(
      page.getByRole("region", { name: "Book details" }),
    ).toBeVisible();
    await capture("inspect");
    await page.getByRole("tab", { name: "Merge", exact: true }).click();
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("tabpanel").getByLabel(/^Choose (?:files|a file)$/).setInputFiles({
      name: "broken.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from("not a zip"),
    });
    await expect(
      page.getByText("Could not read this book", { exact: true }),
    ).toBeVisible();
    await capture("error");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("button", { name: "Switch to Chinese" }).click();
    await capture("dark-zh");
  });
}
