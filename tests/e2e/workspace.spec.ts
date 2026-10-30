import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixture } from "../fixtures.js";
import { readSourceBook } from "../../ts/src/index.js";
import { readZip, writeZip } from "../../ts/src/zip.js";
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
    page.getByRole("tab", { name: "合并", exact: true }),
  ).toBeVisible();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles(upload(1));
  await expect(page.getByRole("button", { name: "合并书籍" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".task-status")).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator(".workspace-grid").evaluate((grid) => {
        const [files, settings] = Array.from(grid.children).map((node) =>
          node.getBoundingClientRect(),
        );
        return settings.top >= files.bottom;
      }),
    )
    .toBe(true);
  if (process.env.UPDATE_SCREENSHOTS) {
    await page.screenshot({ path: "docs/mobile-dark.png", fullPage: true });
  }
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
    page.getByRole("heading", { name: "EPUB Toolkit", exact: true }),
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

test("animates file reordering and select menus", async ({ page }) => {
  await page.goto("./");
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles([upload(1), upload(2)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await expect(page.locator(".task-status")).toHaveCount(0);
  await page.getByRole("button", { name: "Move down: volume-1.epub" }).click();
  await expect
    .poll(() =>
      page
        .locator(".book-row")
        .evaluateAll((rows) =>
          rows.some((row) => getComputedStyle(row).transform !== "none"),
        ),
    )
    .toBe(true);
  await expect(page.locator(".book-row h3").first()).toHaveText("Volume 2");
  await page.getByRole("combobox").click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  expect(
    await menu.evaluate((node) => getComputedStyle(node).animationName),
  ).not.toBe("none");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .getByRole("button", { name: "Merge books" })
      .evaluate((node) =>
        parseFloat(getComputedStyle(node).transitionDuration),
      ),
  ).toBeLessThan(0.01);
});

test("reports real Worker stages, cancels processing and starts a fresh task", async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    (window as any).workerProgress = [];
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.type === "progress") (window as any).workerProgress.push(data.progress);
        });
      }
    };
  });
  const large = readZip(fixture());
  large.set("OEBPS/Text/chapter.xhtml", new TextEncoder().encode(new TextDecoder().decode(large.get("OEBPS/Text/chapter.xhtml")).replace("</body>", "<p>Generated text for cancellation. </p>".repeat(24000) + "</body>")));
  const data = Buffer.from(writeZip([...large].map(([name,data])=>({name,data,level:name==='mimetype'?0:6}))));
  await page.goto("./");
  await page.getByLabel("Choose files", { exact: true }).setInputFiles(Array.from({length:24},(_,i)=>({name:`volume-${i+1}.epub`,mimeType:"application/epub+zip",buffer:data})));
  await expect(page.getByRole("button",{name:"Merge books"})).toBeEnabled();
  await page.getByRole("button",{name:"Merge books"}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).workerProgress.some((p:any)=>p.phase==='resources'))).toBe(true);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.locator(".task-status")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Download",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Clear all"}).click();
  await page.getByLabel("Choose files",{exact:true}).setInputFiles(upload(1));
  await expect(page.getByRole("button",{name:"Merge books"})).toBeEnabled();
  await page.getByRole("button",{name:"Merge books"}).click();
  await expect(page.getByRole("button",{name:"Download",exact:true})).toBeVisible();
  const progress=await page.evaluate(()=>(window as any).workerProgress);
  expect(progress.some((p:any)=>p.phase==='writing')).toBe(true);
  expect(progress.every((p:any)=>Number.isInteger(p.completed)&&p.completed<=p.total)).toBe(true);
});

test("releases download URLs and clears stale results on edits and failures", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).urls = {created:[],revoked:[]};
    const create=URL.createObjectURL.bind(URL), revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {const url=create(blob);(window as any).urls.created.push(url);return url;};
    URL.revokeObjectURL = (url) => {(window as any).urls.revoked.push(url);revoke(url);};
  });
  await page.goto("./");
  await page.getByRole("tab",{name:"Merge",exact:true}).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab",{name:"Split",exact:true})).toHaveAttribute("data-state","active");
  await expect(page.getByRole("tab",{name:"Split",exact:true})).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab",{name:"Merge",exact:true})).toHaveAttribute("data-state","active");
  await expect(page.getByRole("tab",{name:"Merge",exact:true})).toBeFocused();
  await page.getByLabel("Choose files",{exact:true}).setInputFiles(upload(1));
  await expect(page.getByRole("button",{name:"Merge books"})).toBeEnabled();
  await page.getByRole("button",{name:"Merge books"}).click();
  await expect(page.getByRole("button",{name:"Download",exact:true})).toBeVisible();
  await page.getByLabel("Collection title").fill("Updated collection");
  await expect(page.getByRole("button",{name:"Download",exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).urls.created.every((url:string)=>(window as any).urls.revoked.includes(url)))).toBe(true);
  await page.getByRole("button",{name:"Clear all"}).click();
  const zip=readZip(fixture());
  zip.set("OEBPS/Text/chapter.xhtml",new TextEncoder().encode(new TextDecoder().decode(zip.get("OEBPS/Text/chapter.xhtml")).replace("../Images/pixel.png","../Images/absent.png")));
  await page.getByLabel("Choose files",{exact:true}).setInputFiles({name:"volume-bad.epub",mimeType:"application/epub+zip",buffer:Buffer.from(writeZip([...zip].map(([name,data])=>({name,data}))))});
  await expect(page.getByRole("button",{name:"Merge books"})).toBeEnabled();
  await page.getByRole("button",{name:"Merge books"}).click();
  await expect(page.getByRole("alert")).toContainText("absent.png");
  await expect(page.getByRole("button",{name:"Download",exact:true})).toHaveCount(0);
});
