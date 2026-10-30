import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base:
    process.env.GITHUB_PAGES === "true" ? "/lightweight_epub_merge_tool/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-180.png"],
      manifest: {
        name: "EPUB Toolkit",
        short_name: "EPUB Toolkit",
        description: "Merge, split, and inspect EPUBs on your device.",
        theme_color: "#171717",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  root: "web",
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
