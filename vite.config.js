import { globSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const webRoot = resolve(import.meta.dirname, "web");
const htmlEntries = globSync("**/*.html", { cwd: webRoot }).map((page) =>
  resolve(webRoot, page)
);

export default defineConfig({
  root: webRoot,
  appType: "mpa",
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: htmlEntries
    }
  }
});
