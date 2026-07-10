import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const browserRoots = ["js", "tools/tier-maker"];
const workerPath = "workers/huihui-api/worker.js";

async function listJavaScriptFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listJavaScriptFiles(relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(relativePath);
    }
  }

  return files;
}

function assertSyntax(result, filePath) {
  if (result.status === 0) return;

  process.stderr.write(result.stderr || result.stdout || "");
  throw new Error(`JavaScript syntax check failed: ${filePath}`);
}

const browserFiles = (
  await Promise.all(browserRoots.map(listJavaScriptFiles))
).flat();

for (const filePath of browserFiles) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: root,
    encoding: "utf8",
  });
  assertSyntax(result, filePath);
}

const workerSource = await readFile(path.join(root, workerPath), "utf8");
const workerResult = spawnSync(
  process.execPath,
  ["--input-type=module", "--check"],
  {
    cwd: root,
    encoding: "utf8",
    input: workerSource,
  },
);
assertSyntax(workerResult, workerPath);

console.log(`JavaScript syntax checks passed for ${browserFiles.length + 1} files.`);
