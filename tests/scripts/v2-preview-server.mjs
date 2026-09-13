import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { preview } from "vite";
import { PROJECT, REPOSITORY, validateSha } from "./v2-preview-deployment.mjs";

// Local-only Pages global-header adapter. Live smoke consumes actual edge headers.
const source = await readFile(new URL("../../v2/dist/_headers", import.meta.url), "utf8");
const headers = {};
for (const line of source.trimEnd().split(/\r?\n/)) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line)) {
    assert.equal(line, "/*", "Extend the preview adapter before adding path-specific headers");
    continue;
  }
  const match = line.trim().match(/^([^:]+):\s*(.+)$/);
  assert(match && !headers[match[1]], "Invalid or duplicate preview header");
  headers[match[1]] = match[2];
}
assert(headers["Content-Security-Policy"], "Missing built CSP");
assert(process.env.V2_PREVIEW_LOCAL === "1", "Fixture server is local-only");
const manifest = { project: PROJECT, repository: REPOSITORY, sha: validateSha(process.env.TARGET_SHA) };
await preview({
  configFile: "vite.v2.config.mjs",
  preview: { host: "127.0.0.1", port: 4176, strictPort: true, headers },
  plugins: [{
    name: "local-preview-manifest",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== "/deployment.json") return next();
        for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(manifest));
      });
    },
  }],
});
