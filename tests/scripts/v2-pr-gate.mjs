import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Preserve the former workflow path filter, including its shared dependencies.
const relevantFiles = new Set([
  "workers/huihui-api/worker.js",
  "tests/scripts/v2-beta-server.mjs",
  "tests/support/v2-beta-contract.mjs",
  "tests/support/v2-viewer-fixture.mjs",
  "tests/support/csp-enforcement.mjs",
  "playwright.v2-beta.config.mjs",
  "playwright.v2.config.mjs",
  "playwright.base.config.mjs",
  "vite.v2.config.mjs",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "_headers",
  ".github/workflows/beta-cd.yml",
  ".github/workflows/validate-v2.yml",
  "tests/scripts/v2-pr-gate.mjs",
  "tests/unit/github-actions-pinning.test.mjs",
  "vitest.config.mjs",
]);

export function requiresV2(paths) {
  return paths.some((file) =>
    /^(?:v2|functions|tests\/v2|tests\/v2-beta)\//.test(file) ||
    /^workers\/huihui-api\/jev(?:-security)?\.js$/.test(file) ||
    /^tests\/unit\/v2-[^/]*\.test\.mjs$/.test(file) ||
    relevantFiles.has(file),
  );
}

export function changedPaths(base, head, cwd = process.cwd()) {
  if (![base, head].every((sha) => /^[0-9a-f]{40}$/.test(sha ?? ""))) {
    throw new Error("Expected full PR base and head commit SHAs");
  }
  // Three-dot PR diff, without API pagination/path limits. Disabling rename
  // detection includes both old and new paths, including moves out of V2.
  const output = execFileSync("git", [
    "diff", "--name-only", "--no-renames", "-z", `${base}...${head}`, "--",
  ], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return output.split("\0").filter(Boolean);
}

export function requireGate(env) {
  if (env.CHANGES_RESULT !== "success") {
    throw new Error("V2 change detection did not succeed");
  }
  if (!["true", "false"].includes(env.V2_REQUIRED)) {
    throw new Error("V2 applicability is missing or invalid");
  }
  const expected = env.V2_REQUIRED === "true" ? "success" : "skipped";
  for (const key of ["UNIT_RESULT", "BROWSERS_RESULT", "BETA_RESULT"]) {
    if (env[key] !== expected) {
      throw new Error(`${key}: expected ${expected}, received ${env[key]}`);
    }
  }
  return env.V2_REQUIRED === "true"
    ? "Every required V2 component succeeded."
    : "V2 validation is not applicable; all V2 components were skipped.";
}

function main() {
  if (process.argv[2] === "changes") {
    const paths = changedPaths(process.env.PR_BASE_SHA, process.env.PR_HEAD_SHA);
    const required = requiresV2(paths);
    appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
    console.log(`V2 validation required: ${required}`);
  } else if (process.argv[2] === "gate") {
    console.log(requireGate(process.env));
  } else {
    throw new Error("Expected command: changes or gate");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
