import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixture } from "../fixtures.js";
import { readSourceBook } from "../../ts/src/index.js";
import { readZip } from "../../ts/src/zip.js";
const upload = (volume: number) => ({
  name: `volume-${volume}.epub`,
  mimeType: "application/epub+zip",
  buffer: Buffer.from(fixture(volume, 3, true)),
});

test("merge, reorder, download, split every volume and inspect", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles([upload(2), upload(1)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByRole("button", { name: "Auto sort" }).click();
  await expect(page.locator(".book-row h3").first()).toHaveText("Volume 1");
  await page.getByRole("button", { name: "Move down: volume-1.epub" }).click();
  await expect(page.locator(".book-row h3").first()).toHaveText("Volume 2");
  await page.getByRole("button", { name: "Move up: volume-1.epub" }).click();
  await page.getByLabel("Collection title").fill("Collected stories");
  await page.getByLabel("Output filename").fill("stories.epub");
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "One chapter list" }).click();
  await page.getByRole("button", { name: "Merge books" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const mergedDownload = await download;
  const data = readFileSync((await mergedDownload.path())!);
  expect(readSourceBook({ name: "stories.epub", data }).spineIds).toHaveLength(
    2,
  );
  expect(mergedDownload.suggestedFilename()).toBe("stories.epub");
  if (process.env.UPDATE_SCREENSHOTS) {
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
      timeout: 10000,
    });
    await page.screenshot({ path: "docs/workspace.png", fullPage: true });
  }
  await page.getByRole("tab", { name: "Split", exact: true }).click();
  await page.getByLabel("Choose files", { exact: true }).setInputFiles({
    name: "stories.epub",
    mimeType: "application/epub+zip",
    buffer: data,
  });
  await expect(
    page.getByRole("button", { name: "Split into books" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Split into books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const next = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download", exact: true })
      .nth(i)
      .click();
    const file = await next;
    expect(
      readSourceBook({
        name: file.suggestedFilename(),
        data: readFileSync((await file.path())!),
      }).title,
    ).toBe(`Volume ${i + 1}`);
  }
  const zipDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all (.zip)" }).click();
  const zip = await zipDownload;
  expect([...readZip(readFileSync((await zip.path())!)).keys()]).toEqual([
    "volume-1.epub",
    "volume-2.epub",
  ]);
  await page.getByRole("tab", { name: "Inspect", exact: true }).click();
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(upload(1));
  await expect(
    page.getByRole("button", { name: "Inspect book" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Inspect book" }).click();
  await expect(
    page.getByRole("region", { name: "Book details" }),
  ).toContainText("Chapter 1");
  expect(errors).toEqual([]);
});

test("handles malformed input, cancellation, and a fresh task", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Choose files", { exact: true }).setInputFiles({
    name: "broken.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from("not a zip"),
  });
  await expect(
    page.getByText("Could not read this book", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Merge books" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Remove: broken.epub" }).click();
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(Array.from({ length: 80 }, (_, i) => upload(i + 1)));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toHaveCount(0);
  if (await page.getByRole("button", { name: "Clear all" }).count())
    await page.getByRole("button", { name: "Clear all" }).click();
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(upload(1));
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByRole("button", { name: "Merge books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Split", exact: true }).click();
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(upload(1));
  await expect(
    page.getByRole("button", { name: "Split into books" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Split into books" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Split requires a book merged with this tool",
  );
});

test("keeps language and theme preferences and fits a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Switch to Chinese" }).click();
  await page.getByRole("button", { name: "切换主题" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await expect(
    page.getByRole("heading", { name: "把好书，放在一起。" }),
  ).toBeVisible();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles(upload(1));
  await expect(page.getByRole("button", { name: "合并书籍" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.UPDATE_SCREENSHOTS)
    await page.screenshot({ path: "docs/mobile-dark.png", fullPage: true });
});

test("caches the Pages application and its Worker for offline processing", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const manifest = await page.request.get("manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  for (const icon of (await manifest.json()).icons)
    expect((await page.request.get(icon.src)).status()).toBe(200);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bring your books together." }),
  ).toBeVisible();
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(upload(1));
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByRole("button", { name: "Merge books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
});
