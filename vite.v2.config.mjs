import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build, defineConfig, normalizePath } from "vite";

const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

function themeBootstrap() {
  let command;
  let compilation;
  const themeDirectory = normalizePath(fromRoot("./v2/src/theme/"));
  const compile = () => compilation ??= build({
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      emptyOutDir: false,
      minify: true,
      lib: { entry: fromRoot("./v2/src/theme/bootstrap.ts"), formats: ["iife"], name: "huihuiThemeBootstrap" },
    },
  }).then((result) => {
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
    const script = outputs[0];
    if (outputs.length !== 1 || script?.type !== "chunk" || script.imports.length || script.dynamicImports.length) {
      throw new Error("The theme bootstrap must compile to one self-contained classic script.");
    }
    const hash = createHash("sha256").update(script.code).digest("hex").slice(0, 12);
    return { source: script.code, fileName: `assets/theme-bootstrap-${hash}.js` };
  });

  return {
    name: "v2-theme-bootstrap",
    configResolved(config) { command = config.command; },
    async buildStart() {
      if (command === "build") {
        const { fileName, source } = await compile();
        this.emitFile({ type: "asset", fileName, source });
      }
    },
    configureServer(server) {
      server.watcher.on("change", (file) => {
        if (normalizePath(file).startsWith(themeDirectory)) compilation = undefined;
      });
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== "/theme-bootstrap.js") return next();
        try {
          const { source } = await compile();
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(source);
        } catch (error) { next(error); }
      });
    },
    transformIndexHtml: {
      order: "post",
      async handler() {
        const { fileName } = await compile();
        // A classic head script also blocks in browsers without blocking=render.
        return [{ tag: "script", attrs: { src: command === "serve" ? "/theme-bootstrap.js" : `/${fileName}` }, injectTo: "head-prepend" }];
      },
    },
  };
}

export default defineConfig({
  root: fromRoot("./v2/"),
  publicDir: false,
  appType: "mpa",
  plugins: [themeBootstrap()],
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
