import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  root: fromRoot("./v2/"),
  publicDir: false,
  appType: "mpa",
  build: {
    outDir: "dist",
    rolldownOptions: {
      input: {
        home: fromRoot("./v2/index.html"),
        en: fromRoot("./v2/en/index.html"),
        ja: fromRoot("./v2/ja/index.html"),
      },
    },
  },
});
