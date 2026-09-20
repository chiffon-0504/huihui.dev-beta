import { fileURLToPath } from "node:url";
import { assertPerformance, budgets, measurePerformance, readFiles } from "./performance.mjs";

// npm's command builds first: never silently measure a stale or missing dist.
try {
  const report = measurePerformance(await readFiles(fileURLToPath(new URL("../dist/", import.meta.url))));
  console.log(JSON.stringify({ units: "uncompressed bytes", budgets, ...report }, null, 2));
  assertPerformance(report);
  console.log("V2 performance budgets passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
