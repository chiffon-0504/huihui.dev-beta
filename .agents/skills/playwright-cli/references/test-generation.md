# Test generation (plan → generate → heal)

End-to-end workflow for authoring and maintaining Playwright tests with `playwright-cli`. Every `playwright-cli` action emits the equivalent Playwright TypeScript, and that generated code is the raw material for every test. The sections below can be used independently:

- **How generation works** — the core mechanic everything else relies on: actions become TypeScript, plus how to add assertions.
- **Plan** — explore the app, produce a spec file describing what to test.
- **Generate** — turn a spec into Playwright test files. Resolve harmless technical ambiguity without changing intent; ask before changing expected behavior.
- **Heal** — diagnose failing tests, fix the code while preserving approved intent; reconcile behavior changes only after user confirmation.

Plan / generate / heal lean on the same mechanic: run `npx playwright test --debug=cli` in the background, then `playwright-cli attach tw-XXXX` to drive the paused page interactively. See [playwright-tests.md](playwright-tests.md) for the debug/attach mechanics.

---

## 0. How generation works

Every action you perform with `playwright-cli` generates corresponding Playwright TypeScript code. This code appears in the output and can be copied directly into your test files.

```bash
# Start a session
playwright-cli open https://example.com/contact

# Take a snapshot to see elements
playwright-cli snapshot
# Output shows: e1 [textbox "Email"], e2 [textbox "Message"], e3 [button "Send"]

# Fill form fields - generates code automatically
playwright-cli fill e1 "user@example.com"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');

playwright-cli fill e2 "Please send product information"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Message' }).fill('Please send product information');

playwright-cli click e3
# Ran Playwright code:
# await page.getByRole('button', { name: 'Send' }).click();
```

### Building a test file

Collect the generated code into a Playwright test:

```typescript
import { test, expect } from '@playwright/test';

test('contact form', async ({ page }) => {
  // Generated code from playwright-cli session:
  await page.goto('https://example.com/contact');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Message' }).fill('Please send product information');
  await page.getByRole('button', { name: 'Send' }).click();

  // Add assertions
  await expect(page).toHaveURL(/.*thank-you/);
});
```

### Use semantic locators

The generated code uses role-based locators when possible, which are more resilient:

```typescript
// Generated (good - semantic)
await page.getByRole('button', { name: 'Submit' }).click();

// Avoid (fragile - CSS selectors)
await page.locator('#submit-btn').click();
```

### Explore before recording

Take snapshots to understand the page structure before recording actions:

```bash
playwright-cli open https://example.com
playwright-cli snapshot
# Review the element structure
playwright-cli click e5
```

### Add assertions manually

Generated code captures actions but not assertions. Add expectations in your test using one of the recommended matchers:

- `toBeVisible()` — element is rendered and visible
- `toHaveText(text)` — element text content matches
- `toHaveValue(value) / toBeEmpty()` — input/select value matches
- `toBeChecked() / toBeUnchecked()` — checkbox state matches
- `toMatchAriaSnapshot(snapshot)` — page (or locator) matches a partial accessibility snapshot

Use `playwright-cli generate-locator <target>` to produce the locator expression for the assertion, and the snapshot/eval commands to capture the expected value.

When asserting text content, make sure that generated locator does not contain text from the element itself. `getByTestId()` or `getByLabel()` usually work well with asserting text. When locator is text-based, prefer `toBeVisible()` instead.

Snapshot to be matched does not have to contain all the information - only capture what's necessary for the assertion. You can use regular expressions for unstable values.

```bash
# Get a stable locator for an element ref to use in the assertion
playwright-cli --raw generate-locator e5
# getByRole('button', { name: 'Submit' })

# Capture expected text content for toHaveText
playwright-cli --raw eval "el => el.textContent" e5

# Capture expected input value for toHaveValue/toBeEmpty
playwright-cli --raw eval "el => el.value" e5

# Capture expected aria snapshot for toMatchAriaSnapshot/toBeChecked
# (whole page, or use a ref to scope to a region)
playwright-cli --raw snapshot
playwright-cli --raw snapshot e5
```

```typescript
// Generated action
await page.getByRole('button', { name: 'Submit' }).click();

// Manual assertions using the outputs above:
await expect(page.getByRole('alert', { name: 'Success' })).toBeVisible();
await expect(page.getByTestId('main-header')).toHaveText('Welcome, user');
await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('user@example.com');
await expect(page.getByRole('checkbox', { name: 'Enable notifications' })).toBeChecked();

// toMatchAriaSnapshot on the whole page, finds a matching region
await expect(page).toMatchAriaSnapshot(`
  - heading "Welcome, user"
  - link /\\d+ new messages?/
  - button "Sign out"
`);

// toMatchAriaSnapshot scoped to a region
await expect(page.getByRole('navigation')).toMatchAriaSnapshot(`
  - link "Home"
  - link /\\d+ new messages?/
  - link "Profile"
`);
```

---

## 1. Planning

Goal: produce a spec file (e.g. `specs/<feature>.plan.md`) that enumerates the scenarios to test. **Always** write the spec to a file.

### 1.1 Prerequisite: workspace

Check the workspace has Playwright installed before anything else:

```bash
# Either of these confirms a workspace:
test -f playwright.config.ts || test -f playwright.config.js
npx --no-install playwright --version
```

The repository test runner is separate from the pinned standalone CLI. If it or a required test-debugging capability is unavailable, report that limitation; do not bootstrap or upgrade the automated test stack for this Skill.

### 1.2 Prerequisite: seed test

A **seed test** is a minimal test that lands the page in the state every scenario starts from: navigation to the app, any required login, feature flags, etc. Scenarios assume a fresh start *after* the seed. `--debug=cli` pauses *inside* this test, so the seed is where every planning and generation session begins.

Minimum viable seed:

```ts
// tests/seed.spec.ts
import { test } from '@playwright/test';

test('seed', async ({ page }) => {
  await page.goto('https://example.com/');
});
```

Preferred — push navigation into a fixture so scenario tests reuse it:

```ts
// tests/fixtures.ts
import { test as baseTest } from '@playwright/test';
export { expect } from '@playwright/test';

export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.goto('https://example.com/');
    await use(page);
  },
});
```

```ts
// tests/seed.spec.ts
import { test } from './fixtures';

test('seed', async ({ page }) => {
  // Fixture already navigates. This empty body tells agents where to start.
});
```

If no seed exists, create one that at least navigates to the app.

### 1.3 Explore the app

Launch the app via the seed in the background and attach:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/seed.spec.ts --debug=cli
# wait for "Debugging Instructions" and the session name tw-XXXX
playwright-cli attach tw-XXXX
```

Resume so the seed runs, then probe the app:

```bash
playwright-cli resume                   # resume so that seed test runs fully
playwright-cli snapshot                 # inventory of interactive elements
playwright-cli click e5                 # follow a flow
playwright-cli eval "location.href"     # read URL / state
playwright-cli show --annotate          # ask the user to point at something
```

Map out:

- Interactive surfaces (forms, buttons, lists, filters, modals).
- Primary user journeys end-to-end.
- Edge cases: empty states, validation errors, very long input, boundary values.
- Persistence: reload, local/session storage, URL fragments.
- Navigation: which controls change the URL, back/forward behaviour.

**Important**: Do not just open the app url with playwright-cli, always go through the test to capture any custom setup done there.
**Important**: Stop the background test when done exploring.

### 1.4 Write the spec file

Save under `specs/<feature>.plan.md`. Use this structure:

```markdown
# <Feature> Test Plan

## Application Overview

<One paragraph describing what the feature does and why it matters.>

## Test Scenarios

### 1. <Group Name>

**Seed:** `tests/seed.spec.ts`

#### 1.1. <kebab-case-scenario-name>

**File:** `tests/<group>/<kebab-case-scenario-name>.spec.ts`

**Steps:**
  1. <Concrete user step>
    - expect: <observable outcome>
    - expect: <another observable outcome>
  2. <Next step>
    - expect: <outcome>

#### 1.2. <next-scenario>
...

### 2. <Next Group>

**Seed:** `tests/seed.spec.ts`
...
```

Guidelines:

- Each scenario is independent and starts from the seed's fresh state — never chain scenarios.
- Scenario names are kebab-case and match the test file name (`should-add-single-todo` → `should-add-single-todo.spec.ts`).
- Cover happy path, edge cases, validation, negative flows, persistence.
- Write steps at the user level ("Type 'Buy milk' into the input"), not the API level ("call `fill`").
- Put observable outcomes in `- expect:` bullets; each becomes an assertion during generation.

---

## 2. Generate

Goal: take a spec file and produce Playwright test files. Preserve intended behavior; specification changes require the decision boundary below.

### 2.1 Inputs

- **Spec file**, e.g. `specs/basic-operations.plan.md`.
- **Target**: either a single scenario (e.g. `1.2`), a whole group (`1`), or all.
- **Seed file**, read from the `**Seed:**` line of the scenario's group.

### 2.2 Generate one scenario

For each target scenario, in sequence (never in parallel — scenarios share the seed session):

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test <seed-file> --debug=cli   # background
playwright-cli attach tw-XXXX
# resume
```

**Do not** just open the app url with playwright-cli, always go through the test to capture any custom setup done there.

Walk the scenario's `Steps:` one by one with `playwright-cli`. The specification / approved requirement defines intended behavior; the live application provides implementation evidence and is not automatically authoritative over the plan. Classify discrepancies rather than silently reconciling them.

Resolve only harmless technical ambiguity autonomously: choosing the one obvious button implied by a step, stable semantic locators, wrapper/DOM structure, technical locator drift, or implementation details already implied by the specification. Document these without changing intended user-visible behavior.

If the app contradicts an expected outcome, removes an expected feature/control, materially changes user-visible text or flow, changes intended operation order, or could represent either intentional change or regression, stop that scenario and ask the user. Provide the scenario id, relevant spec step/expectation, observed behavior, concrete evidence (snapshot text, URL, DOM state or outcome), and an evidence-qualified assessment of stale spec vs regression vs ambiguity. Do not rewrite the spec until the user decides. Continue independent scenarios where safe.

A user-confirmed intentional change permits a spec update. A user-confirmed regression preserves the spec and treats the app behavior as a bug. Generate and Heal use this same boundary.

Every action prints the equivalent Playwright TypeScript (see [How generation works](#0-how-generation-works)):

```bash
playwright-cli snapshot                         # find refs
playwright-cli fill e3 "John Doe"               # -> page.getByRole('textbox', {...}).fill(...)
playwright-cli press Enter
playwright-cli click e7
```

For each `- expect:` bullet, add an explicit assertion. See [How generation works](#0-how-generation-works) for details.

Collect the generated code and write the test file at the path given in the spec:

```ts
// spec: specs/basic-operations.plan.md
// seed: tests/seed.spec.ts
// test: tests/contact/send-message.spec.ts
import { test, expect } from '../fixtures';   // or '@playwright/test' if no fixtures file

test.describe('Contact form', () => {
  test('should send a message', async ({ page }) => {
    // 1. Navigate to the application
    // (handled by the seed fixture)

    // 2. Type 'John Doe' into the name field
    await page.getByRole('textbox', { name: 'Name' }).fill('John Doe');

    // 3. Type a non-sensitive message
    await page.getByRole('textbox', { name: 'Message' }).fill('Please send product information');

    // 4. Press Enter to submit
    await page.getByRole('textbox', { name: 'Message' }).press('Enter');

    await expect(page.getByRole('heading')).toContainText('Thank you, John Doe!');
  });
});
```

Rules:

- **One test per file.** File path, describe name, and test name come verbatim from the spec (minus the ordinal).
- Prefix each numbered step with a `// N. <step text>` comment before its actions.
- Use the describe group name verbatim from the spec (no `1.` ordinal).
- Locate the selected fixture module and calculate its import relative to each generated test file's directory; do not invent or relocate fixtures. Use `/` separators in module specifiers, including on Windows. With `tests/fixtures.ts`, `tests/foo.spec.ts` imports `./fixtures`, `tests/group/foo.spec.ts` imports `../fixtures`, and `tests/a/b/foo.spec.ts` imports `../../fixtures`. If no fixture module exists, import from `@playwright/test`.
- **Important**: close the CLI session and stop the background test before moving to the next scenario.

### 2.3 Generate multiple scenarios

Loop 2.2 over the targeted scenarios one at a time, restarting the seed between each so every test starts from a clean page. This is safe to parallelise due to unique generated session names - just make sure each test run is stopped.

### 2.4 Run generated tests

After generation, run the new tests once:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/<group>/<scenario>.spec.ts
```

Any failure goes to Section 3.

---

## 3. Heal

Goal: fix failing tests while preserving intended behavior; update the spec only after the user confirms an intentional product change.

### 3.1 Find failing tests

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test
```

Record the list of failing `<file>:<line>` entries and process them one at a time. Do not attempt parallel fixes — shared state and the single CLI session make that fragile.

### 3.2 Debug one failure

Run the single failing test in debug mode in the background, then attach:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/<group>/<scenario>.spec.ts:<line> --debug=cli
# wait for "Debugging Instructions" and the tw-XXXX session name
playwright-cli attach tw-XXXX
```

The test is paused at the start. Step forward or run to until just before the failing action or assertion, then diagnose:

```bash
playwright-cli snapshot                # did the element change / move / rename?
playwright-cli console                 # app-side errors?
playwright-cli requests                # failed request? wrong payload?
playwright-cli show --annotate         # ask the user to point somewhere
```

Common causes: selector drift, new wrapper element, label/ARIA rename, timing (transition, async load), assertion text updated in the app, test data leaking between runs.

Rehearse the corrected interaction with `playwright-cli` — the generated code in the output is what you paste back into the test.

### 3.3 Apply the fix

Apply the Generate decision boundary before editing: technical locator or implementation changes may preserve the existing expectations autonomously; user-visible discrepancies require the user decision in Section 3.4 first. Do not change assertions, intended order, or inputs merely to match observed behavior. Stop the background debug run and rerun the single test after an authorized fix.

Never skip hooks or add sleeps as a fix. Never use `networkidle`.

### 3.4 Reconcile with the spec

Open the spec referenced by the `// spec:` header in the test file and locate the scenario that matches the test.

- **Fix was purely technical** (locator drift, better assertion shape) and the spec's user-level behaviour still matches the app → leave the spec alone.
- **User confirmed an intentional change to user-visible steps, inputs, order, or expected outcomes** → update the spec to reflect that approved change. Keep the scenario id and file path stable; only the step / expect lines change.
- **Unclear whether the app change is intentional** (spec is stale) **or a regression** (test was right, app is wrong) → **stop and ask the user**. Provide:
  - the scenario id (e.g. `2.3`),
  - the spec lines that no longer match,
  - the observed app behaviour and concrete evidence (snapshot text, URL, DOM state or outcome),
  - an evidence-qualified assessment of stale spec, regression, or ambiguity.

Do not rewrite the spec before the user decides. After confirmation, either update it for an intentional change or preserve it and treat the app behavior as a bug for a regression.

### 3.5 Iteration and giving up

- Fix failures one at a time; rerun after each.
- If after thorough investigation you are confident the test is correct but the app is wrong *and* the user has confirmed it's a bug: mark the test `test.fixme(...)` with a comment pointing at the user's decision or issue link. Never silently skip.

---

## Cross-references

| For... | See |
|---|---|
| `--debug=cli` / attach mechanics | [playwright-tests.md](playwright-tests.md) |
| Mocking requests during exploration/generation | [request-mocking.md](request-mocking.md) |
| Managing the CLI browser session | [session-management.md](session-management.md) |
