# Running Playwright Tests

Before running/debugging tests, [resolve the owning config and effective test directory](test-generation.md#11-prerequisite-workspace-and-owning-config), including its environment and prerequisites. Use `npx playwright test --config=<selected-config>`, or an existing package script verified to select that same environment. Replace placeholders with resolved paths; preserve the selected config/project through reproduction and validation. To avoid opening the interactive html report, use `PLAYWRIGHT_HTML_OPEN=never` environment variable.

```bash
# Run the requested tests under their owning config
PLAYWRIGHT_HTML_OPEN=never npx playwright test --config=<selected-config> <target-test>

# Use an existing script only after verifying its config and test scope
PLAYWRIGHT_HTML_OPEN=never npm run special-test-command
```

# Debugging Playwright Tests

To debug a failing Playwright test, run it with `--debug=cli` option. This command will pause the test at the start and print the debugging instructions.

**IMPORTANT**: run the command in the background and check the output until "Debugging Instructions" is printed. Make sure to stop the command after you have finished.

Once instructions containing a session name are printed, use `playwright-cli` to attach the session and explore the page.

```bash
# Run the test
PLAYWRIGHT_HTML_OPEN=never npx playwright test --config=<selected-config> <target-test> --debug=cli
# ...
# ... debugging instructions for "tw-abcdef" session ...
# ...

# Attach to the test
playwright-cli attach tw-abcdef
```

Keep the test running in the background while you explore and look for a fix.
The test is paused at the start, so you should step over or pause at a particular location
where the problem is most likely to be.

Every action you perform with `playwright-cli` generates corresponding Playwright TypeScript code.
This code appears in the output and can be copied directly into the test. Adapt technical locators without changing intended behavior. If observations disagree with user-visible expectations, stop that scenario and ask the user with the spec step, observed outcome and evidence; follow the [Generate/Heal authority boundary](test-generation.md#22-generate-one-scenario). Change expectations only for a user-confirmed intentional change; preserve them for a confirmed regression.

After fixing the test, stop the background test run. Rerun the target test with the same `--config` and project/environment selection to check that it passes. Treat discovery mismatches as config/path issues, not test failures.
