import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("locale modules and negative type contracts use the strict v2 compiler", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../../node_modules/typescript/bin/tsc", import.meta.url)),
    "--project", fileURLToPath(new URL("../fixtures/v2-locales.tsconfig.json", import.meta.url)),
    "--noEmit", "--pretty", "false",
  ], { encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
