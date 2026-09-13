import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { preview } from "vite";
import { securityHeaders } from "../support/v2-beta-contract.mjs";

// Local-only Pages global-header adapter. Live smoke consumes actual edge headers.
assert(process.env.V2_BETA_LOCAL === "1", "Fixture server is local-only");
const headers = securityHeaders(await readFile(new URL("../../v2/dist/_headers", import.meta.url), "utf8"));
await preview({
  configFile: "vite.v2.config.mjs",
  preview: { host: "127.0.0.1", port: 4176, strictPort: true, headers },
});
