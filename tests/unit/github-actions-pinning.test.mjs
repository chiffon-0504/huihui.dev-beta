import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseDocument } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const workflowsDirectory = path.join(root, ".github/workflows");

function parseWorkflow(source, workflowFile) {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join("; ");
    throw new Error(`${workflowFile} is not valid YAML: ${details}`);
  }

  return document.toJS();
}

function collectUsesReferences(value, location = "$", references = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      collectUsesReferences(child, `${location}[${index}]`, references);
    });
    return references;
  }

  if (!value || typeof value !== "object") return references;

  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (key === "uses") {
      references.push({ location: childLocation, reference: child });
    }
    collectUsesReferences(child, childLocation, references);
  }

  return references;
}

function requiresCommitPin(reference) {
  if (typeof reference !== "string") return true;

  const normalized = reference.toLowerCase();
  return (
    !reference.startsWith("./") &&
    !reference.startsWith("../") &&
    !normalized.startsWith("docker://")
  );
}

function usesFullCommitSha(reference) {
  if (typeof reference !== "string") return false;

  const separator = reference.lastIndexOf("@");
  return separator > 0 && /^[0-9a-f]{40}$/.test(reference.slice(separator + 1));
}

function validateWorkflowActionPins(source, workflowFile) {
  const references = collectUsesReferences(parseWorkflow(source, workflowFile));
  const thirdPartyReferences = references.filter(({ reference }) =>
    requiresCommitPin(reference),
  );
  const invalidReferences = thirdPartyReferences.filter(
    ({ reference }) => !usesFullCommitSha(reference),
  );

  if (invalidReferences.length > 0) {
    const details = invalidReferences
      .map(
        ({ location, reference }) =>
          `${workflowFile}:${location} ${String(reference)}`,
      )
      .join("; ");
    throw new Error(`Third-party actions must use full commit SHAs: ${details}`);
  }

  return thirdPartyReferences.length;
}

async function workflowFiles() {
  const entries = await readdir(workflowsDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  expect(files.length, "workflow files").toBeGreaterThan(0);
  return files;
}

describe("GitHub Actions commit pinning", () => {
  test("pins every third-party workflow action to a full commit SHA", async () => {
    let thirdPartyReferenceCount = 0;

    for (const workflowFile of await workflowFiles()) {
      const source = await readFile(
        path.join(workflowsDirectory, workflowFile),
        "utf8",
      );
      thirdPartyReferenceCount += validateWorkflowActionPins(
        source,
        workflowFile,
      );
    }

    expect(
      thirdPartyReferenceCount,
      "third-party uses references",
    ).toBeGreaterThan(0);
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
    const source = `
jobs:
  local-workflow:
    uses: ./.github/workflows/local-reusable.yml
  test:
    steps:
      - "uses": ./.github/actions/local-composite
      - 'uses': ../shared/action
      - uses: docker://alpine:3.22
      - uses: docker://ghcr.io/example/action@sha256:0123456789abcdef
`;

    expect(validateWorkflowActionPins(source, "excluded.yml")).toBe(0);
  });

  test.each([
    {
      keyStyle: "bare step key",
      source: `
jobs:
  test:
    steps:
      - uses: owner/action@v3
`,
    },
    {
      keyStyle: "double-quoted step key",
      source: `
jobs:
  test:
    steps:
      - "uses": owner/action@v4
`,
    },
    {
      keyStyle: "single-quoted reusable-workflow key",
      source: `
jobs:
  reusable:
    'uses': owner/workflows/.github/workflows/test.yml@main
`,
    },
  ])("rejects a floating tag under a $keyStyle", ({ source }) => {
    expect(() => validateWorkflowActionPins(source, "floating.yml")).toThrow(
      /Third-party actions must use full commit SHAs/,
    );
  });

  test.each([
    {
      keyStyle: "bare step key",
      source: `
jobs:
  test:
    steps:
      - uses: owner/action@0123456789abcdef0123456789abcdef01234567
`,
    },
    {
      keyStyle: "double-quoted step key",
      source: `
jobs:
  test:
    steps:
      - "uses": owner/action@0123456789abcdef0123456789abcdef01234567
`,
    },
    {
      keyStyle: "single-quoted reusable-workflow key",
      source: `
jobs:
  reusable:
    'uses': owner/workflows/.github/workflows/test.yml@0123456789abcdef0123456789abcdef01234567
`,
    },
  ])("accepts a full commit SHA under a $keyStyle", ({ source }) => {
    expect(validateWorkflowActionPins(source, "pinned.yml")).toBe(1);
  });
});
