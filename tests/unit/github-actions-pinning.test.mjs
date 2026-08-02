import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const workflowsDirectory = path.join(root, ".github/workflows");

function extractUsesReference(line) {
  const match = line.match(/^\s*(?:-\s*)?uses\s*:\s*(.*?)\s*$/);
  if (!match) return null;

  const scalar = match[1].trim();
  if (!scalar) return null;

  if (scalar.startsWith('"') || scalar.startsWith("'")) {
    const quote = scalar[0];
    const closingQuote = scalar.indexOf(quote, 1);
    return closingQuote === -1 ? scalar : scalar.slice(1, closingQuote);
  }

  return scalar.replace(/\s+#.*$/, "");
}

function requiresCommitPin(reference) {
  const normalized = reference.toLowerCase();
  return (
    !reference.startsWith("./") &&
    !reference.startsWith("../") &&
    !normalized.startsWith("docker://")
  );
}

function usesFullCommitSha(reference) {
  const separator = reference.lastIndexOf("@");
  return separator > 0 && /^[0-9a-f]{40}$/.test(reference.slice(separator + 1));
}

async function workflowUsesReferences() {
  const entries = await readdir(workflowsDirectory, { withFileTypes: true });
  const workflowFiles = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  expect(workflowFiles.length, "workflow files").toBeGreaterThan(0);

  const references = [];
  for (const workflowFile of workflowFiles) {
    const source = await readFile(
      path.join(workflowsDirectory, workflowFile),
      "utf8",
    );

    source.split(/\r?\n/).forEach((line, index) => {
      const reference = extractUsesReference(line);
      if (reference) {
        references.push({
          workflowFile,
          lineNumber: index + 1,
          reference,
        });
      }
    });
  }

  return references;
}

describe("GitHub Actions commit pinning", () => {
  test("pins every third-party workflow action to a full commit SHA", async () => {
    const thirdPartyReferences = (await workflowUsesReferences()).filter(
      ({ reference }) => requiresCommitPin(reference),
    );

    expect(thirdPartyReferences.length, "third-party uses references").toBeGreaterThan(0);

    for (const { workflowFile, lineNumber, reference } of thirdPartyReferences) {
      expect(
        usesFullCommitSha(reference),
        `${workflowFile}:${lineNumber} ${reference}`,
      ).toBe(true);
    }
  });

  test("rejects tags, branches, and short commit SHAs", () => {
    const rejectedReferences = [
      "owner/action@v4",
      "owner/action@v3",
      "owner/action@main",
      "owner/action@master",
      "owner/action@0123456789ab",
    ];

    for (const reference of rejectedReferences) {
      expect(usesFullCommitSha(reference), reference).toBe(false);
    }
  });

  test("does not apply GitHub commit pinning to local or Docker actions", () => {
    const excludedReferences = [
      "./.github/actions/local-composite",
      "./.github/workflows/local-reusable.yml",
      "../shared/action",
      "docker://alpine:3.22",
      "docker://ghcr.io/example/action@sha256:0123456789abcdef",
    ];

    for (const reference of excludedReferences) {
      expect(requiresCommitPin(reference), reference).toBe(false);
    }
  });
});
