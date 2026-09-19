# Attaching Screenshots and Videos to Pull Requests

`gh` 2.99+ uploads local images and videos with the repeatable `--attach` flag on `gh pr create`, `gh pr comment`, `gh pr edit`, `gh issue create`, `gh issue comment` and `gh issue edit`. PNG, JPEG, GIF, WebP, SVG, MP4, MOV and WebM are accepted, so `playwright-cli screenshot` and `video-start` output can be attached as is.

## Required content sensitivity gate

Before any PR/Issue media publication, either establish that the test uses only synthetic, public, non-sensitive data, or have a human/authorized agent explicitly inspect and approve each artifact for publication. Failure media can expose user/account data, session identifiers, credentials, private DOM state, and confidential console/network-visible content. No automatic redaction is provided. Publication requires this content gate, the capability gate below, and explicit publication authorization.

## Required capability gate

Media attachment is optional. Before using any `--attach` example in this Skill, run `gh --version` and inspect help for the exact operation you intend to use:

```bash
gh --version
gh pr create --help
gh pr comment --help
gh issue comment --help
```

Proceed only with GitHub CLI 2.99+ **and** `--attach` present in that exact command's help (also check the matching help for edit or issue-create operations). Version parsing alone is not sufficient.

The review reported 2.96.0; the latest check in this repository environment on 2026-09-18 detected 2.97.0. Neither provides `--attach`; all three command help checks above lacked the flag. In this environment, do not execute attachment commands. Keep screenshots/videos local under ignored `.playwright-cli/`, report that media publication was skipped because the installed GitHub CLI lacks the capability, and continue unrelated PR work. If visual evidence is mandatory and cannot be omitted, report the missing capability instead of inventing another upload mechanism. Do not install or upgrade GitHub CLI automatically.

All attachment examples below are conditional on this gate and separately authorized publication.

## When to attach

Attach visual evidence when it saves the reviewer a checkout: a screenshot of a UI fix, a before/after pair, a short video of a new user-facing flow, or the failure state when filing a bug. Skip it for refactors, backend-only changes and anything the diff already shows.

## From a local session

```bash
# capture the evidence
playwright-cli open http://localhost:3000/settings
playwright-cli screenshot --filename=.playwright-cli/settings-after.png
playwright-cli video-start .playwright-cli/settings-flow.webm
playwright-cli click e5
playwright-cli fill e7 "New name" --submit
playwright-cli video-stop

# attach when creating the PR; alt text goes after "#" (images only)
gh pr create --title "fix(settings): keep name after save" --body-file body.md \
  --attach '.playwright-cli/settings-after.png#Settings page after saving' --attach .playwright-cli/settings-flow.webm

# or comment on an existing PR / issue
gh pr comment 123 --body "Recorded the new flow end to end." --attach .playwright-cli/settings-flow.webm
gh issue comment 456 --body "Failure state after submitting the form." --attach .playwright-cli/failure.png
```

Reference the file in the body as `![alt](.playwright-cli/settings-after.png)` to place it inline and `gh` rewrites the path to the uploaded URL. Unreferenced attachments are appended at the end in flag order.

## Limits

- Images up to 10 MB, videos up to 10 MB on free plans and 100 MB on paid plans, so keep recordings short.
- Alt text is not supported on videos.
- Uploads need push access to the repository.
- Available on GitHub.com and GitHub Enterprise Cloud only.

## From CI

Do not automatically discover and publish arbitrary failure media from `test-results` into a PR. The default flow is: collect output, retain it through the repository's existing approved CI-artifact handling, and perform no automatic PR media upload. CI artifacts are not automatically safe either: respect existing access and retention controls; if storage is not approved for the content, report the limitation instead of adding an upload destination.

Resolve the config that owns the target tests and preserve its prerequisites and project selection, following [config selection](test-generation.md#11-prerequisite-workspace-and-owning-config). Replace `<selected-config>` below with the resolved runner config; do not assume the default owns v2 or other suites.

```yaml
steps:
  - run: npx playwright test --config=<selected-config>
  - name: Report local failure evidence
    if: failure()
    run: echo "Failure media remains in test-results for approved CI-artifact handling; no automatic PR upload."
```

Use the existing workflow's approved artifact collection rather than adding one from this example. The original test step keeps its failure status; do not use `continue-on-error` or override its result. No GitHub CLI installation or upgrade is performed.

A separately authorized publication step may select specific artifacts only after an explicit synthetic/public/non-sensitive guarantee or per-artifact inspection and approval, then repeat `gh --version` and the exact command's `--help` capability checks. Never treat a successful capability check as permission to publish sensitive content. For a walkthrough, [video-recording.md](video-recording.md) follows the same two gates.
