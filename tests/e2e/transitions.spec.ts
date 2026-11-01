import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fixture } from "../fixtures.js";

const upload = (volume: number) => ({ name: `volume-${volume}.epub`, mimeType: "application/epub+zip", buffer: Buffer.from(fixture(volume, 3, true)) });
const panel = (page: Page) => page.getByRole("tabpanel");
const settled = async (page: Page) => {
  await expect(page.locator(".workspace-detail[inert], .queue[inert]")).toHaveCount(0);
  await expect.poll(() => page.locator(".workspace-stage").evaluate(node => getComputedStyle(node).transform)).toBe("none");
  await expect.poll(() => page.locator(".file-panel").evaluate(node => getComputedStyle(node).transform)).toBe("none");
  await expect.poll(() => page.locator(".dropzone").evaluate(node => getComputedStyle(node).transform)).toBe("none");
  await expect.poll(() => page.locator(".source-intro").evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === "1"))).toBe(true);
  await expect.poll(() => page.locator(".tab-highlight").evaluate(node => getComputedStyle(node).transform)).toBe("none");
};

test.use({ video: { mode: "on", size: { width: 1440, height: 1050 } } });

test("continuous stage preserves files, settings, results and keyboard focus", async ({ page }, testInfo) => {
  await page.goto("./");
  await expect(page.locator(".merge-settings")).toHaveCount(0);
  await page.getByLabel("Choose files", { exact: true }).setInputFiles({ name: "unsupported.txt", mimeType: "text/plain", buffer: Buffer.from("invalid input") });
  await expect(page.getByRole("alert")).toContainText("Choose files with the .epub extension.");
  await page.locator("button").filter({ hasText: /^Choose files$/ }).focus();
  await page.evaluate(() => { (window as any).picker = document.querySelector('input[type="file"]'); (window as any).card = document.querySelector(".file-panel"); (window as any).dropzone = document.querySelector(".dropzone"); });
  await page.getByLabel("Choose files", { exact: true }).setInputFiles([upload(3), upload(1), upload(2)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add books", exact: true })).toBeFocused();
  expect(await page.evaluate(() => (window as any).picker === document.querySelector('input[type="file"]'))).toBe(true);
  await page.getByRole("button", { name: "Auto sort" }).click();
  await page.getByLabel("Collection title").fill("Saved collection");
  await page.getByLabel("Output filename").fill("saved.epub");
  await settled(page);
  const before = await page.locator(".workspace-stage").boundingBox();
  const cardBefore = await page.locator(".file-panel").boundingBox();
  await page.evaluate(() => {
    (window as any).frames = [];
    const start = performance.now();
    const sample = () => {
      const node = document.querySelector('.workspace-stage')!;
      const rect = node.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>(".file-panel")!;
      const cardRect = card.getBoundingClientRect();
      const headline = document.querySelector<HTMLElement>('.workspace-content[data-state="active"] .dropzone h2')!;
      (window as any).frames.push({ cardX: cardRect.x, cardWidth: cardRect.width, cardOpacity: getComputedStyle(card).opacity, textScale: headline.getBoundingClientRect().height / headline.offsetHeight, time: performance.now() - start, x: rect.x, y: rect.y, width: rect.width, height: rect.height, footer: document.querySelector('footer')!.getBoundingClientRect().y });
      if (performance.now() - start < 450) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // Dispatch in one frame so the test actually observes the exit, before actionability waits.
  await page.getByRole("tab", { name: "Split", exact: true }).dispatchEvent("mousedown", { button: 0 });
  await expect(page.locator('.workspace-detail[inert][aria-hidden="true"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("transition-start.png") });
  await page.screenshot({ path: testInfo.outputPath("transition-middle.png") });
  await expect(panel(page)).toHaveAttribute("data-workspace", "split");
  await expect(page.locator("button").filter({ hasText: /^Choose a file$/ })).toBeEnabled();
  await settled(page);
  await page.screenshot({ path: testInfo.outputPath("transition-end.png") });
  const after = await page.locator(".workspace-stage").boundingBox();
  const cardAfter = await page.locator(".file-panel").boundingBox();
  expect(await page.evaluate(() => (window as any).card === document.querySelector(".file-panel") && (window as any).dropzone === document.querySelector(".dropzone") && (window as any).picker === document.querySelector('input[type="file"]'))).toBe(true);
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.width).toBeLessThan(before!.width);
  const frames = await page.evaluate(() => (window as any).frames as { width: number; y: number; textScale: number; cardX: number; cardWidth: number; cardOpacity: string }[]);
  writeFileSync(testInfo.outputPath("transition-geometry.json"), JSON.stringify(frames, null, 2));
  expect(frames.some(frame => frame.width > after!.width + 2 && frame.width < before!.width - 2)).toBe(true);
  expect(frames.every(frame => Math.abs(frame.y - before!.y) < 1)).toBe(true);
  expect(frames.every(frame => Math.abs(frame.textScale - 1) < 0.02)).toBe(true);
  expect(frames.every(frame => frame.cardOpacity === "1")).toBe(true);
  expect(frames.some(frame => frame.cardX > cardBefore!.x + 2 && frame.cardX < cardAfter!.x - 2)).toBe(true);
  expect(frames.some(frame => frame.cardWidth > cardBefore!.width + 2 && frame.cardWidth < cardAfter!.width - 2)).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Inspect", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Merge", exact: true })).toBeFocused();
  await expect(page.locator(".book-row h3")).toHaveText(["Volume 1", "Volume 2", "Volume 3"]);
  await expect(page.getByLabel("Collection title")).toHaveValue("Saved collection");
  await expect(page.getByLabel("Output filename")).toHaveValue("saved.epub");
  await page.getByRole("button", { name: "Merge books" }).click();
  await page.getByRole("button", { name: "Inspect result", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Inspect", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Book details" })).toContainText("Saved collection");
  await page.getByRole("tab", { name: "Merge", exact: true }).click();
  await page.getByRole("button", { name: "Split result", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Split", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Split into books" }).click();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(3);
  for (const mode of ["Merge", "Inspect", "Split", "Inspect", "Merge", "Split", "Merge"]) {
    await page.getByRole("tab", { name: mode, exact: true }).dispatchEvent("mousedown", { button: 0 });
  }
  await expect(panel(page)).toHaveAttribute("data-workspace", "merge");
  await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(1);
  await settled(page);
  expect(await panel(page).getAttribute("aria-labelledby")).toBe(await page.getByRole("tab", { name: "Merge", exact: true }).getAttribute("id"));
  await page.getByRole("button", { name: "Clear all", exact: true }).dispatchEvent("click");
  await expect(page.locator('.workspace-detail[inert][aria-hidden="true"]')).toHaveCount(1);
  await expect(page.locator(".merge-settings")).toHaveCount(0);
});

for (const width of [1440, 900, 768, 390, 320]) {
  test(`workspace and footer fit empty, populated and result states at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1050 });
    await page.goto("./");
    for (const mode of ["Merge", "Split", "Inspect", "Merge"]) {
      await page.getByRole("tab", { name: mode, exact: true }).click();
      await settled(page);
      const geometry = await page.evaluate(() => ({ bottom: document.querySelector('footer')!.getBoundingClientRect().bottom, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
      expect(geometry.overflow).toBe(false);
      expect(geometry.bottom).toBeCloseTo(geometry.height, 0);
    }
    await page.screenshot({ path: testInfo.outputPath(`${width}-empty.png`), fullPage: true });
    if (process.env.UPDATE_SCREENSHOTS && width === 1440) await page.screenshot({ path: "docs/empty-workspace.png", fullPage: true });
    await page.getByLabel("Choose files", { exact: true }).setInputFiles([upload(3), upload(2), upload(1)]);
    await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath(`${width}-populated.png`), fullPage: true });
    await page.getByRole("button", { name: "Merge books" }).click();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath(`${width}-result.png`), fullPage: true });
    await page.getByRole("button", { name: "Inspect result", exact: true }).click();
    await expect(page.getByRole("region", { name: "Book details" })).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath(`${width}-inspect.png`), fullPage: true });
    await page.getByRole("tab", { name: "Merge", exact: true }).click();
    await page.getByRole("button", { name: "Split result", exact: true }).click();
    await page.getByRole("button", { name: "Split into books" }).click();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(3);
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath(`${width}-split.png`), fullPage: true });
    await page.getByRole("button", { name: "Switch to Chinese" }).click();
    await page.getByRole("button", { name: "切换主题" }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("tab", { name: "合并", exact: true }).click();
    await settled(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("footer")).toContainText("文件仅在本地处理。");
    await expect(page.locator('footer a')).toHaveText(["使用说明", "Apache-2.0"]);
    await page.screenshot({ path: testInfo.outputPath(`${width}-dark-zh-reduced.png`), fullPage: true });
  });
}

test("install is a header action only after an install prompt is available", async ({ page }, testInfo) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Install app", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).installed = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { (window as any).installed++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
  });
  await expect(page.getByRole("navigation", { name: "App controls" }).getByRole("button", { name: "Install app", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".brand").evaluate(node => node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("install-320.png") });
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  expect(await page.evaluate(() => (window as any).installed)).toBe(1);
  await expect(page.getByRole("button", { name: "Install app", exact: true })).toHaveCount(0);
});

test("reduced motion switches immediately without spatial animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByLabel("Choose files", { exact: true }).setInputFiles([upload(1), upload(2)]);
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByRole("tab", { name: "Split", exact: true }).dispatchEvent("mousedown", { button: 0 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator(".workspace-content")).toHaveCount(1);
  expect(await page.locator(".workspace-stage").evaluate(node => getComputedStyle(node).transform)).toBe("none");
  expect(await panel(page).evaluate(node => ({ opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform }))).toEqual({ opacity: "1", transform: "none" });
});
