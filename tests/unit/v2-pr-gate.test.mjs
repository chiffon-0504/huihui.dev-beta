import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { changedPaths, requireGate, requiresV2 } from "../scripts/v2-pr-gate.mjs";

const script = path.resolve(import.meta.dirname, "../scripts/v2-pr-gate.mjs");
const successful = {
  CHANGES_RESULT: "success",
  V2_REQUIRED: "true",
  UNIT_RESULT: "success",
  BROWSERS_RESULT: "success",
  BETA_RESULT: "success",
};
const notApplicable = {
  ...successful,
  V2_REQUIRED: "false",
  UNIT_RESULT: "skipped",
  BROWSERS_RESULT: "skipped",
  BETA_RESULT: "skipped",
};

describe("V2 required PR gate", () => {
  test.each([
    "functions/_middleware.js", "workers/huihui-api/jev.js", "workers/huihui-api/jev-security.js", "workers/huihui-api/worker.js",
    "v2/src/main.ts", "v2/tsconfig.json", "tests/v2/home.spec.mjs",
    "tests/v2-beta/pages.spec.mjs", "tests/unit/v2-build.test.mjs",
    "tests/scripts/v2-beta-server.mjs", "tests/support/v2-beta-contract.mjs",
    "tests/support/v2-viewer-fixture.mjs", "tests/support/csp-enforcement.mjs",
    "playwright.v2-beta.config.mjs", "playwright.v2.config.mjs",
    "playwright.base.config.mjs", "vite.v2.config.mjs", "tsconfig.json",
    "package.json", "package-lock.json", "_headers",
    ".github/workflows/beta-cd.yml", ".github/workflows/validate-v2.yml",
    "tests/scripts/v2-pr-gate.mjs", "tests/unit/v2-pr-gate.test.mjs",
    "tests/unit/github-actions-pinning.test.mjs", "vitest.config.mjs",
  ])("requires V2 validation for %s", (file) => {
    expect(requiresV2([file])).toBe(true);
  });

  test("does not require V2 for unrelated changes or truncate long path lists", () => {
    const unrelated = ["README.md", "js/main.js", "workers/huihui-api/index.js",
      ...Array.from({ length: 3500 }, (_, index) => `docs/page-${index}.md`)];
    expect(requiresV2(unrelated)).toBe(false);
    expect(requiresV2([...unrelated, "v2/src/main.ts"])).toBe(true);
    expect(requiresV2([])).toBe(false);
  });

  test("passes only successful required validation or verified non-applicability", () => {
    expect(requireGate(successful)).toContain("succeeded");
    expect(requireGate(notApplicable)).toContain("not applicable");
    for (const env of [successful, notApplicable]) {
      for (const key of ["UNIT_RESULT", "BROWSERS_RESULT", "BETA_RESULT"]) {
        for (const result of ["failure", "cancelled", "skipped", "success", "", undefined]) {
          if (result !== env[key]) {
            expect(() => requireGate({ ...env, [key]: result }), `${key}: ${result}`).toThrow();
          }
        }
      }
    }
  });

  test("fails closed on unsuccessful detection or missing/invalid applicability", () => {
    for (const env of [successful, notApplicable]) {
      for (const result of ["failure", "cancelled", "skipped", "", undefined]) {
        expect(() => requireGate({ ...env, CHANGES_RESULT: result })).toThrow();
      }
      for (const required of ["", undefined, "TRUE", "False", "unknown"]) {
        expect(() => requireGate({ ...env, V2_REQUIRED: required })).toThrow();
      }
    }
  });

  test("exits unsuccessfully for a failed browser and successfully for both valid gate paths", () => {
    for (const [env, status] of [
      [successful, 0], [notApplicable, 0],
      [{ ...successful, BROWSERS_RESULT: "failure" }, 1],
      [{ ...notApplicable, CHANGES_RESULT: "failure" }, 1],
    ]) {
      const result = spawnSync(process.execPath, [script, "gate"], {
        env: { ...process.env, ...env }, encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(status);
    }
  });

  test("uses the PR merge base and detects removals/renames with complete, unquoted paths", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "v2-pr-gate-"));
    const git = (...args) => execFileSync("git", args, {
      cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    try {
      git("init");
      git("config", "user.name", "V2 gate test");
      git("config", "user.email", "v2-gate@example.invalid");
      git("config", "commit.gpgsign", "false");
      mkdirSync(path.join(directory, "v2"));
      mkdirSync(path.join(directory, "docs"));
      writeFileSync(path.join(directory, "v2/old file.ts"), "export {};\n");
      git("add", ".");
      git("commit", "-m", "fixture base");
      const ancestor = git("rev-parse", "HEAD");
      renameSync(path.join(directory, "v2/old file.ts"), path.join(directory, "docs/moved file.ts"));
      git("add", "-A");
      git("commit", "-m", "move out of V2");
      const head = git("rev-parse", "HEAD");
      expect(changedPaths(ancestor, head, directory).sort()).toEqual([
        "docs/moved file.ts", "v2/old file.ts",
      ]);
      const output = path.join(directory, "gate-output");
      const runChanges = (base, prHead) => spawnSync(process.execPath, [script, "changes"], {
        cwd: directory, encoding: "utf8",
        env: { ...process.env, PR_BASE_SHA: base, PR_HEAD_SHA: prHead, GITHUB_OUTPUT: output },
      });
      expect(runChanges(ancestor, head).status).toBe(0);
      expect(readFileSync(output, "utf8")).toBe("required=true\n");
      git("checkout", "--detach", ancestor);
      writeFileSync(path.join(directory, "v2/base-only.ts"), "export {};\n");
      git("add", "v2/base-only.ts");
      git("commit", "-m", "base branch advances");
      const base = git("rev-parse", "HEAD");
      git("checkout", "--detach", ancestor);
      mkdirSync(path.join(directory, "docs"), { recursive: true });
      writeFileSync(path.join(directory, "docs/readme.md"), "Documentation only.\n");
      git("add", "docs/readme.md");
      git("commit", "-m", "non-V2 PR");
      const docsHead = git("rev-parse", "HEAD");
      expect(changedPaths(base, docsHead, directory)).toEqual(["docs/readme.md"]);
      writeFileSync(output, "");
      expect(runChanges(base, docsHead).status).toBe(0);
      expect(readFileSync(output, "utf8")).toBe("required=false\n");
      writeFileSync(output, "");
      expect(runChanges(base, "f".repeat(40)).status).toBe(1);
      expect(readFileSync(output, "utf8")).toBe("");
      expect(() => changedPaths("--invalid", docsHead, directory)).toThrow(/full PR/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
