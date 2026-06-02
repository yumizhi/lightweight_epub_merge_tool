import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/lightweight_epub_merge_tool/" : "/",
  plugins: [react()],
  root: "web",
  build: {
    outDir: "../dist-web",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
