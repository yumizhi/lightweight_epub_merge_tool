import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures.js";

// Opt-in recording of the production app. Viewing pauses only affect this demo.
test.use({
  viewport: { width: 1280, height: 1000 },
  video: { mode: "on", size: { width: 1280, height: 1000 } },
});
test("record the file-to-download workflow", async ({ page }, testInfo) => {
  test.skip(
    !process.env.RECORD_DEMO,
    "Set RECORD_DEMO=1 to refresh the README recording.",
  );
  await page.goto("./");
  await page.waitForTimeout(700);
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles(
      [2, 1, 3].map((volume) => ({
        name: `volume-${volume}.epub`,
        mimeType: "application/epub+zip",
        buffer: Buffer.from(fixture(volume, 3, true)),
      })),
    );
  await expect(page.getByRole("button", { name: "Merge books" })).toBeEnabled();
  await page.getByLabel("Collection title").fill("Collected stories");
  await page.getByLabel("Output filename").fill("stories.epub");
  await page.waitForTimeout(700);
  const handle = (await page.locator(".drag-handle").first().boundingBox())!,
    target = (await page.locator(".book-row").nth(1).boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2 + 10,
    { steps: 5 },
  );
  await expect(page.locator("[data-dnd-dragging]")).toHaveCount(1);
  await page.mouse.move(
    handle.x + handle.width / 2,
    target.y + target.height / 2,
    { steps: 25 },
  );
  await page.mouse.up();
  await expect(page.locator(".book-list .book-row h3")).toHaveText([
    "Volume 1",
    "Volume 2",
    "Volume 3",
  ]);
  await page.waitForTimeout(600);
  await page
    .getByRole("region", { name: "Contents preview" })
    .screenshot({ path: testInfo.outputPath("preview.png") });
  await page.getByRole("button", { name: "Merge books" }).click();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 6000,
  });
  await page.screenshot({ path: "docs/workspace.png", fullPage: true });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("stories.epub");
  await page.waitForTimeout(1000);
});
