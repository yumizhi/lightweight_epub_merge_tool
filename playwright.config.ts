import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173/lightweight_epub_merge_tool/",
    viewport: { width: 1440, height: 1050 },
    colorScheme: "light",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run preview:web -- --host 127.0.0.1 --port 4173 --base=/lightweight_epub_merge_tool/",
    url: "http://127.0.0.1:4173/lightweight_epub_merge_tool/",
    reuseExistingServer: !process.env.CI,
  },
});
