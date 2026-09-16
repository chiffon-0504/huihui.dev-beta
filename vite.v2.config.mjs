import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { build, defineConfig, normalizePath } from "vite";
import zhHant from "./v2/src/locales/zh-Hant.ts";
import en from "./v2/src/locales/en.ts";
import ja from "./v2/src/locales/ja.ts";

const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

// Page metadata and the no-JavaScript fallback share the typed runtime copy.
function pageHtml() {
  const entries = Object.fromEntries(Object.entries({ "": zhHant, "/en": en, "/ja": ja }).flatMap(([prefix, locale]) =>
    ["about", "works", "posts"].map((page) => [`${prefix}/${page}/index.html`, { page, copy: locale[`${page}Page`] }])));
  const escape = (text) => text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  return {
    name: "v2-page-html",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const entry = entries[context.path];
        if (!entry) return html;
        return html.replace(/\{\{(about|works|posts)\.(title|description|noScript)\}\}/g,
          (placeholder, page, key) => page === entry.page ? escape(entry.copy[key]) : placeholder);
      },
    },
  };
}

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
      async handler(_html, context) {
        if (context.path === "/404.html") return;
        const { fileName } = await compile();
        // A classic head script also blocks in browsers without blocking=render.
        return [{ tag: "script", attrs: { src: command === "serve" ? "/theme-bootstrap.js" : `/${fileName}` }, injectTo: "head-prepend" }];
      },
    },
  };
}

// Preview mirrors Pages' static error document, independently of the app resolver.
function strictNotFound() {
  return {
    name: "v2-strict-not-found",
    async configurePreviewServer(server) {
      const { root, build, preview } = server.config;
      const html = await readFile(resolve(root, build.outDir, "404.html"));
      const entries = Object.values(build.rolldownOptions.input)
        .map((entry) => `/${normalizePath(relative(root, entry))}`)
        .filter((entry) => entry.endsWith("/index.html"));
      const aliases = new Map(entries.flatMap((entry) => {
        const route = entry.slice(0, -"index.html".length);
        return [[entry, route], ...(route === "/" ? [] : [[route.slice(0, -1), route]])];
      }));
      const serveNotFound = (request, response) => {
        for (const [name, value] of Object.entries(preview.headers ?? {})) response.setHeader(name, value);
        response.statusCode = 404;
        // Pages error responses override the content cache policy with no-store.
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Content-Length", html.byteLength);
        response.end(request.method === "HEAD" ? undefined : html);
      };
      server.middlewares.use((request, response, next) => {
        if (!["GET", "HEAD"].includes(request.method)) return next();
        const [pathname, ...query] = request.url.split("?");
        // Reserve the error document before Vite's static middleware can
        // expose it as a successful file or extensionless HTML alias.
        if (pathname === "/404.html" || pathname === "/404") return serveNotFound(request, response);
        const canonical = aliases.get(pathname);
        if (!canonical) return next();
        response.writeHead(308, { Location: canonical + (query.length ? `?${query.join("?")}` : "") });
        response.end();
      });
      // Run after Vite's real static files and MPA lookup. Known HTML rewrites
      // still proceed to Vite's index middleware; missing resources stay 404.
      return () => server.middlewares.use((request, response, next) => {
        if (!["GET", "HEAD"].includes(request.method)
          || entries.includes(request.url.split("?")[0])) return next();
        serveNotFound(request, response);
      });
    },
  };
}

export default defineConfig({
  root: fromRoot("./v2/"),
  publicDir: "public",
  appType: "mpa",
  plugins: [pageHtml(), themeBootstrap(), strictNotFound()],
  build: {
    outDir: "dist",
    rolldownOptions: {
      input: {
        notFound: fromRoot("./v2/404.html"),
        home: fromRoot("./v2/index.html"),
        en: fromRoot("./v2/en/index.html"),
        ja: fromRoot("./v2/ja/index.html"),
        posts: fromRoot("./v2/posts/index.html"),
        enPosts: fromRoot("./v2/en/posts/index.html"),
        jaPosts: fromRoot("./v2/ja/posts/index.html"),
        works: fromRoot("./v2/works/index.html"),
        enWorks: fromRoot("./v2/en/works/index.html"),
        jaWorks: fromRoot("./v2/ja/works/index.html"),
        about: fromRoot("./v2/about/index.html"),
        enAbout: fromRoot("./v2/en/about/index.html"),
        jaAbout: fromRoot("./v2/ja/about/index.html"),
      },
    },
  },
});
